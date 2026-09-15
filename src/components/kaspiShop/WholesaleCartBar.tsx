'use client'
import { useState } from 'react'
import { useWholesaleCart } from '@/lib/kaspiShop/useWholesaleCart'

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Mounted on both /shop/[slug]/catalog and /shop/[slug]/catalog/[modelId] --
// each mount reads the same localStorage-backed cart independently (see
// useWholesaleCart's own comment on why that's fine here, same as the
// existing flat storefront's per-page cart read). Handles its own checkout
// modal end to end: on submit, POSTs to /api/shop/[slug]/wholesale-order and
// redirects the browser straight to the returned счёт's /view/[token] page,
// where bank details + Kaspi Cashier already work with no code here.
export default function WholesaleCartBar({ slug }: { slug: string }) {
  const cart = useWholesaleCart(slug)
  const [open, setOpen] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const binValid = /^\d{12}$/.test(clientBin)
  const emailValid = clientEmail.includes('@')
  const canSubmit = cart.lines.length > 0 && clientName.trim().length > 0 && binValid && emailValid && !submitting

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/shop/${slug}/wholesale-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.lines.map(l => ({ modelId: l.modelId, size: l.size, color: l.color, qty: l.qty })),
          clientName: clientName.trim(),
          clientBin,
          clientEmail: clientEmail.trim(),
          clientPhone,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Не удалось оформить заявку'); return }
      cart.clear()
      window.location.href = `/view/${data.publicToken}`
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  if (cart.count === 0 && !open) return null

  return (
    <>
      {!open && (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-6xl mx-auto">
          <button onClick={() => setOpen(true)}
            className="w-full nav-glass rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            <span className="text-sm font-semibold">Корзина: {cart.count} {cart.count === 1 ? 'товар' : 'товара'}</span>
            <span className="text-sm font-bold">{formatPrice(cart.total)} · Оформить →</span>
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpen(false)}>
          <div className="nav-glass rounded-2xl p-5 w-full max-w-sm max-h-[85vh] overflow-y-auto" style={{ background: 'var(--nav-bg)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Ваша заявка</div>
              <button onClick={() => setOpen(false)} className="text-sm flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
            </div>

            <ul className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
              {cart.lines.map(l => (
                <li key={l.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate" style={{ color: 'var(--nav-text-secondary)' }}>
                    {l.modelName}, {l.color}, {l.size}{l.customOrder ? ' (пошив)' : ''} × {l.qty}
                  </span>
                  <span className="font-semibold flex-shrink-0" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-sm font-bold mb-4 pt-2 border-t" style={{ color: 'var(--nav-text-primary)', borderColor: 'var(--nav-border)' }}>
              <span>Итого</span>
              <span>{formatPrice(cart.total)}</span>
            </div>

            <div className="space-y-2 mb-4">
              <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Название компании"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientBin} onChange={e => setClientBin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="БИН (12 цифр)"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="Email — сюда придёт счёт" type="email"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Телефон (необязательно)"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            </div>

            {error && <div className="text-xs mb-3" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
            <button onClick={submit} disabled={!canSubmit}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {submitting ? 'Оформляем…' : 'Оформить заявку'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
