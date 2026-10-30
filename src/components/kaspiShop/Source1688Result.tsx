'use client'
import type { Source1688Data } from './source1688Client'

// Результат подбора для 1688: китайские запросы со ссылками на поиск, поиск по фото, оценка веса,
// плашки рисков. Общий для окна на карточке ниши и для панели в калькуляторе маржи.

export default function Source1688Result({ data, imageUrl, onApplyWeight }: {
  data: Source1688Data
  imageUrl?: string | null
  /** Подставить оценку веса в форму (есть только в калькуляторе). */
  onApplyWeight?: (grams: number) => void
}) {
  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const
  return (
    <>
      <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>Поисковые запросы</div>
      <ul className="space-y-2 mb-4">
        {data.queries.map(q => (
          <li key={q.zh} className="rounded-xl p-3" style={{ border: '1px solid var(--nav-border)' }}>
            <div className="text-base font-semibold" lang="zh-Hans" style={{ color: 'var(--nav-text-primary)' }}>{q.zh}</div>
            {q.ru && <div className="text-[12px]" style={secondary}>{q.ru}</div>}
            <a href={q.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
              Открыть поиск на 1688 ↗
            </a>
          </li>
        ))}
      </ul>

      {imageUrl && (
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>Поиск по фото</div>
          <p className="text-[12px] mb-1" style={secondary}>
            Часто точнее слов: на 1688 (сайт или приложение) нажмите значок камеры и загрузите фото товара.
          </p>
          <a href={imageUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
            Открыть фото товара ↗
          </a>
        </div>
      )}

      {data.weightGrams !== null && (
        <div className="text-[12px] mb-3" style={secondary}>
          Оценка веса: около {data.weightGrams.toLocaleString('ru-KZ')} г вместе с упаковкой. Это догадка модели, проверьте по карточке на 1688.
          {onApplyWeight && (
            <button type="button" onClick={() => onApplyWeight(data.weightGrams as number)}
              className="ml-2 inline-flex items-center min-h-11 text-[12px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
              Подставить в калькулятор
            </button>
          )}
        </div>
      )}

      <ul className="space-y-1.5">
        {data.risks.map(r => (
          <li key={r.key} className="text-[12px] rounded-lg px-3 py-2"
            style={{ background: 'color-mix(in srgb, var(--nav-warning) 12%, transparent)', color: 'var(--nav-text-secondary)' }}>
            {r.text}
          </li>
        ))}
      </ul>
    </>
  )
}
