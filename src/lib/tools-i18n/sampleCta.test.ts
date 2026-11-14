import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { vi } from 'vitest'

// Образцы тянут генераторы документов с imageResize (в node нет canvas): подмена только для загрузки модулей.
vi.mock('@/lib/imageResize', () => ({ resizeToFit: async (url: string) => url }))

import fs from 'fs'
import path from 'path'
import { TOOL_EVENT_MEDIUMS } from '@/lib/toolEvents/schema'
import { parseToolEventPayload } from '@/lib/toolEvents/validate'
import { sampleCtaCopy, SAMPLE_CTA_TARGET_ID, type SampleCtaTool } from './sampleCta'
import AvrSample from '@/app/tools/avr/AvrSample'
import KpSample from '@/app/tools/kp/KpSample'
import SchetSample from '@/app/tools/schet/SchetSample'
import NakladnayaSample from '@/app/tools/nakladnaya/NakladnayaSample'

const TOOLS: SampleCtaTool[] = ['avr', 'kp', 'schet', 'nakladnaya']
const SAMPLES = { avr: AvrSample, kp: KpSample, schet: SchetSample, nakladnaya: NakladnayaSample }
const FORM_FILES = { avr: 'avr/AvrTool.tsx', kp: 'kp/KpTool.tsx', schet: 'schet/SchetTool.tsx', nakladnaya: 'nakladnaya/NakladnayaTool.tsx' }

describe('кнопка под образцом (14.11.2026)', () => {
  it('тексты ru, en и kk есть, без тире и эмодзи', () => {
    for (const tool of TOOLS) {
      for (const lang of ['ru', 'en', 'kk'] as const) {
        const c = sampleCtaCopy(tool, lang)
        expect(c, `${tool} ${lang}`).not.toBeNull()
        for (const s of [c!.title, c!.body, c!.button]) {
          expect(s.length).toBeGreaterThan(0)
          expect(s).not.toMatch(/[—–]/)
          expect(s).not.toMatch(/\p{Extended_Pictographic}/u)
        }
      }
    }
  })

  it('метка sample_form входит в словарь и принимается сервером', () => {
    expect(TOOL_EVENT_MEDIUMS).toContain('sample_form')
    for (const tool of TOOLS) {
      const row = parseToolEventPayload({ event: 'cta', tool, visitor: 'a1b2c3d4-e5f6', medium: 'sample_form' })
      expect(row).toMatchObject({ event: 'cta', tool, medium: 'sample_form' })
    }
  })

  it('на ru, en и kk блок стоит после образца', () => {
    for (const tool of TOOLS) {
      const S = SAMPLES[tool]
      const ru = renderToStaticMarkup(createElement(S, { lang: 'ru' }))
      const en = renderToStaticMarkup(createElement(S, { lang: 'en' }))
      const kk = renderToStaticMarkup(createElement(S, { lang: 'kk' }))
      expect(ru, tool).toContain('data-testid="tool-sample-cta"')
      expect(ru.indexOf('</section>'), tool).toBeLessThan(ru.indexOf('tool-sample-cta'))
      expect(en, tool).toContain('data-testid="tool-sample-cta"')
      expect(kk, tool).toContain('data-testid="tool-sample-cta"')
      expect(kk.indexOf('</section>'), tool).toBeLessThan(kk.indexOf('tool-sample-cta'))
    }
  })

  it('поле, куда ставится курсор, существует в форме каждого инструмента', () => {
    for (const tool of TOOLS) {
      const src = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'tools', FORM_FILES[tool]), 'utf8')
      expect(src, tool).toContain(`id="${SAMPLE_CTA_TARGET_ID[tool]}"`)
    }
  })
})
