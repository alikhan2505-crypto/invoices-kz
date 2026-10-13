'use client'
import { useEffect, useRef, useState } from 'react'
import type { Lang } from '@/components/LanguageProvider'
import ProductArt from '@/components/products/ProductArt'
import './kaspi-scene.css'

// «Живой кабинет» на лендинге Kaspi Bot (ревизия 13.10.2026, вариант А):
// анимированное окно кабинета, которое за ~15 секунд показывает обе функции
// продукта. 1) Цена сама опускается за конкурентами и выходит на 1-е место,
// не пробивая границу. 2) Падают заказы, «Упаковать все» — статусы меняются,
// выезжает накладная (копия настоящей Kaspi-накладной A6, данные выдуманные).
// Сделано кодом, а не видеофайлом: чёткий текст, три языка, почти ноль веса.
// На широком окне — горизонтальная раскладка (container query в css).
// Декоративное (aria-hidden): смысл продублирован в заголовке и стикерах.

const T: Record<Lang, {
  app: string; live: string; priceTitle: string; product: string; reviews: string; sellers: string; you: string
  floor: string; first: string; ordersTitle: string; wait: string; fresh: string; packed: string; packAll: string
  city: [string, string, string]
}> = {
  ru: { app: 'Kaspi Bot', live: 'работает', priceTitle: 'Ваш товар на Kaspi', product: 'Наушники Pro Max, черные', reviews: '2 562 отзыва', sellers: 'Продавцы', you: 'Вы', floor: 'Не ниже 4 800 ₸', first: '1-е место', ordersTitle: 'Новые заказы', wait: 'Ждём заказы', fresh: 'Новый', packed: 'Упакован', packAll: 'Упаковать все', city: ['Алматы', 'Астана', 'Шымкент'] },
  kk: { app: 'Kaspi Bot', live: 'жұмыс істеп тұр', priceTitle: 'Kaspi-дегі тауарыңыз', product: 'Pro Max құлаққабы, қара', reviews: '2 562 пікір', sellers: 'Сатушылар', you: 'Сіз', floor: '4 800 ₸-ден төмен емес', first: '1-орын', ordersTitle: 'Жаңа тапсырыстар', wait: 'Тапсырыстарды күтудеміз', fresh: 'Жаңа', packed: 'Оралды', packAll: 'Барлығын орау', city: ['Алматы', 'Астана', 'Шымкент'] },
  en: { app: 'Kaspi Bot', live: 'running', priceTitle: 'Your product on Kaspi', product: 'Pro Max headphones, black', reviews: '2,562 reviews', sellers: 'Sellers', you: 'You', floor: 'Never below 4 800 ₸', first: '1st place', ordersTitle: 'New orders', wait: 'Waiting for orders', fresh: 'New', packed: 'Packed', packAll: 'Pack all', city: ['Almaty', 'Astana', 'Shymkent'] },
}

const RIVALS = [
  { name: 'Gadget.kz', price: 5090 },
  { name: 'Mobi Store', price: 5150 },
]
const ORDERS = ['4821', '4822', '4823']

// Раскадровка: один шаг = STEP_MS. Цена по шагам; дальше — заказы.
const STEP_MS = 1000
const STEPS = 16
const FINAL = 12 // кадр для prefers-reduced-motion: всё уже случилось
const START_PRICE = 5290
function ourPrice(step: number) {
  if (step >= 4) return 5080
  if (step === 3) return 5140
  if (step === 2) return 5190
  return START_PRICE
}

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₸'

export default function KaspiLiveScene({ lang }: { lang: Lang }) {
  const t = T[lang]
  const [step, setStep] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(FINAL); return }
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    if (rootRef.current) io.observe(rootRef.current)
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return
      setStep((s) => (s + 1) % STEPS)
    }, STEP_MS)
    return () => { window.clearInterval(id); io.disconnect() }
  }, [])

  const price = ourPrice(step)
  const rows = [...RIVALS.map((r) => ({ ...r, me: false })), { name: t.you, price, me: true }]
  const ranked = [...rows].sort((a, b) => a.price - b.price)
  const rankOf = (name: string) => ranked.findIndex((r) => r.name === name)
  const first = rankOf(t.you) === 0
  const shownOrders = step >= 6 ? Math.min(step - 5, 3) : 0
  const packed = step >= 10
  const fading = step === STEPS - 1

  return (
    <div ref={rootRef} className="ks-wrap" aria-hidden="true">
      <div className="ks-win" data-fading={fading} data-reset={step === 0}>
        <div className="ks-bar">
          <i /><i /><i />
          <b>{t.app}</b>
          <span className="ks-live"><em />{t.live}</span>
        </div>

        <div className="ks-body">
          <section className="ks-card ks-price-card">
            <div className="ks-head">
              <span className="ks-title">{t.priceTitle}</span>
              <span className="ks-floor" data-glow={step >= 5 && step <= 7}>
                <svg viewBox="0 0 16 16" width="11" height="11"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                {t.floor}
              </span>
            </div>
            <div className="ks-product">
              <span className="ks-photo"><HeadphonesPhoto /></span>
              <span className="ks-pinfo">
                <span className="ks-pname">{t.product}</span>
                <span className="ks-stars"><Stars /><span>{t.reviews}</span></span>
                <span className="ks-pprice"><span key={price} className="ks-roll">{fmt(price)}</span></span>
              </span>
            </div>
            <span className="ks-sub">{t.sellers}</span>
            <div className="ks-rows">
              {rows.map((r) => (
                <div key={r.me ? 'me' : r.name} className="ks-row" data-me={r.me} style={{ transform: `translateY(${rankOf(r.name) * 46}px)` }}>
                  <span className="ks-rank">{rankOf(r.name) + 1}</span>
                  <span className="ks-shop">{r.name}</span>
                  {r.me && price < START_PRICE && <span key={price} className="ks-delta">−{START_PRICE - price} ₸</span>}
                  {r.me && first && <span className="ks-badge">{t.first}</span>}
                  <span className="ks-price"><span key={r.price} className="ks-roll">{fmt(r.price)}</span></span>
                </div>
              ))}
            </div>
          </section>

          <section className="ks-card ks-orders-card">
            <div className="ks-head">
              <span className="ks-title">{t.ordersTitle} <span className="ks-count" data-on={shownOrders > 0}>{shownOrders}</span></span>
              <span className="ks-btnwrap">
                <span className="ks-btn" data-press={step === 9}>{t.packAll}</span>
                <span className="ks-cursor" data-at={step >= 8 && step <= 10 ? (step === 8 ? 'near' : 'btn') : 'off'}>
                  <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.6L10.5 19z" fill="#2A0E0B" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                </span>
              </span>
            </div>
            <div className="ks-orders">
              <span className="ks-wait" data-on={shownOrders === 0}>{t.wait}<i /><i /><i /></span>
              {ORDERS.map((n, i) => (
                <div key={n} className="ks-order" data-in={i < shownOrders} data-packed={packed} style={{ transitionDelay: packed ? `${i * 160}ms` : '0ms' }}>
                  <span className="ks-onum">№ {n}</span>
                  <span className="ks-ocity">{t.city[i]} · {fmt(5080)}</span>
                  <span className="ks-status" style={{ transitionDelay: packed ? `${i * 160}ms` : '0ms' }}>
                    {packed ? <>✓ {t.packed}</> : t.fresh}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Коробка с «−8 %» (та же, что на плитке хаба): на «Упаковать все»
          вздрагивает — заказы уходят в коробку. */}
      <span className="ks-box" data-shake={step === 10}><ProductArt product="kaspiShop" /></span>

      <div className="ks-label" data-in={step >= 11 && !fading}>
        <Waybill product={t.product} />
      </div>
    </div>
  )
}

function Stars() {
  return (
    <svg viewBox="0 0 80 14" width="68" height="12">
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} transform={`translate(${i * 16} 0)`} d="M7 .8l1.9 4 4.3.5-3.2 3 .9 4.3L7 10.4 3.1 12.6 4 8.3.8 5.3l4.3-.5z" fill="#F14635" />
      ))}
    </svg>
  )
}

// Фото товара: не чужое фото с Kaspi (права продавца), а нарисованные
// накладные наушники в студийном свете — читается как карточка магазина.
function HeadphonesPhoto() {
  return (
    <svg viewBox="0 0 120 120">
      <defs>
        <radialGradient id="ks-bg" cx="50%" cy="38%" r="75%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E9EAEE" /></radialGradient>
        <linearGradient id="ks-cup" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B5F68" /><stop offset=".45" stopColor="#2B2E34" /><stop offset="1" stopColor="#16181C" /></linearGradient>
        <linearGradient id="ks-cup2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4A4E57" /><stop offset=".5" stopColor="#24272C" /><stop offset="1" stopColor="#121417" /></linearGradient>
        <linearGradient id="ks-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8E939C" /><stop offset=".5" stopColor="#E3E6EB" /><stop offset="1" stopColor="#7D828B" /></linearGradient>
        <linearGradient id="ks-pad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3A3D44" /><stop offset="1" stopColor="#1A1C20" /></linearGradient>
        <pattern id="ks-mesh" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#2E3137" /><circle cx="1.5" cy="1.5" r=".7" fill="#4B4F57" /></pattern>
      </defs>
      <rect width="120" height="120" rx="14" fill="url(#ks-bg)" />
      <ellipse cx="60" cy="104" rx="40" ry="5" fill="#000" opacity=".12" />
      {/* оголовье: металлическая дуга + сетчатый купол */}
      <path d="M27 66V44a33 33 0 0 1 66 0v22" fill="none" stroke="url(#ks-steel)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M33 40a27 27 0 0 1 54 0" fill="none" stroke="url(#ks-mesh)" strokeWidth="9" strokeLinecap="round" />
      {/* левая чашка — видна амбушюра */}
      <rect x="14" y="58" width="28" height="42" rx="13" fill="url(#ks-cup)" />
      <rect x="31" y="61" width="13" height="36" rx="6.5" fill="url(#ks-pad)" />
      <rect x="16.5" y="61" width="5" height="22" rx="2.5" fill="#fff" opacity=".18" />
      {/* правая чашка — внешняя сторона */}
      <rect x="78" y="58" width="28" height="42" rx="13" fill="url(#ks-cup2)" />
      <rect x="76" y="61" width="13" height="36" rx="6.5" fill="url(#ks-pad)" />
      <rect x="99" y="62" width="4" height="18" rx="2" fill="#fff" opacity=".14" />
      <circle cx="98" cy="90" r="1.6" fill="#8E939C" />
      {/* крепления */}
      <rect x="25" y="54" width="4" height="8" rx="2" fill="url(#ks-steel)" />
      <rect x="91" y="54" width="4" height="8" rx="2" fill="url(#ks-steel)" />
    </svg>
  )
}

// Мини-копия настоящей Kaspi-накладной A6 (по образцу основателя). Данные
// выдуманные: ни реальных покупателей, ни адресов.
const BARS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 1, 2, 2, 1, 3, 1, 1, 2]
function Barcode({ w, h }: { w: number; h: number }) {
  let x = 0
  const rects: React.ReactElement[] = []
  BARS.forEach((b, i) => { if (i % 2 === 0) rects.push(<rect key={i} x={x} y={0} width={b} height={h} fill="#000" />); x += b })
  return <svg viewBox={`0 0 ${x} ${h}`} width={w} height={h} preserveAspectRatio="none">{rects}</svg>
}
const QR_SEED = '1110111001011101011100100101000110111010110010011010101101110100101011010110110001010010101110011010010110100111010101101001110101001101011100100101110110110010101'
function QrCode({ size }: { size: number }) {
  const n = 13
  const cells: React.ReactElement[] = []
  const finder = (r: number, c: number) => (r < 4 && c < 4) || (r < 4 && c >= n - 4) || (r >= n - 4 && c < 4)
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (finder(r, c)) continue
    if (QR_SEED[(r * n + c) % QR_SEED.length] === '1') cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000" />)
  }
  const eye = (x: number, y: number) => (
    <g key={`e${x}-${y}`}><rect x={x} y={y} width={3.6} height={3.6} fill="#000" /><rect x={x + 0.6} y={y + 0.6} width={2.4} height={2.4} fill="#fff" /><rect x={x + 1.1} y={y + 1.1} width={1.4} height={1.4} fill="#000" /></g>
  )
  return <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges">{cells}{eye(0, 0)}{eye(n - 3.6, 0)}{eye(0, n - 3.6)}</svg>
}
function Waybill({ product }: { product: string }) {
  return (
    <div className="ks-a6">
      <div className="ks-a6-top">
        <span className="ks-a6-num">3</span>
        <span className="ks-a6-code"><Barcode w={96} h={30} /><b>1 063 418 207-1</b></span>
        <span className="ks-a6-frac">1/1</span>
      </div>
      <div className="ks-a6-city"><b>Алматы</b><span className="ks-a6-inv">ALFA</span></div>
      <div className="ks-a6-route"><b>Алматы - KSHOP</b> (Алматы)</div>
      <div className="ks-a6-item"><span>1. {product}</span><span>1 шт.</span></div>
      <div className="ks-a6-shop">ИП «ВАШ МАГАЗИН»</div>
      <div className="ks-a6-bar2"><Barcode w={64} h={14} /></div>
      <div className="ks-a6-city ks-a6-city2"><b>Алматы</b><b>ALFA</b></div>
      <div className="ks-a6-addr"><span>ул. Абая, д. 10</span><b>Айгерим С.</b></div>
      <div className="ks-a6-foot">
        <b>4/X</b>
        <QrCode size={30} />
        <span className="ks-a6-inv ks-a6-big">13885</span>
      </div>
      <div className="ks-a6-date"><span>план дата доставки:</span><b>16 окт.</b><span>Вес: 0.4кг</span></div>
    </div>
  )
}
