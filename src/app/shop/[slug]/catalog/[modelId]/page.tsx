'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import WholesaleCartBar from '@/components/kaspiShop/WholesaleCartBar'
import { useWholesaleCart } from '@/lib/kaspiShop/useWholesaleCart'
import { StorefrontLangSwitch, StorefrontStatus, useStorefrontT } from '@/components/shop/StorefrontChrome'
import { formatStorefrontPrice as formatPrice } from '@/lib/i18n/storefront'
import { ProductPhoto } from '@/components/shop/StorefrontParts'
import { STOREFRONT_WRAP } from '@/lib/storefrontLayout'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }

export default function WholesaleModelPage() {
  const params = useParams<{ slug: string; modelId: string }>()
  const cart = useWholesaleCart(params.slug)
  const t = useStorefrontT()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [model, setModel] = useState<Model | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}/wholesale`)
      .then(r => r.json())
      .then(data => {
        // Seller's Pro lapsed -- same neutral state as the catalog page.
        if (data.error === 'unavailable') { setUnavailable(true); return }
        const found: Model | undefined = (data.models || []).find((m: Model) => m.id === params.modelId)
        if (!found) { setNotFound(true); return }
        setModel(found)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug, params.modelId])

  const colors = useMemo(() => Array.from(new Set((model?.variants || []).map(v => v.color))), [model])
  const sizesForColor = useMemo(
    () => (model?.variants || []).filter(v => v.color === selectedColor),
    [model, selectedColor]
  )
  const selectedVariant = useMemo(
    () => sizesForColor.find(v => v.size === selectedSize) || null,
    [sizesForColor, selectedSize]
  )

  useEffect(() => {
    if (colors.length > 0 && selectedColor === null) setSelectedColor(colors[0])
  }, [colors, selectedColor])

  useEffect(() => {
    setSelectedSize(null)
  }, [selectedColor])

  if (loading) return <StorefrontStatus text={t.loading} />
  if (unavailable) return <StorefrontStatus text={t.unavailable} hint={t.unavailableHint} />
  if (notFound || !model) return <StorefrontStatus text={t.modelNotFound} />

  const inStock = selectedVariant && selectedVariant.stockCount !== null && selectedVariant.stockCount > 0
  const isCustomOrder = !!selectedVariant && !inStock

  function addToCart() {
    if (!model || !selectedVariant) return
    cart.addLine({
      key: `${model.id}:${selectedVariant.size}:${selectedVariant.color}`,
      modelId: model.id,
      modelName: model.name,
      size: selectedVariant.size,
      color: selectedVariant.color,
      price: model.price,
      imageUrl: model.imageUrl,
      qty: 1,
      customOrder: isCustomOrder,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className={`${STOREFRONT_WRAP} pb-32 lg:pb-32`}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <a href={`/shop/${params.slug}/catalog`} className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.backToCatalog}</a>
          <StorefrontLangSwitch />
        </div>

        {/* С lg: фото слева (квадрат, 520 px), покупка справа на всю остальную
            ширину; карточка покупки по высоте содержимого (без пустой полосы над кнопкой). */}
        <div className="lg:grid lg:grid-cols-2 xl:grid-cols-[520px_minmax(0,1fr)] lg:gap-6 lg:items-start">
          <div className="rounded-2xl overflow-hidden mb-4 lg:mb-0 lg:self-start lg:sticky lg:top-6">
            <ProductPhoto src={model.imageUrl} name={model.name} />
          </div>

          <div className="lg:rounded-2xl lg:p-6 lg:flex lg:flex-col lg:border lg:border-[color:var(--nav-border-soft)] lg:bg-[var(--nav-surface-chrome)] lg:shadow-[var(--nav-card-glow)]">
            <div className="lg:mb-2">
            <h1 className="text-xl lg:text-2xl font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{model.name}</h1>
            <div className="text-lg lg:text-xl font-bold mb-4" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(model.price)}</div>
            </div>

            <div className="2xl:grid 2xl:grid-cols-2 2xl:gap-x-10 2xl:items-start">
            <div>
            {colors.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.color}</div>
                <div className="flex flex-wrap gap-2">
                  {colors.map(c => (
                    <button key={c} onClick={() => setSelectedColor(c)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: selectedColor === c ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: selectedColor === c ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sizesForColor.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.size}</div>
                <div className="flex flex-wrap gap-2">
                  {sizesForColor.map(v => (
                    <button key={v.size} onClick={() => setSelectedSize(v.size)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: selectedSize === v.size ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: selectedSize === v.size ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {v.size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedVariant && (
              <div className="mb-4 text-sm" style={{ color: inStock ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>
                {inStock ? t.inStock(selectedVariant.stockCount ?? 0) : t.customOrderAvailable}
              </div>
            )}

            </div>

            {/* Наличие по всем вариантам: только на десктопе, где рядом с фото есть место.
                Данные те же, что у кнопок выше (цвет, размер, остаток), ничего не придумано. */}
            {(model.variants || []).length > 0 && (
              <ul className="hidden lg:block mb-6 rounded-xl border border-[color:var(--nav-border-soft)] divide-y divide-[color:var(--nav-border-soft)] overflow-hidden">
                {model.variants.map(v => {
                  const has = v.stockCount !== null && v.stockCount > 0
                  const active = v.color === selectedColor && v.size === selectedSize
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      style={{ background: active ? 'var(--nav-accent-soft)' : 'transparent' }}>
                      <span style={{ color: 'var(--nav-text-primary)' }}>{v.color}, {v.size}</span>
                      <span className="tabular-nums" style={{ color: has ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>
                        {has ? t.inStock(v.stockCount ?? 0) : t.customOrderTag}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            </div>

            <button onClick={addToCart} disabled={!selectedVariant}
              className="w-full rounded-xl py-3.5 font-medium text-sm disabled:opacity-50 lg:shrink-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {added ? t.added : isCustomOrder ? t.orderCustom : t.addToCart}
            </button>
          </div>
        </div>
      </div>

      <WholesaleCartBar slug={params.slug} />
    </div>
  )
}
