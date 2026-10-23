import Link from 'next/link'
import type { SampleCopy, SampleDoc } from '@/lib/tools-i18n/toolSample'

// Блок «Образец» под формой бесплатного инструмента /tools: вымышленный, но
// правдоподобный документ обычным HTML (таблицы и текст, не картинка), чтобы он
// попадал в индекс и в ответы ИИ-поиска. Серверный компонент — без хуков и без
// 'use client'; клиентский инструмент получает его как children и поэтому не
// тащит в браузерный бандл. Цвета — только CSS-переменные --nav-*, поэтому
// светлая и тёмная темы работают сами.
//
// Переиспользуется для АВР, накладной и КП: меняются только doc (содержимое
// бланка) и copy (тексты на языке страницы). Данные в doc обязаны быть
// вымышленными — см. src/lib/tools-i18n/toolSample.ts.

interface Props {
  /** Префикс id для aria-labelledby; уникален на странице. */
  idPrefix: string
  copy: SampleCopy
  doc: SampleDoc
  /** Язык самого бланка (атрибут lang у документа); сейчас бланки русские. */
  docLang?: string
  /** Ссылка на гайд под списком пунктов. */
  guide?: { href: string; label: string }
}

const cellBorder = '1px solid var(--nav-border)'

// Подсказка «есть ещё контент справа/слева» без JS: тень у края видна, пока
// там есть что прокручивать (приём scroll-shadows). Крышки «local» закрашены
// непрозрачным --nav-surface-chrome и скрывают тень, когда край достигнут.
const SHADOW = 'color-mix(in srgb, var(--nav-text-muted) 45%, transparent)'
const SCROLL_SHADOW_BG = [
  'linear-gradient(to right, var(--nav-surface-chrome) 30%, transparent) left center / 28px 100% no-repeat local',
  'linear-gradient(to left, var(--nav-surface-chrome) 30%, transparent) right center / 28px 100% no-repeat local',
  `linear-gradient(to right, ${SHADOW}, transparent) left center / 14px 100% no-repeat scroll`,
  `linear-gradient(to left, ${SHADOW}, transparent) right center / 14px 100% no-repeat scroll`,
  'var(--nav-surface-chrome)',
].join(', ')

export default function ToolSample({ idPrefix, copy, doc, docLang = 'ru', guide }: Props) {
  const headingId = `${idPrefix}-heading`
  const right = new Set(doc.rightAlignedColumns)

  return (
    <section className="nav-glass rounded-2xl p-5 mt-6" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
        {copy.heading}
      </h2>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{copy.intro}</p>

      <div className="text-[13px] font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>{copy.pointsTitle}</div>
      <ul className="list-disc pl-5 text-[13px] space-y-1 mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        {copy.points.map(p => <li key={p}>{p}</li>)}
      </ul>
      {guide && (
        <Link href={guide.href} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
          {guide.label}
        </Link>
      )}

      <figure className="relative mt-6 mb-0 mx-0">
        <span
          className="absolute -top-3 left-3 z-10 rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
        >
          {copy.ribbon}
        </span>
        {/* Прокручиваемая область: на 390px бланк шире экрана и листается по горизонтали, страница — нет. */}
        <div
          role="region"
          aria-label={copy.scrollLabel}
          tabIndex={0}
          className="overflow-x-auto rounded-xl"
          style={{ border: '1px dashed var(--nav-border)', background: SCROLL_SHADOW_BG }}
        >
          <div lang={docLang} className="min-w-[560px] p-4 pt-6 text-[12px] leading-snug" style={{ color: 'var(--nav-text-primary)' }}>
            <div className="text-[10px] font-bold mb-1">{doc.bankCaption}</div>
            <table className="w-full mb-4" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {doc.bankRows.map((row, i) => (
                  <tr key={i}>
                    {row.map(cell => (
                      <td key={cell.label} className="px-2 py-1.5 align-top" style={{ border: cellBorder, textAlign: cell.center ? 'center' : 'left' }}>
                        <b>{cell.label}</b>
                        <br />
                        {cell.value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-[14px] font-bold mb-2">{doc.title}</div>
            <dl className="mb-3 grid grid-cols-[84px_1fr] gap-x-2 gap-y-1">
              {doc.parties.map(p => (
                <div key={p.label} className="contents">
                  <dt className="font-bold">{p.label}</dt>
                  <dd className="m-0">{p.value}</dd>
                </div>
              ))}
            </dl>

            <table className="w-full mb-3" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {doc.columns.map(c => (
                    <th key={c} scope="col" className="px-1.5 py-1 font-bold text-center" style={{ border: cellBorder, background: 'var(--nav-accent-soft)' }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.rows.map((row, i) => (
                  <tr key={i}>
                    {row.cells.map((cell, j) => (
                      <td
                        key={j}
                        className="px-1.5 py-1"
                        style={{ border: cellBorder, textAlign: j === doc.nameColumn ? 'left' : right.has(j) ? 'right' : 'center' }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-8 mb-2">
              <div className="text-right" style={{ color: 'var(--nav-text-secondary)' }}>
                {doc.totals.map(t => <div key={t.label}>{t.label}</div>)}
              </div>
              <div className="text-right font-bold min-w-[96px]">
                {doc.totals.map(t => <div key={t.label}>{t.value}</div>)}
              </div>
            </div>

            <div className="font-bold mb-3">
              {doc.summaryLines.map(l => <div key={l}>{l}</div>)}
            </div>

            <div className="flex items-end gap-1 pt-4" style={{ borderTop: cellBorder }}>
              <span className="whitespace-nowrap">{doc.signatureLabel}</span>
              <span className="flex-1 min-w-[120px]" style={{ borderBottom: '1px solid var(--nav-text-muted)' }} aria-hidden="true" />
              <span className="whitespace-nowrap">/ {doc.signatureName}</span>
            </div>
          </div>
        </div>
        <figcaption className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>{copy.caption}</figcaption>
      </figure>
    </section>
  )
}
