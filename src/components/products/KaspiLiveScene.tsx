'use client'
import { useEffect, useRef, useState } from 'react'
import type { Lang } from '@/components/LanguageProvider'
import './kaspi-scene.css'

// «Живой кабинет» на лендинге Kaspi Bot (ревизия 13.10.2026, вариант А):
// вместо пустоты справа — анимированное окно кабинета, которое за ~15 секунд
// показывает обе функции продукта. 1) Цена сама опускается за конкурентами и
// выходит на 1-е место, не пробивая границу. 2) Падают заказы, кнопка
// «Упаковать все» — статусы меняются, вылезают накладные. Сделано кодом, а не
// видеофайлом: чёткий текст на любом экране, три языка, почти ноль веса.
// Декоративное (aria-hidden): смысл продублирован в заголовке и стикерах.

const T: Record<Lang, {
  app: string; live: string; priceTitle: string; product: string; you: string; floor: string; first: string
  ordersTitle: string; wait: string; fresh: string; packed: string; packAll: string; waybills: string; city: [string, string, string]
}> = {
  ru: { app: 'Kaspi Bot', live: 'работает', priceTitle: 'Ваша цена на Kaspi', product: 'Беспроводные наушники', you: 'Вы', floor: 'Не ниже 12 500 ₸', first: '1-е место', ordersTitle: 'Новые заказы', wait: 'Ждём заказы', fresh: 'Новый', packed: 'Упакован', packAll: 'Упаковать все', waybills: 'Накладные', city: ['Алматы', 'Астана', 'Шымкент'] },
  kk: { app: 'Kaspi Bot', live: 'жұмыс істеп тұр', priceTitle: 'Kaspi-дегі бағаңыз', product: 'Сымсыз құлаққап', you: 'Сіз', floor: '12 500 ₸-ден төмен емес', first: '1-орын', ordersTitle: 'Жаңа тапсырыстар', wait: 'Тапсырыстарды күтудеміз', fresh: 'Жаңа', packed: 'Оралды', packAll: 'Барлығын орау', waybills: 'Жүкқұжаттар', city: ['Алматы', 'Астана', 'Шымкент'] },
  en: { app: 'Kaspi Bot', live: 'running', priceTitle: 'Your price on Kaspi', product: 'Wireless earbuds', you: 'You', floor: 'Never below 12 500 ₸', first: '1st place', ordersTitle: 'New orders', wait: 'Waiting for orders', fresh: 'New', packed: 'Packed', packAll: 'Pack all', waybills: 'Waybills', city: ['Almaty', 'Astana', 'Shymkent'] },
}

const RIVALS = [
  { name: 'Gadget.kz', price: 12790 },
  { name: 'Mobi Store', price: 12850 },
]
const ORDERS = ['4821', '4822', '4823']

// Раскадровка: один шаг = STEP_MS. Цена по шагам; дальше — заказы.
const STEP_MS = 1000
const STEPS = 16
const FINAL = 12 // кадр для prefers-reduced-motion: всё уже случилось
const START_PRICE = 12990
function ourPrice(step: number) {
  if (step >= 4) return 12780
  if (step === 3) return 12840
  if (step === 2) return 12890
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
          <section className="ks-card">
            <div className="ks-head">
              <span className="ks-title">{t.priceTitle}</span>
              <span className="ks-floor" data-glow={step >= 5 && step <= 7}>
                <svg viewBox="0 0 16 16" width="11" height="11"><rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                {t.floor}
              </span>
            </div>
            <div className="ks-product">
              <span className="ks-thumb">
                <svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#F3E3DE" /><path d="M13 22v-3a7 7 0 0 1 14 0v3" fill="none" stroke="#2A0E0B" strokeWidth="2.4" strokeLinecap="round" /><rect x="10" y="21" width="6" height="9" rx="3" fill="#2A0E0B" /><rect x="24" y="21" width="6" height="9" rx="3" fill="#2A0E0B" /></svg>
              </span>
              <span className="ks-pname">{t.product}</span>
            </div>
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

          <section className="ks-card">
            <div className="ks-head">
              <span className="ks-title">{t.ordersTitle}</span>
              <span className="ks-count" data-on={shownOrders > 0}>{shownOrders}</span>
            </div>
            <div className="ks-orders">
              <span className="ks-wait" data-on={shownOrders === 0}>{t.wait}<i /><i /><i /></span>
              {ORDERS.map((n, i) => (
                <div key={n} className="ks-order" data-in={i < shownOrders} data-packed={packed} style={{ transitionDelay: packed ? `${i * 160}ms` : '0ms' }}>
                  <span className="ks-onum">№ {n}</span>
                  <span className="ks-ocity">{t.city[i]} · {fmt(12780)}</span>
                  <span className="ks-status" style={{ transitionDelay: packed ? `${i * 160}ms` : '0ms' }}>
                    {packed ? <>✓ {t.packed}</> : t.fresh}
                  </span>
                </div>
              ))}
            </div>
            <div className="ks-actions">
              <span className="ks-btn" data-press={step === 9}>{t.packAll}</span>
            </div>
          </section>
        </div>

        <span className="ks-cursor" data-at={step >= 8 && step <= 10 ? (step === 8 ? 'near' : 'btn') : 'off'}>
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 3l14 8-6 1.6L10.5 19z" fill="#2A0E0B" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        </span>
      </div>

      <div className="ks-waybill" data-in={step >= 11 && !fading}>
        <b>{t.waybills} · 3</b>
        <span className="ks-barcode" />
        <span className="ks-lines"><i /><i /><i /></span>
      </div>
    </div>
  )
}
