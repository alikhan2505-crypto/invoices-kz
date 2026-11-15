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
import { SAMPLE_DEFAULT_VAT, SAMPLE_VATS } from './sampleVat'
import AvrSample, { AvrSampleLink } from '@/app/tools/avr/AvrSample'
import KpSample, { KpSampleLink } from '@/app/tools/kp/KpSample'
import SchetSample, { SchetSampleLink } from '@/app/tools/schet/SchetSample'
import NakladnayaSample, { NakladnayaSampleLink } from '@/app/tools/nakladnaya/NakladnayaSample'
import GuideSampleDownload from '@/components/tools/GuideSampleDownload'

const ALL: SampleCtaTool[] = ['avr', 'kp', 'schet', 'nakladnaya']

const SAMPLES = { avr: AvrSample, kp: KpSample, schet: SchetSample, nakladnaya: NakladnayaSample }
const LINKS = { avr: AvrSampleLink, kp: KpSampleLink, schet: SchetSampleLink, nakladnaya: NakladnayaSampleLink }
const allFiles = () =>
  ALL.flatMap(tool => Object.values(SAMPLE_DOWNLOADS[tool]).flatMap(byVat => Object.values(byVat).map(file => ({ tool, file: file as SampleDownloadFile }))))

describe('скачать образец PDF (15.11.2026)', () => {
  it('тексты ru, en и kk без тире и эмодзи', () => {
    for (const tool of ALL) {
      for (const lang of ['ru', 'en', 'kk'] as const) {
        const d = sampleDownload(tool, lang)
        expect(d, `${tool} ${lang}`).not.toBeNull()
        for (const s of [d!.copy.button, d!.copy.link, d!.copy.hint]) {
          expect(s.length).toBeGreaterThan(0)
          expect(s).not.toMatch(/[—–]/)
          expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
        }
      }
    }
  })

  it('казахская страница: русский файл, а у КП свой казахский; подпись под кнопкой называет язык файла', () => {
    for (const tool of ['avr', 'schet', 'nakladnaya'] as const) {
      for (const vat of SAMPLE_VATS) expect(sampleDownload(tool, 'kk', vat)!.file).toBe(SAMPLE_DOWNLOADS[tool].ru[vat])
      expect(sampleDownload(tool, 'kk')!.copy.hint).toBe('PDF орыс тілінде, деректер ойдан шығарылған, тіркелусіз.')
    }
    for (const vat of SAMPLE_VATS) expect(sampleDownload('kp', 'kk', vat)!.file).toBe(SAMPLE_DOWNLOADS.kp.kk![vat])
    expect(sampleDownload('kp', 'kk')!.copy.hint).toBe('PDF қазақ тілінде, деректер ойдан шығарылған, тіркелусіз.')
    expect(sampleDownload('avr', 'kk')!.copy.button).toBe('Акт үлгісін PDF түрінде жүктеу')
  })

  it('английская страница берёт русский файл, кроме КП, у которого есть английский документ', () => {
    for (const tool of ['avr', 'schet', 'nakladnaya'] as const) {
      for (const vat of SAMPLE_VATS) expect(sampleDownload(tool, 'en', vat)!.file).toBe(SAMPLE_DOWNLOADS[tool].ru[vat])
    }
    for (const vat of SAMPLE_VATS) {
      expect(sampleDownload('kp', 'en', vat)!.file).toBe(SAMPLE_DOWNLOADS.kp.en![vat])
      expect(sampleDownload('kp', 'ru', vat)!.file).toBe(SAMPLE_DOWNLOADS.kp.ru[vat])
    }
    // Без режима НДС отдаётся тот, что показан по умолчанию.
    for (const tool of ALL) expect(sampleDownload(tool, 'ru')!.file).toBe(SAMPLE_DOWNLOADS[tool].ru[SAMPLE_DEFAULT_VAT[tool]])
  })

  it('у каждого документа два разных файла: без НДС и с НДС 16%', () => {
    for (const tool of ALL) {
      for (const byVat of Object.values(SAMPLE_DOWNLOADS[tool])) {
        expect(byVat.no_vat.href, tool).not.toBe(byVat.vat_16.href)
      }
    }
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

  it('у образца каждого инструмента кнопка скачивания стоит перед бланком, над формой есть ссылка (ru, en, kk)', () => {
    for (const tool of ALL) {
      const Sample = SAMPLES[tool]
      const Link = LINKS[tool]
      for (const lang of ['ru', 'en', 'kk'] as const) {
        const file = sampleDownload(tool, lang)!.file
        const sample = renderToStaticMarkup(createElement(Sample, { lang }))
        expect(sample, `${tool} ${lang}`).toContain(`href="${file.href}"`)
        expect(sample, `${tool} ${lang}`).toContain(`download="${file.fileName}"`)
        expect(sample.indexOf('data-testid="sample-download-sample"'), `${tool} ${lang}`).toBeLessThan(sample.indexOf('<figure'))
        const top = renderToStaticMarkup(createElement(Link, { lang }))
        expect(top, `${tool} ${lang}`).toContain(`href="${file.href}"`)
        expect(top, `${tool} ${lang}`).toContain('href="#obrazec"')
      }
    }
  })

  it('гайд про накладную З-2: кнопка со ссылкой на готовый образец на ru и kk, метка sample_guide', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('sample_guide')
    expect(parseToolEventPayload({ event: 'cta', tool: 'nakladnaya', visitor: 'a1b2c3d4-e5f6', medium: 'sample_guide' })).toMatchObject({ event: 'cta', tool: 'nakladnaya', medium: 'sample_guide' })
    for (const lang of ['ru', 'kk'] as const) {
      const html = renderToStaticMarkup(createElement(GuideSampleDownload, { lang }))
      const file = sampleDownload('nakladnaya', lang)!.file
      expect(html, lang).toContain('data-testid="guide-sample-download"')
      expect(html, lang).toContain(`href="${file.href}"`)
      expect(html, lang).toContain('data-testid="sample-download-guide"')
    }
  })
})
