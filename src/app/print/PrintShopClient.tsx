// src/app/print/PrintShopClient.tsx
'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Bounds, useBounds } from '@react-three/drei'
import * as opentype from 'opentype.js'
import QRCode from 'qrcode'
import { PRINT_SHOP_FONTS, printShopFontUrl } from '@/lib/printShop/fonts'
import { priceForSize, DEFAULT_RING_SIZE, type KeychainSize, type RingSize } from '@/lib/printShop/pricing'
import { buildKeychainGeometries } from '@/lib/printShop/keychainGeometry'

const COLORS = ['белый', 'чёрный', 'серый', 'жёлтый', 'зелёный', 'красный', 'бордовый'] as const
const COLOR_HEX: Record<string, string> = {
  белый: '#f5f5f5', чёрный: '#1a1a1a', серый: '#9ca3af', жёлтый: '#fbbf24',
  зелёный: '#16a34a', красный: '#dc2626', бордовый: '#7f1d1d',
}

const fontCache = new Map<string, opentype.Font>()
async function loadFont(fontId: string): Promise<opentype.Font> {
  const cached = fontCache.get(fontId)
  if (cached) return cached
  const buf = await (await fetch(printShopFontUrl(fontId))).arrayBuffer()
  const font = opentype.parse(buf)
  fontCache.set(fontId, font)
  return font
}

function KeychainMesh({ font, text, size, ringAtEnd, ringSize, baseColor, textColor }: {
  font: opentype.Font; text: string; size: KeychainSize; ringAtEnd: boolean; ringSize: RingSize; baseColor: string; textColor: string
}) {
  const geometries = useMemo(() => {
    if (!text.trim()) return null
    try {
      return buildKeychainGeometries({ font, text, size, ringAtEnd, ringSize })
    } catch {
      return null
    }
  }, [font, text, size, ringAtEnd, ringSize])

  if (!geometries) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometries.baseGeometry}>
        <meshStandardMaterial color={COLOR_HEX[baseColor]} />
      </mesh>
      <mesh geometry={geometries.textGeometry}>
        <meshStandardMaterial color={COLOR_HEX[textColor]} />
      </mesh>
    </group>
  )
}

// <Bounds observe> only detects objects being ADDED/REMOVED from the scene
// graph -- KeychainMesh keeps the SAME <mesh> instances across re-renders
// and just swaps their `geometry` prop in place (normal R3F reconciliation),
// so a text/font/size/ring change never triggers observe's refit at all
// (confirmed: it framed the FIRST name correctly, then stayed frozen on
// every edit after that -- the "брелок в квадрат не входит" report was
// reproduced live with a longer name after the initial fix). Calling the
// imperative useBounds() API explicitly on every relevant dependency change
// is the documented way to refit on data that changed without the scene
// graph itself changing shape.
function RefitBoundsOnChange({ deps }: { deps: unknown[] }) {
  const bounds = useBounds()
  useEffect(() => {
    bounds.refresh().fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}

type Step = 'configure' | 'details' | 'payment'

const PAYMENT_POLL_INTERVAL_MS = 3000
// «Готовим оплату…» честно означает «через пару секунд будет QR»:
// getOrCreateKaspiPaymentForPrintOrder минтит платёж сразу же, когда всё
// настроено. Если сервер и после ~30 секунд отдаёт payment: null -- это не
// «готовим», а одна из тихих причин отказа (баланс кошелька владельца ниже
// комиссии, нет активного Kaspi-подключения, лимит минтов, заказ уже
// закрыт, PRINT_SHOP_OWNER_USER_ID не настроен, insert упал). Все они
// неотличимы на уровне API и ни одна не исчезнет сама за время ожидания,
// так что крутить спиннер бесконечно -- врать клиенту.
const MAX_EMPTY_PAYMENT_POLLS = 10

export default function PrintShopClient() {
  const [text, setText] = useState('Самал')
  const [fontId, setFontId] = useState(PRINT_SHOP_FONTS[0].id)
  const [fontQuery, setFontQuery] = useState('')
  const [size, setSize] = useState<KeychainSize>('M')
  const [ringAtEnd, setRingAtEnd] = useState(false)
  const [ringSize, setRingSize] = useState<RingSize>(DEFAULT_RING_SIZE)
  const [baseColor, setBaseColor] = useState<typeof COLORS[number]>('белый')
  const [textColor, setTextColor] = useState<typeof COLORS[number]>('чёрный')
  const [font, setFont] = useState<opentype.Font | null>(null)

  const [step, setStep] = useState<Step>('configure')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [payment, setPayment] = useState<{ qr_token: string | null; payment_link: string | null; status: string } | null>(null)
  const [paymentUnavailable, setPaymentUnavailable] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const emptyPollsRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    loadFont(fontId).then(f => { if (!cancelled) setFont(f) })
    return () => { cancelled = true }
  }, [fontId])

  useEffect(() => {
    if (step !== 'payment' || !orderId || payment?.status === 'paid') return
    emptyPollsRef.current = 0
    setPaymentUnavailable(false)
    const poll = async () => {
      try {
        const res = await fetch(`/api/print/orders/${orderId}/payment`)
        const data = await res.json()
        if (data.payment) {
          emptyPollsRef.current = 0
          setPaymentUnavailable(false)
          setPayment(data.payment)
          return
        }
      } catch {
        // Моргнувшая сеть считается такой же неудачной попыткой, как
        // payment: null -- важен только факт «QR до сих пор нет».
      }
      emptyPollsRef.current++
      if (emptyPollsRef.current >= MAX_EMPTY_PAYMENT_POLLS) {
        setPaymentUnavailable(true)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }
    poll()
    pollRef.current = setInterval(poll, PAYMENT_POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, orderId, payment?.status])

  // Тот же приём, что на публичной витрине (src/app/shop/[slug]/page.tsx):
  // QR рисуется из payment_link на клиенте пакетом qrcode. Без картинки
  // текст «Отсканируйте QR» был прямой ложью, а на десктопе kaspi-ссылку
  // осмысленно нажать нельзя -- то есть оплатить было нечем.
  useEffect(() => {
    if (!payment?.payment_link) { setQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(payment.payment_link, { width: 160, margin: 1 })
      .then(url => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [payment?.payment_link])

  const filteredFonts = useMemo(
    () => PRINT_SHOP_FONTS.filter(f => f.label.toLowerCase().includes(fontQuery.toLowerCase())),
    [fontQuery]
  )

  async function submitOrder() {
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/print/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, font: fontId, size, ringAtEnd, ringSize, baseColor, textColor, customerName, customerPhone, note }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) { setError(data.error || 'Не удалось оформить заказ'); return }
    setOrderId(data.orderId)
    setStep('payment')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-4xl mx-auto p-4 lg:p-8 grid lg:grid-cols-2 gap-8">
        <div className="aspect-square rounded-2xl overflow-hidden" style={{ background: 'var(--nav-surface-glass)' }}>
          <Canvas camera={{ position: [0, 52, 18], fov: 35 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[20, 40, 20]} intensity={0.8} />
            {/* Founder 2026-10-06: "брелок в квадрат не входит" -- the old
                fixed camera DISTANCE assumed a roughly-constant keychain
                size, but a long name's base contour is much wider than a
                short one. <Bounds observe fit clip> re-fits the camera's
                DISTANCE (keeping the same top-down viewing direction the
                initial position above implies -- Bounds fits along the
                camera's current direction, it does not invent one) every
                time the geometry changes (text/font/size/ring), so the
                keychain always fills the square instead of overflowing or
                floating tiny in the middle. OrbitControls still lets the
                customer drag-rotate afterward -- the two are meant to
                compose, Bounds only sets where the camera STARTS. */}
            <Bounds observe fit clip margin={1.3}>
              {font && <KeychainMesh font={font} text={text} size={size} ringAtEnd={ringAtEnd} ringSize={ringSize} baseColor={baseColor} textColor={textColor} />}
              <RefitBoundsOnChange deps={[font, text, size, ringAtEnd, ringSize]} />
            </Bounds>
            <OrbitControls enablePan={false} />
          </Canvas>
        </div>

        <div className="space-y-4">
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Именной 3D-брелок</h1>

          {step === 'configure' && (
            <>
              <input
                value={text}
                onChange={e => setText(e.target.value.slice(0, 20))}
                placeholder="Текст на брелке"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
              />

              <div>
                <input
                  value={fontQuery}
                  onChange={e => setFontQuery(e.target.value)}
                  placeholder="Поиск шрифта…"
                  className="w-full rounded-lg px-3 py-2 text-sm mb-2"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
                />
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {filteredFonts.map(f => (
                    <button key={f.id} onClick={() => setFontId(f.id)}
                      className="rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{ background: fontId === f.id ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: fontId === f.id ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                {(['S', 'M', 'L'] as const).map(s => (
                  <button key={s} onClick={() => setSize(s)}
                    className="flex-1 rounded-lg py-2 text-sm font-medium"
                    style={{ background: size === s ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: size === s ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                    {s} — {priceForSize(s).toLocaleString('ru-KZ')} ₸
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                <input type="checkbox" checked={ringAtEnd} onChange={e => setRingAtEnd(e.target.checked)} />
                Кольцо в конце имени (по умолчанию — в начале)
              </label>

              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Размер кольца</div>
                <div className="flex gap-2">
                  {([['S', 'Маленькое'], ['M', 'Среднее'], ['L', 'Большое']] as const).map(([rs, label]) => (
                    <button key={rs} onClick={() => setRingSize(rs)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-medium"
                      style={{ background: ringSize === rs ? 'var(--nav-accent)' : 'var(--nav-surface-glass)', color: ringSize === rs ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Цвет основы</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setBaseColor(c)} title={c}
                        className="w-7 h-7 rounded-full border-2"
                        style={{ background: COLOR_HEX[c], borderColor: baseColor === c ? 'var(--nav-accent)' : 'transparent' }} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Цвет текста</div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setTextColor(c)} title={c}
                        className="w-7 h-7 rounded-full border-2"
                        style={{ background: COLOR_HEX[c], borderColor: textColor === c ? 'var(--nav-accent)' : 'transparent' }} />
                    ))}
                  </div>
                </div>
              </div>

              <button
                disabled={!text.trim()}
                onClick={() => setStep('details')}
                className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                Заказать за {priceForSize(size).toLocaleString('ru-KZ')} ₸
              </button>
            </>
          )}

          {step === 'details' && (
            <div className="space-y-2">
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Ваше имя"
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Телефон"
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Комментарий (необязательно)" rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} />
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                disabled={submitting || !customerName.trim() || !customerPhone.trim()}
                onClick={submitOrder}
                className="w-full rounded-xl py-3 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
              >
                {submitting ? 'Оформляю…' : 'Перейти к оплате'}
              </button>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-3 text-center">
              {payment?.status === 'paid' ? (
                <div className="text-sm" style={{ color: 'var(--nav-success)' }}>
                  Оплачено! Мы начнём печать и свяжемся с вами.
                </div>
              ) : payment?.payment_link ? (
                <>
                  <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Отсканируйте QR или откройте ссылку в приложении Kaspi.</div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="Kaspi QR" width={160} height={160}
                      className="mx-auto rounded-lg" style={{ maxWidth: '100%' }} />
                  )}
                  <a href={payment.payment_link} target="_blank" rel="noreferrer"
                    className="inline-block rounded-xl py-3 px-6 text-sm font-medium"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    Оплатить в Kaspi
                  </a>
                </>
              ) : paymentUnavailable ? (
                <div className="text-sm text-red-400">
                  Не удалось подготовить оплату — попробуйте позже или свяжитесь с нами.
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Готовим оплату…</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
