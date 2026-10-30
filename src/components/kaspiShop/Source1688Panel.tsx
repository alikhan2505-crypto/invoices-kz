'use client'
import { useState } from 'react'
import Source1688Result from './Source1688Result'
import { fetchSource1688, useSource1688Access, type Source1688Phase, type Source1688Product } from './source1688Client'

// Панель «Найти на 1688» внизу калькулятора маржи (30.10.2026): продавец выбрал товар из топа продаж
// или ввёл свой, нажал кнопку и видит запросы, оценку веса и риски (этап 0: ссылки на поиск 1688;
// карточки поставщиков с ценами появятся, когда подключим источник данных). Пока включён
// админ-гейт панель видит только админ.

export default function Source1688Panel({ product, onApplyWeight }: {
  /** null или без названия = кнопка неактивна. */
  product: Source1688Product | null
  onApplyWeight: (grams: number) => void
}) {
  const allowed = useSource1688Access()
  // Результат привязан к названию: выбрали другой товар, и прошлый результат уже не показывается.
  const [res, setRes] = useState<{ name: string; phase: Source1688Phase }>({ name: '', phase: { kind: 'idle' } })
  const name = product?.name ?? ''
  const phase: Source1688Phase = res.name === name ? res.phase : { kind: 'idle' }

  if (!allowed) return null

  const ready = !!product && product.name.trim().length >= 3
  const run = async () => {
    if (!product || !ready) return
    setRes({ name: product.name, phase: { kind: 'loading' } })
    const done = await fetchSource1688(product)
    setRes({ name: product.name, phase: done })
  }

  return (
    <section className="nav-glass rounded-2xl p-5 mt-4" aria-labelledby="s1688-panel-title">
      <h2 id="s1688-panel-title" className="text-base font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Найти на 1688</h2>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        Подберём запросы на китайском для поиска такого же товара у поставщика и оценим вес для доставки.
      </p>
      <button type="button" onClick={run} disabled={!ready || phase.kind === 'loading'}
        className="rounded-xl px-5 py-2.5 min-h-11 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
        {phase.kind === 'loading' ? 'Подбираю…' : 'Найти на 1688'}
      </button>
      {!ready && <span className="ml-3 text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>Сначала выберите товар или введите название</span>}

      <div className="mt-4" aria-live="polite">
        {phase.kind === 'error' && <p className="text-sm" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</p>}
        {phase.kind === 'done' && <Source1688Result data={phase.data} imageUrl={product?.imageUrl} onApplyWeight={onApplyWeight} />}
      </div>
    </section>
  )
}
