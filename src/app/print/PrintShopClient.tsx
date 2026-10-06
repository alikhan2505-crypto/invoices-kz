// src/app/print/PrintShopClient.tsx
'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Bounds, useBounds, ContactShadows } from '@react-three/drei'
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
  // roughness/metalness tuned for a printed-PLA satin sheen (not matte clay,
  // not a glossy toy) -- pure visual tuning, no geometry/business-logic risk.
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometries.baseGeometry}>
        <meshStandardMaterial color={COLOR_HEX[baseColor]} roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh geometry={geometries.textGeometry}>
        <meshStandardMaterial color={COLOR_HEX[textColor]} roughness={0.4} metalness={0.05} />
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

  // Founder 2026-10-06: "общий дизайн" -- every font button showed its own
  // NAME in the page's system font, so a customer had no idea what "Caveat"
  // or "Yeseva One" actually looked like without clicking each one. The same
  // .ttf files the geometry pipeline already parses with opentype.js are
  // also served as plain static files (printShopFontUrl) -- registering them
  // as real @font-face rules lets the picker render each label IN that font.
  const fontFaceCss = useMemo(
    () => PRINT_SHOP_FONTS.map(f => `@font-face { font-family: "print-shop-${f.id}"; src: url("${printShopFontUrl(f.id)}") format("truetype"); font-display: swap; }`).join('\n'),
    []
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
      <style>{fontFaceCss}</style>
      <div className="max-w-4xl mx-auto p-4 lg:p-8 grid lg:grid-cols-2 gap-8">
        <div
          className="aspect-square rounded-2xl overflow-hidden"
          style={{
            // Founder 2026-10-06: "сам вид 3D-модели" -- a near-invisible
            // 0.035-alpha glass tint (the shared --nav-surface-glass token,
            // meant for text-heavy cabinet cards) made a WHITE keychain
            // nearly vanish into its own stage. A real radial "studio
            // backdrop" gradient gives every colour real contrast and a
            // sense of a lit podium instead of an empty rectangle.
            background: 'radial-gradient(120% 120% at 50% 15%, var(--nav-accent-soft), var(--nav-surface-glass) 60%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06), inset 0 0 0 1px var(--nav-accent-track)',
          }}
        >
          <Canvas camera={{ position: [0, 52, 18], fov: 35 }}>
            {/* Three-point studio lighting (no HDRI/environment map -- this
                is a public page, keeping it to procedural lights avoids a
                runtime dependency on an external asset CDN): a strong key
                light for real form/shadow, a soft cool fill from the
                opposite side so nothing goes pure black, and a dim rim
                light from behind to separate the object's edge from the
                backdrop. */}
            <ambientLight intensity={0.45} />
            <directionalLight position={[30, 55, 20]} intensity={1.15} />
            <directionalLight position={[-28, 18, -10]} intensity={0.3} color="#cfd6ff" />
            <directionalLight position={[0, 12, -30]} intensity={0.35} />
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
            <Bounds observe fit clip margin={1.5}>
              {font && <KeychainMesh font={font} text={text} size={size} ringAtEnd={ringAtEnd} ringSize={ringSize} baseColor={baseColor} textColor={textColor} />}
              <RefitBoundsOnChange deps={[font, text, size, ringAtEnd, ringSize]} />
            </Bounds>
            {/* Grounds the object with a soft contact shadow instead of it
                floating in empty space -- sits right at the model's own
                bottom face (local z=0 becomes world y=0 after KeychainMesh's
                -90°-about-X rotation). Purely a baked blurred shadow plane,
                no shadow-mapped lights needed. */}
            <ContactShadows position={[0, -0.02, 0]} opacity={0.35} blur={2.4} far={30} scale={60} />
            {/* autoRotate makes the object read as 3D at a glance even
                before anyone touches it -- stops being the only cue once
                the customer drags, which still works exactly as before. */}
            <OrbitControls enablePan={false} autoRotate autoRotateSpeed={1.1} />
          </Canvas>
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Именной 3D-брелок</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--nav-text-secondary)' }}>
              Настройте форму, шрифт и цвета — и сразу увидите, каким будет готовый брелок.
            </p>
          </div>

          {step === 'configure' && (
            <>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Текст на брелке</div>
                <input
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, 20))}
                  placeholder="Например, Айгерим"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
                />
              </div>

              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Шрифт</div>
                <input
                  value={fontQuery}
                  onChange={e => setFontQuery(e.target.value)}
                  placeholder="Поиск шрифта…"
                  className="w-full rounded-lg px-3 py-2 text-sm mb-2"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }}
                />
                {/* Each button renders its OWN label in its own @font-face
                    (fontFaceCss above) -- a customer can actually see what
                    "Caveat" or "Yeseva One" look like, not just read the name. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {filteredFonts.map(f => (
                    <button key={f.id} onClick={() => setFontId(f.id)} title={f.label}
                      className="rounded-lg px-2.5 py-2 text-base text-left truncate"
                      style={{
                        fontFamily: `"print-shop-${f.id}", sans-serif`,
                        background: fontId === f.id ? 'var(--nav-accent-soft)' : 'var(--nav-surface-glass)',
                        color: fontId === f.id ? 'var(--nav-accent)' : 'var(--nav-text-secondary)',
                        boxShadow: fontId === f.id ? 'inset 0 0 0 1.5px var(--nav-accent)' : 'none',
                      }}>
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
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setBaseColor(c)} title={c} aria-label={c}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs"
                        style={{ background: COLOR_HEX[c], boxShadow: baseColor === c ? '0 0 0 2px var(--nav-bg), 0 0 0 4px var(--nav-accent)' : '0 0 0 1px var(--nav-accent-track)' }}>
                        {baseColor === c && <span style={{ color: c === 'белый' || c === 'жёлтый' ? '#14162A' : '#fff' }}>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>Цвет текста</div>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setTextColor(c)} title={c} aria-label={c}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs"
                        style={{ background: COLOR_HEX[c], boxShadow: textColor === c ? '0 0 0 2px var(--nav-bg), 0 0 0 4px var(--nav-accent)' : '0 0 0 1px var(--nav-accent-track)' }}>
                        {textColor === c && <span style={{ color: c === 'белый' || c === 'жёлтый' ? '#14162A' : '#fff' }}>✓</span>}
                      </button>
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
