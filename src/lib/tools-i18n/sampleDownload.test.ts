import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Образцы тянут генераторы документов с imageResize (в node нет canvas): подмена только для загрузки модулей.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import fs from 'fs'
import path from 'path'
import { TOOL_EVENT_MEDIUMS } from '@/lib/toolEvents/schema'
import { parseToolEventPayload } from '@/lib/toolEvents/validate'
import { sampleDownload, SAMPLE_DOWNLOADS, type SampleDownloadFile } from './sampleDownload'
import type { SampleCtaTool } from './sampleCta'
import AvrSample, { AvrSampleLink } from '@/app/tools/avr/AvrSample'
import KpSample, { KpSampleLink } from '@/app/tools/kp/KpSample'
import SchetSample, { SchetSampleLink } from '@/app/tools/schet/SchetSample'
import NakladnayaSample, { NakladnayaSampleLink } from '@/app/tools/nakladnaya/NakladnayaSample'

const ALL: SampleCtaTool[] = ['avr', 'kp', 'schet', 'nakladnaya']

const SAMPLES = { avr: AvrSample, kp: KpSample, schet: SchetSample, nakladnaya: NakladnayaSample }
const LINKS = { avr: AvrSampleLink, kp: KpSampleLink, schet: SchetSampleLink, nakladnaya: NakladnayaSampleLink }
const allFiles = () => ALL.flatMap(tool => Object.values(SAMPLE_DOWNLOADS[tool]).map(file => ({ tool, file: file as SampleDownloadFile })))

describe('скачать образец PDF (15.11.2026)', () => {
  it('тексты ru и en без тире и эмодзи, для kk пока нет (ждёт вычитки)', () => {
    for (const tool of ALL) {
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

  it('английская страница берёт русский файл, кроме КП, у которого есть английский документ', () => {
    expect(sampleDownload('avr', 'en')!.file).toBe(SAMPLE_DOWNLOADS.avr.ru)
    expect(sampleDownload('schet', 'en')!.file).toBe(SAMPLE_DOWNLOADS.schet.ru)
    expect(sampleDownload('nakladnaya', 'en')!.file).toBe(SAMPLE_DOWNLOADS.nakladnaya.ru)
    expect(sampleDownload('kp', 'en')!.file).toBe(SAMPLE_DOWNLOADS.kp.en)
    expect(sampleDownload('kp', 'ru')!.file).toBe(SAMPLE_DOWNLOADS.kp.ru)
  })

  it('каждый файл из списка лежит в public, это настоящий PDF на одну страницу, пути не повторяются', () => {
    const seen = new Set<string>()
    for (const { tool, file } of allFiles()) {
      const p = path.join(process.cwd(), 'public', file.href)
      expect(fs.existsSync(p), `${tool} ${file.href}`).toBe(true)
      const buf = fs.readFileSync(p)
      expect(buf.subarray(0, 5).toString('latin1'), tool).toBe('%PDF-')
      expect(buf.length, tool).toBeGreaterThan(5000)
      expect(buf.length, tool).toBeLessThan(2_000_000)
      // Число страниц: объекты /Type /Page (без /Pages). Образец обязан умещаться на одном листе.
      const pages = (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length
      expect(pages, `${tool} ${file.href}: страниц`).toBe(1)
      expect(file.href, tool).toMatch(/^\/samples\/[a-z0-9-]+\.pdf$/)
      expect(file.fileName, tool).toMatch(/^[a-z0-9-]+\.pdf$/)
      expect(seen.has(file.href), file.href).toBe(false)
      seen.add(file.href)
    }
  })

  it('метка sample_download входит в словарь и принимается сервером', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('sample_download')
    for (const tool of ALL) {
      const row = parseToolEventPayload({ event: 'cta', tool, visitor: 'a1b2c3d4-e5f6', medium: 'sample_download' })
      expect(row).toMatchObject({ event: 'cta', tool, medium: 'sample_download' })
    }
  })

  it('у образца каждого инструмента кнопка скачивания стоит перед бланком, над формой есть ссылка (ru, en), на kk их нет', () => {
    for (const tool of ALL) {
      const Sample = SAMPLES[tool]
      const Link = LINKS[tool]
      for (const lang of ['ru', 'en'] as const) {
        const file = sampleDownload(tool, lang)!.file
        const sample = renderToStaticMarkup(createElement(Sample, { lang }))
        expect(sample, `${tool} ${lang}`).toContain(`href="${file.href}"`)
        expect(sample, `${tool} ${lang}`).toContain(`download="${file.fileName}"`)
        expect(sample.indexOf('data-testid="sample-download-sample"'), `${tool} ${lang}`).toBeLessThan(sample.indexOf('<figure'))
        const top = renderToStaticMarkup(createElement(Link, { lang }))
        expect(top, `${tool} ${lang}`).toContain(`href="${file.href}"`)
        expect(top, `${tool} ${lang}`).toContain('href="#obrazec"')
      }
      expect(renderToStaticMarkup(createElement(Sample, { lang: 'kk' })), `${tool} kk`).not.toContain('/samples/')
      expect(renderToStaticMarkup(createElement(Link, { lang: 'kk' })), `${tool} kk`).not.toContain('/samples/')
    }
  })
})
