'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Source1688Result from './Source1688Result'
import { fetchSource1688, useSource1688Access, type Source1688Phase, type Source1688Product } from './source1688Client'

export type { Source1688Product }

// «Найти на 1688» на карточке товара в «Нишах» (этап 0, 30.10.2026): открывает окно с китайскими
// запросами для 1688, оценкой веса, плашками рисков и ссылкой в калькулятор маржи. Ничего с 1688
// не получает, это только ссылки и подсказки. Пока включён админ-гейт (source1688.ts) кнопку
// видит только админ: чтобы не тащить флаг через все таблицы страницы, кнопка сама спрашивает
// профиль один раз на вкладку (source1688Client.ts).

function Dialog({ product, onClose }: { product: Source1688Product; onClose: () => void }) {
  const [phase, setPhase] = useState<Source1688Phase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void fetchSource1688(product).then(p => { if (!cancelled) setPhase(p) })
    return () => { cancelled = true }
  }, [product])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,12,28,0.55)' }}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="s1688-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: 'var(--nav-surface-chrome)', border: '1px solid var(--nav-border)', boxShadow: 'var(--nav-card-glow)' }}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="s1688-title" className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>Найти на 1688</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" autoFocus
            className="min-w-11 min-h-11 -mt-2 -mr-2 text-xl leading-none" style={{ color: 'var(--nav-text-muted)' }}>×</button>
        </div>
        <p className="text-[13px] mb-4 line-clamp-2" style={{ color: 'var(--nav-text-secondary)' }}>{product.name} · {product.price.toLocaleString('ru-KZ')} ₸ на Kaspi</p>

        {phase.kind === 'loading' && <p className="text-sm py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }} role="status">Подбираю запросы на китайском…</p>}
        {phase.kind === 'error' && <p className="text-sm py-3" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</p>}
        {phase.kind === 'done' && (
          <>
            <Source1688Result data={phase.data} imageUrl={product.imageUrl} />
            <a href={phase.data.marginHref}
              className="mt-4 inline-flex items-center justify-center rounded-xl px-5 py-2.5 min-h-11 text-sm font-semibold"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              Посчитать маржу
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function Source1688Button({ product }: { product: Source1688Product }) {
  const allowed = useSource1688Access()
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <>
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}
        aria-label={`Найти на 1688: ${product.name}`}
      >
        1688
      </button>
      {open && typeof document !== 'undefined' && createPortal(<Dialog product={product} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
