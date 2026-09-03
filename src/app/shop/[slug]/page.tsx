'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import Script from 'next/script'
import QRCode from 'qrcode'

type Product = { id: string; name: string; brand: string; price: number; imageUrl: string | null; categoryId: string | null }
type Category = { id: string; name: string; sortOrder: number }
type Payment = { qr_token: string | null; payment_link: string | null; status: string }

const EASE = [0.16, 1, 0.3, 1] as const

function LogoMark() {
  return (
    <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" style={{ boxShadow: '0 6px 14px -6px var(--nav-accent)' }} />
  )
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Pure -- no I/O. Sellers who never touched Разделы get the plain flat grid
// (no heading at all, same as before this feature existed); once at least
// one category exists, products group under it in sortOrder, with anything
// left uncategorized collected into a trailing "Другое" section.
function groupProducts(products: Product[], categories: Category[]): { id: string | null; name: string; products: Product[] }[] {
  if (categories.length === 0) return [{ id: null, name: '', products }]
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const groups = sorted.map(c => ({ id: c.id as string | null, name: c.name, products: products.filter(p => p.categoryId === c.id) }))
  const uncategorized = products.filter(p => !sorted.some(c => c.id === p.categoryId))
  if (uncategorized.length > 0) groups.push({ id: null, name: 'Другое', products: uncategorized })
  return groups.filter(g => g.products.length > 0)
}

export default function StorefrontPage() {
  const params = useParams<{ slug: string }>()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [deliveryInfo, setDeliveryInfo] = useState<string | null>(null)
  const [widgetKey, setWidgetKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [buyerAddress, setBuyerAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/shop/${params.slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return }
        setCompanyName(data.companyName || '')
        setProducts(Array.isArray(data.products) ? data.products : [])
        setCategories(Array.isArray(data.categories) ? data.categories : [])
        setBackgroundColor(data.backgroundColor || null)
        setDeliveryInfo(data.deliveryInfo || null)
        setWidgetKey(data.widgetKey || null)
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug])

  useEffect(() => {
    if (!payment?.payment_link) { setQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(payment.payment_link, { width: 160, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [payment?.payment_link])

  // Same 5s / ~12.5min-cap live-poll shape as /view/[token] -- see
  // settlePayment.ts for why polling (not a cron) is the primary
  // confirmation path on this project's once-daily cron plan.
  const pollCount = useRef(0)
  useEffect(() => {
    if (!payment || payment.status !== 'pending' || !orderId) return
    pollCount.current = 0
    const interval = setInterval(async () => {
      pollCount.current++
      if (pollCount.current > 150) { clearInterval(interval); return }
      try {
        const res = await fetch(`/api/shop/${params.slug}/order-status?orderId=${orderId}`)
        const data = await res.json()
        setPayment(data.payment || null)
      } catch {
        // Transient network hiccup — the next tick tries again.
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [payment?.status, orderId, params.slug])

  async function submitOrder() {
    if (!selected) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/shop/${params.slug}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: selected.id, buyerName, buyerPhone, buyerAddress }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Не удалось оформить заказ'); return }
      // A created order with no payment (Kaspi mint failed, wallet balance
      // too low, etc.) must not silently fall back to showing the form
      // again with orderId already set -- the buyer would see nothing wrong
      // and resubmit, creating a duplicate order for the same purchase.
      if (!data.payment) { setError('Не удалось создать оплату. Попробуйте ещё раз чуть позже.'); return }
      setOrderId(data.orderId)
      setPayment(data.payment)
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() {
    setSelected(null)
    setBuyerName(''); setBuyerPhone(''); setBuyerAddress('')
    setOrderId(null); setPayment(null); setQrDataUrl(null); setError(null)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
  if (notFound) return <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Витрина не найдена</div>

  return (
    <div className="min-h-screen" style={{ background: backgroundColor || 'var(--nav-bg)' }}>
      {widgetKey && (
        <Script id="invoiceskz-storefront-widget" src="https://www.invoices.kz/widget.js" data-key={widgetKey} strategy="afterInteractive" />
      )}
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark />
          <h1 className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{companyName}</h1>
        </div>

        {deliveryInfo && (
          <div className="nav-glass rounded-2xl p-4 mb-6">
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--nav-text-muted)' }}>Доставка</div>
            <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--nav-text-secondary)' }}>{deliveryInfo}</div>
          </div>
        )}

        {products.length === 0 ? (
          <div className="text-sm text-center py-16" style={{ color: 'var(--nav-text-muted)' }}>Пока нет товаров в наличии</div>
        ) : (
          <div className="space-y-8">
            {groupProducts(products, categories).map(group => (
              <div key={group.id || group.name || 'all'}>
                {group.name && (
                  <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{group.name}</h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.products.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : Math.min(i * 0.04, 0.3) }}
                      className="nav-glass rounded-2xl overflow-hidden flex flex-col"
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="p-4 flex flex-col flex-1">
                        {p.brand && <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--nav-text-muted)' }}>{p.brand}</div>}
                        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                        <div className="text-base font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.price)}</div>
                        <button
                          onClick={() => setSelected(p)}
                          className="mt-auto rounded-lg px-4 py-2 text-sm font-semibold"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
                        >
                          Купить
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={closeModal}>
          <div className="nav-glass rounded-2xl p-5 w-full max-w-sm" style={{ background: 'var(--nav-bg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3 min-w-0">
                {selected.imageUrl && (
                  <img src={selected.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{selected.name}</div>
              </div>
              <button onClick={closeModal} className="text-sm flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
            </div>

            {payment ? (
              <div className="text-center">
                {payment.status === 'paid' ? (
                  <div className="py-6 text-sm font-semibold" style={{ color: 'var(--nav-success)' }}>Заказ оплачен! Продавец свяжется с вами.</div>
                ) : (
                  <>
                    {qrDataUrl && <img src={qrDataUrl} alt="Kaspi QR" className="mx-auto mb-3 rounded-lg" width={160} height={160} />}
                    <a href={payment.payment_link || '#'} target="_blank" rel="noopener noreferrer"
                      className="inline-block rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      Оплатить {formatPrice(selected.price)} через Kaspi
                    </a>
                    <div className="text-xs mt-3" style={{ color: 'var(--nav-text-muted)' }}>Ждём подтверждение оплаты…</div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="text-sm font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(selected.price)}</div>
                <div className="space-y-2 mb-4">
                  <input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Имя"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <input value={buyerPhone} onChange={e => setBuyerPhone(e.target.value)} placeholder="Телефон"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Адрес доставки"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                </div>
                {error && <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
                <button onClick={submitOrder} disabled={submitting || !buyerName.trim() || !buyerPhone.trim() || !buyerAddress.trim()}
                  className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {submitting ? 'Оформляем…' : 'Оформить и оплатить'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
