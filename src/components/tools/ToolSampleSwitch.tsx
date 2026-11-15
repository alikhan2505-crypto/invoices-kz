'use client'
import { useState } from 'react'
import { track } from '@vercel/analytics'
import ToolSample from '@/components/tools/ToolSample'
import SampleDownloadLink from '@/components/tools/SampleDownloadLink'
import type { ToolLang } from '@/lib/tools-i18n'
import type { SampleCtaTool } from '@/lib/tools-i18n/sampleCta'
import { sampleDownload } from '@/lib/tools-i18n/sampleDownload'
import { SAMPLE_DEFAULT_VAT, SAMPLE_VATS, type SampleVat } from '@/lib/tools-i18n/sampleVat'
import type { SampleCopy, SampleDoc } from '@/lib/tools-i18n/toolSample'

// Блок «Образец» с переключателем «Без НДС / С НДС 16%» (15.11.2026). Меняет и
// таблицу образца на странице, и PDF, который скачивается кнопкой рядом: файл
// всегда совпадает с показанным. Сразу показан режим по умолчанию (SAMPLE_DEFAULT_VAT),
// он же попадает в серверный HTML для поисковика; клиентский компонент тоже
// рендерится на сервере, так что текст образца в HTML остаётся.
//
// Подписи кнопок переключателя - слова из словаря инструмента (vatOptions): те же,
// что в списке «НДС» формы, на казахском они уже вычитаны, новых текстов нет.

interface Props {
  tool: SampleCtaTool
  lang: ToolLang
  idPrefix: string
  id?: string
  copy: SampleCopy
  /** Содержимое образца в обоих режимах НДС. */
  docs: Record<SampleVat, SampleDoc>
  docLang?: string
  guide?: { href: string; label: string }
  /** Подписи кнопок: vatOptions словаря инструмента. */
  labels: Record<SampleVat, string>
}

export default function ToolSampleSwitch({ tool, lang, idPrefix, id, copy, docs, docLang, guide, labels }: Props) {
  const [vat, setVat] = useState<SampleVat>(SAMPLE_DEFAULT_VAT[tool])
  const dl = sampleDownload(tool, lang, vat)
  const pick = (next: SampleVat) => {
    if (next === vat) return
    setVat(next)
    track('tool_sample_vat_toggle', { source: tool, lang, vat: next })
  }
  return (
    <ToolSample
      id={id}
      idPrefix={idPrefix}
      copy={copy}
      doc={docs[vat]}
      docLang={docLang}
      guide={guide}
      download={(
        <div className="mt-5 flex flex-col items-start gap-3">
          <div
            role="group"
            aria-labelledby={`${idPrefix}-heading`}
            className="inline-flex rounded-xl p-1 gap-1"
            style={{ border: '1px solid var(--nav-border)', background: 'var(--nav-surface-chrome)' }}
            data-testid="sample-vat-switch"
          >
            {SAMPLE_VATS.map(v => {
              const on = v === vat
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  data-testid={`sample-vat-${v}`}
                  onClick={() => pick(v)}
                  className="min-h-11 rounded-lg px-4 text-sm font-semibold"
                  style={{
                    background: on ? 'var(--nav-accent)' : 'transparent',
                    color: on ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                    touchAction: 'manipulation',
                  }}
                >
                  {labels[v]}
                </button>
              )
            })}
          </div>
          {dl && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SampleDownloadLink tool={tool} lang={lang} file={dl.file} label={dl.copy.button} variant="button" place="sample" />
              <span className="text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>{dl.copy.hint}</span>
            </div>
          )}
        </div>
      )}
    />
  )
}
