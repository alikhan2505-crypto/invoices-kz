import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Образцы тянут генераторы документов с imageResize (в node нет canvas): подмена только для загрузки модулей.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import fs from 'fs'
import path from 'path'
import { TOOL_EVENT_MEDIUMS } from '@/lib/toolEvents/schema'
import { parseToolEventPayload } from '@/lib/toolEvents/validate'
import { sampleDownload, SAMPLE_DOWNLOADS } from './sampleDownload'
import type { SampleCtaTool } from './sampleCta'
import AvrSample, { AvrSampleLink } from '@/app/tools/avr/AvrSample'

const ALL: SampleCtaTool[] = ['avr', 'kp', 'schet', 'nakladnaya']

describe('скачать образец PDF (15.11.2026)', () => {
  it('тексты ru и en без тире и эмодзи, для kk пока нет (ждёт вычитки)', () => {
    for (const tool of Object.keys(SAMPLE_DOWNLOADS) as SampleCtaTool[]) {
      for (const lang of ['ru', 'en'] as const) {
        const d = sampleDownload(tool, lang)
        expect(d, `${tool} ${lang}`).not.toBeNull()
        for (const s of [d!.copy.button, d!.copy.link, d!.copy.hint]) {
          expect(s.length).toBeGreaterThan(0)
          expect(s).not.toMatch(/[—–]/)
          expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
        }
      }
      expect(sampleDownload(tool, 'kk'), `${tool} kk`).toBeNull()
    }
  })

  it('инструмент без готового файла кнопку не получает', () => {
    for (const tool of ALL) {
      if (!SAMPLE_DOWNLOADS[tool]) expect(sampleDownload(tool, 'ru')).toBeNull()
    }
  })

  it('каждый файл из списка лежит в public и это настоящий PDF', () => {
    for (const [tool, file] of Object.entries(SAMPLE_DOWNLOADS)) {
      const p = path.join(process.cwd(), 'public', file!.href)
      expect(fs.existsSync(p), tool).toBe(true)
      const buf = fs.readFileSync(p)
      expect(buf.subarray(0, 5).toString('latin1'), tool).toBe('%PDF-')
      expect(buf.length, tool).toBeGreaterThan(5000)
      expect(buf.length, tool).toBeLessThan(2_000_000)
      expect(file!.href, tool).toMatch(/^\/samples\/[a-z0-9-]+\.pdf$/)
      expect(file!.fileName, tool).toMatch(/^[a-z0-9-]+\.pdf$/)
    }
  })

  it('метка sample_download входит в словарь и принимается сервером', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('sample_download')
    const row = parseToolEventPayload({ event: 'cta', tool: 'avr', visitor: 'a1b2c3d4-e5f6', medium: 'sample_download' })
    expect(row).toMatchObject({ event: 'cta', tool: 'avr', medium: 'sample_download' })
  })

  it('на странице акта кнопка у образца и ссылка над формой скачивают файл (ru, en), на kk их нет', () => {
    const file = SAMPLE_DOWNLOADS.avr!
    for (const lang of ['ru', 'en'] as const) {
      const sample = renderToStaticMarkup(createElement(AvrSample, { lang }))
      expect(sample, lang).toContain(`href="${file.href}"`)
      expect(sample, lang).toContain(`download="${file.fileName}"`)
      expect(sample.indexOf('data-testid="sample-download-sample"'), lang).toBeLessThan(sample.indexOf('<figure'))
      const top = renderToStaticMarkup(createElement(AvrSampleLink, { lang }))
      expect(top, lang).toContain(`href="${file.href}"`)
      expect(top, lang).toContain('href="#obrazec"')
    }
    expect(renderToStaticMarkup(createElement(AvrSample, { lang: 'kk' }))).not.toContain('/samples/')
    expect(renderToStaticMarkup(createElement(AvrSampleLink, { lang: 'kk' }))).not.toContain('/samples/')
  })
})
