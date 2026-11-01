'use client'
import { useRef, useState } from 'react'
import Source1688Result from './Source1688Result'
import type { AppliedSupplier } from './MicSuppliers'
import { fetchSource1688, useSource1688Access, type Source1688Phase, type Source1688Product } from './source1688Client'

// Панель «Найти на 1688» внизу калькулятора маржи (30.10.2026): продавец выбрал товар из топа продаж
// или ввёл свой, нажал кнопку и видит запросы, оценку веса и риски. С 31.10.2026 ещё товары с
// Made-in-China.com (фото, цены, партии): 1688 отдаёт серверу капчу, поэтому карточек 1688 нет.
// Пока включён админ-гейт панель видит только админ.

export default function Source1688Panel({ product, onApplyWeight, onApplySupplier }: {
  /** null или без названия = кнопка неактивна. */
  product: Source1688Product | null
  onApplyWeight: (grams: number) => void
  onApplySupplier: (p: AppliedSupplier) => void
}) {
  const allowed = useSource1688Access()
  // Результат привязан к названию: выбрали другой товар, и прошлый результат уже не показывается.
  const [res, setRes] = useState<{ name: string; phase: Source1688Phase }>({ name: '', phase: { kind: 'idle' } })
  const [applied, setApplied] = useState<{ name: string; text: string } | null>(null)
  // Номер последнего запроса: поздний ответ на прошлый товар не затирает свежий результат.
  const seq = useRef(0)
  const name = product?.name ?? ''
  const phase: Source1688Phase = res.name === name ? res.phase : { kind: 'idle' }

  if (!allowed) return null

  const ready = !!product && product.name.trim().length >= 3
  const run = async () => {
    if (!product || !ready) return
    const mine = ++seq.current
    setApplied(null)
    setRes({ name: product.name, phase: { kind: 'loading' } })
    const done = await fetchSource1688(product)
    if (mine === seq.current) setRes({ name: product.name, phase: done })
  }

  const apply = (p: AppliedSupplier) => {
    onApplySupplier(p)
    // Поля калькулятора выше панели: подводим человека к цене, чтобы он увидел, что подставилось.
    const field = document.getElementById('margin-sourcing-price')
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    field?.focus({ preventScroll: true })
    setApplied({
      name,
      text: p.source === '1688'
        ? `Подставлено в «Цена у поставщика»: ${p.priceKzt.toLocaleString('ru-KZ')} ₸ за единицу (цена 1688 при заказе от минимальной партии, без доставки, пошлины и НДС). `
          + 'Проверьте партию и цену в карточке товара. Ссылка на товар записана в поле «Ссылка на товар у поставщика» выше, оба поля можно поправить.'
        : `Подставлено в «Цена у поставщика»: ${p.priceKzt.toLocaleString('ru-KZ')} ₸ за единицу (верхняя граница, экспортная цена без доставки, пошлины и НДС)`
          + `${p.moq ? `, минимальная партия ${p.moq}` : ''}. Ссылка на товар записана в поле «Ссылка на товар у поставщика» выше, оба поля можно поправить.`,
    })
  }

  return (
    <section className="nav-glass rounded-2xl p-5 mt-4" aria-labelledby="s1688-panel-title">
      <h2 id="s1688-panel-title" className="text-base font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Найти на 1688</h2>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        Подберём запросы на китайском для поиска такого же товара у поставщика, оценим вес для доставки и покажем похожие товары с Made-in-China.
      </p>
      <button type="button" onClick={run} disabled={!ready || phase.kind === 'loading'}
        className="rounded-xl px-5 py-2.5 min-h-11 text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
        {phase.kind === 'loading' ? 'Подбираю и ищу товары…' : 'Найти на 1688'}
      </button>
      {!ready && <span className="ml-3 text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>Сначала выберите товар или введите название</span>}
      {phase.kind === 'loading' && <span className="ml-3 text-[12px]" style={{ color: 'var(--nav-text-muted)' }}>Это занимает до 15 секунд</span>}

      <div className="mt-4">
        {phase.kind === 'error' && <p className="text-sm" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</p>}
        {applied && applied.name === name && (
          <p className="text-[12px] rounded-lg px-3 py-2 mb-3" role="status"
            style={{ background: 'color-mix(in srgb, var(--nav-success) 12%, transparent)', color: 'var(--nav-text-secondary)' }}>
            {applied.text}
          </p>
        )}
        {phase.kind === 'done' && <Source1688Result data={phase.data} imageUrl={product?.imageUrl} onApplyWeight={onApplyWeight} onApplySupplier={apply} />}
      </div>
    </section>
  )
}
