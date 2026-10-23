import { describe, it, expect, afterAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
// require() не запускает main(): запуск только при `require.main === module`.
const script = require('./send-reel-draft.cjs') as {
  parseArgs: (argv: string[]) => { flags: Record<string, string | boolean>; positional: string[] }
  loadEnv: (file: string) => Record<string, string>
  checkVideo: (file: string, probe?: (f: string) => unknown) => { errors: string[]; warnings: string[]; info: any }
  safeName: (file: string, ext: string) => string
  MAX_BYTES: number
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-script-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

function tmpFile(name: string, bytes = 1024) {
  const f = path.join(dir, name)
  fs.writeFileSync(f, Buffer.alloc(bytes))
  return f
}

const goodProbe = {
  streams: [
    { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1080, height: 1920, avg_frame_rate: '30/1' },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
  format: { duration: '30.0' },
}
const probeOf = (over: { video?: object; duration?: string; noVideo?: boolean }) => () => ({
  streams: over.noVideo ? [goodProbe.streams[1]] : [{ ...goodProbe.streams[0], ...over.video }, goodProbe.streams[1]],
  format: { duration: over.duration ?? goodProbe.format.duration },
})

describe('send-reel-draft: guards', () => {
  it('importing the module does not run main()', () => {
    expect(typeof script.checkVideo).toBe('function')
  })

  it('accepts a good 9:16 h264 30 s mp4', () => {
    const r = script.checkVideo(tmpFile('ok.mp4'), probeOf({}))
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('rejects a non-mp4 extension and an empty file', () => {
    expect(script.checkVideo(tmpFile('a.mov'), probeOf({})).errors.join()).toContain('.mp4')
    expect(script.checkVideo(tmpFile('empty.mp4', 0), probeOf({})).errors.join()).toContain('пустой')
  })

  it('rejects an oversize file (> 100 MB)', () => {
    const f = path.join(dir, 'big.mp4')
    fs.closeSync(fs.openSync(f, 'w'))
    fs.truncateSync(f, script.MAX_BYTES + 1) // разреженный файл, места не занимает
    expect(script.checkVideo(f, probeOf({})).errors.join()).toContain('лимит')
  })

  it('rejects a duration over 90 s and under 3 s', () => {
    const f = tmpFile('dur.mp4')
    expect(script.checkVideo(f, probeOf({ duration: '91' })).errors.join()).toContain('лимит скрипта')
    expect(script.checkVideo(f, probeOf({ duration: '2' })).errors.join()).toContain('от 3')
  })

  it('rejects a non-h264 codec and a file without video', () => {
    const f = tmpFile('codec.mp4')
    expect(script.checkVideo(f, probeOf({ video: { codec_name: 'hevc' } })).errors.join()).toContain('h264')
    expect(script.checkVideo(f, probeOf({ noVideo: true })).errors.join()).toContain('нет видеодорожки')
  })

  it('warns (does not fail) when ffprobe is unavailable', () => {
    const r = script.checkVideo(tmpFile('noprobe.mp4'), () => null)
    expect(r.errors).toEqual([])
    expect(r.warnings.join()).toContain('НЕ проверены')
  })

  it('warns on odd aspect ratio, pix_fmt and fps', () => {
    const r = script.checkVideo(
      tmpFile('warn.mp4'),
      probeOf({ video: { width: 1920, height: 1080, pix_fmt: 'yuv444p', avg_frame_rate: '15/1' } }),
    )
    expect(r.errors).toEqual([])
    expect(r.warnings.length).toBe(3)
  })
})

describe('send-reel-draft: helpers', () => {
  it('safeName puts files under reels/ with a sanitized name', () => {
    const n = script.safeName('C:/x/Мой Ролик #1.MP4', '.mp4')
    expect(n).toMatch(/^reels\/\d+-[a-z0-9-]+\.mp4$/)
    expect(script.safeName('C:/x/Привет.mp4', '.mp4')).toMatch(/^reels\/\d+-reel\.mp4$/)
  })

  it('parseArgs reads value flags, boolean flags and the positional file', () => {
    const a = script.parseArgs(['v.mp4', '--caption-file', 'c.txt', '--dry-run', '--no-feed'])
    expect(a.positional).toEqual(['v.mp4'])
    expect(a.flags['caption-file']).toBe('c.txt')
    expect(a.flags['dry-run']).toBe(true)
    expect(a.flags['no-feed']).toBe(true)
  })

  it('loadEnv parses quoted values and skips comments', () => {
    const f = path.join(dir, 'env')
    fs.writeFileSync(f, '# c\nA="x y"\nB=z=1\n\n')
    expect(script.loadEnv(f)).toEqual({ A: 'x y', B: 'z=1' })
    expect(script.loadEnv(path.join(dir, 'missing'))).toEqual({})
  })
})
