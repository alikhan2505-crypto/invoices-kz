'use client'

import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { MotionConfig, motion, useInView, useReducedMotion } from 'framer-motion'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { BentoGrid } from '@/components/ui/bento-grid'
import { PLAN_PRICES, type BillingPeriod } from '@/lib/plans/pricing'
import { miscDict } from '@/lib/i18n/misc'
import { findProduct, type ProductKey } from '@/lib/products'
import { InvoiceStoryCard, type StoryMockCopy } from './invoicesLanding/InvoiceStoryCard'
import { HeroStoryChips } from './invoicesLanding/HeroStoryChips'
import { StatCounter, type StatCopy } from './invoicesLanding/StatCounters'
import { StepFormArt, StepPaidArt, StepScanArt } from './invoicesLanding/StepIllustrations'
import { BentoMotionTile } from './invoicesLanding/BentoMotion'
import { DigitRoll } from './invoicesLanding/DigitRoll'
import { groupThousands } from './invoicesLanding/useLoopStep'
import './invoicesLanding/invoices-landing.css'

const EASE = [0.16, 1, 0.3, 1] as const

// violet/teal deepened from #7A6CF0/#0E99AA -- the originals read fine
// visually but measured 4.01:1 and 3.41:1 with white text (Lighthouse,
// live), short of the 4.5:1 AA floor for buttons/badges. These keep the
// same hue, just enough darker for real margin (~4.8:1 / ~5:1) against
// white text.
const COLOR = {
  violet: '#6E5ED8',
  teal: '#0B7A88',
  magenta: '#CE4C86',
  ground: '#0a0d1f',
}

// Shared with the standalone HeroMockupCard below (it has no access to
// Home()'s local `surface`/`border` consts since it doubles as the
// Spline 3D block's lazy-load/error fallback, defined at module scope).
const SURFACE = 'rgba(20,23,46,0.86)'
const BORDER = 'rgba(255,255,255,0.12)'
// SURFACE, уже наложенный на COLOR.ground, но непрозрачный: подложка
// карточки Про должна закрывать вращающийся градиент блика под собой.
const PRO_PANEL = '#13162C'

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/* ---------------------------------------------------------------- icons */

function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <polyline points="8.5 8 3.5 12 8.5 16" />
      <polyline points="15.5 8 20.5 12 15.5 16" />
      <line x1="13.2" y1="5.5" x2="10.8" y2="18.5" />
    </svg>
  )
}

/* Иконки плиток «Всё для счетов» -- анимированные, в
   invoicesLanding/BentoMotion.tsx. */

/* Иконки карточек «Другие продукты» (Kaspi Bot / AI-агент / Cashier API /
   Салон / CFO). StoreIcon и BotIcon -- из коммита 1da2e2c. */
function StoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M4.5 9 5.7 4.5h12.6L19.5 9" />
      <path d="M4.5 9a2 2 0 0 0 4 .1 2 2 0 0 0 4-.1 2 2 0 0 0 4 .1 2 2 0 0 0 4-.1" />
      <path d="M5.5 9.3V20h13V9.3" />
      <path d="M10 20v-5.5h4V20" />
    </svg>
  )
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <rect x="4" y="5" width="16" height="11" rx="3.5" />
      <path d="M9 20.5 11.2 16h1.6L15 20.5" />
      <circle cx="9.2" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M4 4v16h16" />
      <path d="M7.5 15l3.5-4 3 2.5L19 8" />
    </svg>
  )
}

function FaceIdIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9" />
      <path d="M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9" />
      <path d="M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
      <circle cx="9.2" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 15c1 1 5 1 6 0" />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 12h5.2" />
      <path d="M12.4 8.3a4.1 4.1 0 1 0 3.2 6.5" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M14 8.3h-1.6A1.9 1.9 0 0 0 10.5 10.2V12H9v2h1.5v5.2h2.1V14H14l.3-2h-1.7v-1.4a.6.6 0 0 1 .6-.6H14V8.3Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MailLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <rect x="3" y="5.5" width="14" height="10" rx="2" />
      <path d="M3.5 6.5 10 11l6.5-4.5" />
      <path d="M17.5 14.5h2a1.5 1.5 0 0 0 1.5-1.5v-1a1.5 1.5 0 0 0-3 0" />
    </svg>
  )
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.4 2.6 3.7 5.8 3.7 9s-1.3 6.4-3.7 9c-2.4-2.6-3.7-5.8-3.7-9S9.6 5.6 12 3Z" />
    </svg>
  )
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M3.5 8A2.5 2.5 0 0 1 6 5.5h10.5A2.5 2.5 0 0 1 19 8v.5H6A2.5 2.5 0 0 0 3.5 11V8Z" />
      <rect x="3.5" y="8.5" width="17" height="11.5" rx="2.3" />
      <circle cx="16.3" cy="14.2" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <rect x="3.5" y="9.5" width="17" height="10.5" rx="1.5" />
      <path d="M3.5 13.5h17" />
      <path d="M12 9.5V20" />
      <path d="M12 9.5c-1.8 0-3.7-1.1-3.7-2.8a1.9 1.9 0 0 1 3.7 0 1.9 1.9 0 0 1 3.7 0c0 1.7-1.9 2.8-3.7 2.8Z" />
    </svg>
  )
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M4.5 12h15" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

/* -------------------------------------------------------------- content */

type BentoKey = 'invoice' | 'kaspi' | 'esign' | 'esf' | 'acquiring' | 'templates'
// Продукты из блока «Другие продукты invoices.kz»: цвет и адрес лендинга
// берутся из PRODUCTS (src/lib/products.ts), здесь только тексты.
type OtherKey = Extract<ProductKey, 'kaspiShop' | 'aiAgent' | 'kaspiApi' | 'salon' | 'cfo'>
type AuthKey = 'google' | 'facebook' | 'faceid' | 'mail'
type ExtraKey = 'globe' | 'wallet' | 'gift'

const OTHER_ICONS: Record<OtherKey, ComponentType<{ className?: string }>> = {
  kaspiShop: StoreIcon,
  aiAgent: BotIcon,
  kaspiApi: ApiIcon,
  salon: CalendarIcon,
  cfo: ChartIcon,
}
const AUTH_ICONS: Record<AuthKey, ComponentType<{ className?: string }>> = {
  google: GoogleIcon,
  facebook: FacebookIcon,
  faceid: FaceIdIcon,
  mail: MailLinkIcon,
}
const EXTRA_ICONS: Record<ExtraKey, ComponentType<{ className?: string }>> = {
  globe: GlobeIcon,
  wallet: WalletIcon,
  gift: GiftIcon,
}

interface Copy {
  navCta: string
  heroTitleLine1: string
  heroTitleLine2: string
  heroSubtitle: string
  heroPrimaryCta: string
  heroSecondaryCta: string
  heroNote: string
  // история счёта в плашке у робота: создан -> отправлен -> оплачен
  heroStory: readonly [string, string, string]
  heroChip2: string
  stats: StatCopy[]
  mock: StoryMockCopy
  stepsEyebrow: string
  stepsTitle: string
  steps: { title: string; desc: string }[]
  bentoTitle: string
  bentoSubtitle: string
  bento: { icon: BentoKey; title: string; desc: string; chip: string; href?: string }[]
  othersTitle: string
  othersSubtitle: string
  others: { key: OtherKey; name: string; pitch: string; tag: string }[]
  pricing: {
    title: string
    subtitle: string
    toggleMonth: string
    toggleYear: string
    toggleYearBadge: string
    suffixMonth: string
    suffixYear: string
    annualSavingsLabel: (amount: string) => string
    free: { name: string; cta: string }
    basic: { name: string; cta: string }
    pro: { name: string; badge: string; cta: string }
    footnote: string
  }
  authEyebrow: string
  authTitle: string
  authSubtitle: string
  authMethods: { icon: AuthKey; label: string }[]
  extras: { icon: ExtraKey; label: string }[]
  ctaTitle: string
  ctaSubtitle: string
  ctaButton: string
  ctaNote: string
  footerLinks: { label: string; href: string }[]
  footerContact: { label: string; href: string }[]
  footerBottom: string
}

const COPY: Record<Lang, Copy> = {
  ru: {
    navCta: 'Войти',
    heroTitleLine1: 'Счёт за минуту.',
    heroTitleLine2: 'Оплата — через Kaspi',
    heroSubtitle: 'Счета, КП, АВР и накладные за минуту — PDF с подписью и печатью. Ссылка и QR Kaspi Pay прямо в счёте, оплата подтверждается сама.',
    heroPrimaryCta: 'Начать бесплатно',
    heroSecondaryCta: 'Как это работает',
    heroNote: '7 дней тарифа Базовый бесплатно — до 10 счетов',
    heroStory: ['Счёт № 2461 создан', 'Отправлен клиенту в WhatsApp', 'Оплачено через Kaspi · 174 000 ₸'],
    heroChip2: '2% — только с оплаченного',
    stats: [
      { kind: 'timer', value: 1, suffix: ' минута', unit: 'мин', label: 'от создания до отправки счёта' },
      { kind: 'ramp', value: 2, suffix: '%', label: 'комиссия — только с оплаченных через Kaspi счетов' },
      { kind: 'slot', value: 0, suffix: ' ₸', label: 'чтобы начать — бесплатно' },
    ],
    mock: {
      url: 'invoices.kz/i/2461', number: '№ 2461', client: 'ТОО «Ромашка»', service: 'Консалтинговые услуги', vat: 'НДС 16%', total: 'Итого', paid: 'Оплачено · Kaspi',
      draft: 'Черновик', awaiting: 'Ожидает оплаты', payQr: 'Оплатите по Kaspi QR', stamp: 'Оплачено',
    },
    stepsEyebrow: 'Как это работает',
    stepsTitle: 'Три шага до оплаты',
    steps: [
      { title: 'Создайте счёт', desc: 'Заполните данные клиента, добавьте услуги и/или товары — PDF с подписью и печатью готов за минуту.' },
      { title: 'Клиент оплачивает через Kaspi', desc: 'Отправьте ссылку — клиент платит по Kaspi QR прямо со страницы счёта, без регистрации.' },
      { title: 'Оплата подтверждается сама', desc: 'Платформа сама видит оплату и помечает счёт оплаченным — сверять вручную ничего не нужно.' },
    ],
    bentoTitle: 'Всё для счетов',
    bentoSubtitle: 'От счёта до подписи, ЭСФ и сверки оплат — в одном кабинете.',
    bento: [
      { icon: 'invoice', title: 'Счета и документы', desc: 'Счета, КП, АВР и накладные за минуту — PDF с подписью и печатью, НДС 16%, отправка ссылкой или на email.', chip: '1 минута' },
      { icon: 'kaspi', title: 'Оплата через Kaspi в счёте', desc: 'Ссылка и QR Kaspi Pay прямо в счёте: клиент платит без регистрации, а счёт сам становится оплаченным.', chip: '2% только с оплаченных' },
      { icon: 'esign', title: 'ЭЦП и договоры', desc: 'Подписывайте счета, договоры, АВР и накладные ЭЦП через QR или eGov mobile. Клиент подписывает со своей стороны онлайн — без визита в офис.', chip: 'eGov mobile / QR' },
      { icon: 'esf', title: 'ЭСФ из счёта', desc: 'Выставляйте электронный счёт-фактуру в ИС ЭСФ прямо из готового счёта — без повторного ввода данных.', chip: 'ИС ЭСФ' },
      { icon: 'acquiring', title: 'Сверка оплат по выписке', desc: 'Загрузите выписку банка в Excel — платформа найдёт оплаты по БИН и сумме и сопоставит их со счетами.', chip: 'Excel-выписка' },
      { icon: 'templates', title: 'Шаблоны и повторяющиеся счета', desc: 'Сохраните счёт как шаблон или включите повтор — ежемесячные счета постоянным клиентам выставляются сами.', chip: 'автоматически' },
    ],
    othersTitle: 'Другие продукты invoices.kz',
    othersSubtitle: 'Тот же аккаунт и тот же кошелёк — подключайте, когда понадобится.',
    others: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Демпинг цен и заказы Kaspi Магазина в одном кабинете', tag: 'Входит в Про' },
      { key: 'aiAgent', name: 'AI-агент', pitch: 'Отвечает клиентам в WhatsApp, Instagram и на сайте', tag: 'Входит в Про' },
      { key: 'kaspiApi', name: 'Kaspi Cashier API', pitch: 'Приём оплат Kaspi Pay на вашем сайте через API', tag: '2% с платежа' },
      { key: 'salon', name: 'Салон', pitch: 'Записи клиентов, мастера и сайт салона', tag: 'По заявке' },
      { key: 'cfo', name: 'CFO', pitch: 'БДР, БДДС и платёжный календарь', tag: 'Закрытый тест' },
    ],
    pricing: {
      title: 'Прозрачные цены',
      subtitle: 'Начните бесплатно — растите, когда будете готовы.',
      toggleMonth: 'Месяц',
      toggleYear: 'Год',
      toggleYearBadge: '2 месяца в подарок',
      suffixMonth: '/мес',
      suffixYear: '/год',
      annualSavingsLabel: (amount) => `Экономия ${amount} ₸/год`,
      free: { name: 'Бесплатно', cta: 'Начать бесплатно' },
      basic: { name: 'Базовый', cta: 'Подключить' },
      pro: { name: 'Про', badge: 'Максимум', cta: 'Подключить' },
      footnote: 'Kaspi Bot и AI-агент открыты всем на тарифе Про и сверх тарифа списывают с кошелька: 5 ₸ за проверку цены и 5 ₸ за ответ AI-агента. Оплата Kaspi Pay по ссылке в счёте и Kaspi Cashier API работают на любом тарифе — 2% от оплаченной суммы, с кошелька.',
    },
    authEyebrow: 'Доступ',
    authTitle: 'Вход без паролей',
    authSubtitle: 'Google, Facebook, Face ID / Touch ID или ссылка на email — заходите за секунду.',
    authMethods: [
      { icon: 'google', label: 'Google' },
      { icon: 'facebook', label: 'Facebook' },
      { icon: 'faceid', label: 'Face ID / Touch ID' },
      { icon: 'mail', label: 'Ссылка на email' },
    ],
    extras: [
      { icon: 'globe', label: '3 языка: русский, казахский, английский' },
      { icon: 'wallet', label: 'Единый кошелёк в ₸ для всех сервисов' },
      { icon: 'gift', label: 'Реферальная программа' },
    ],
    ctaTitle: 'Готовы избавиться от бумажной волокиты?',
    ctaSubtitle: 'Зарегистрируйтесь — 7 дней тарифа Базовый бесплатно, до 10 счетов.',
    ctaButton: 'Начать бесплатно',
    ctaNote: 'Отмена в любое время',
    footerLinks: [
      { label: 'Политика', href: '/privacy' },
      { label: 'Условия', href: '/terms' },
      { label: 'Удаление данных', href: '/data-deletion' },
      { label: 'Бесплатно → Склейка накладных', href: '/tools/waybills' },
      { label: 'Бесплатно → Калькулятор маржи', href: '/tools/margin' },
      { label: 'Полезное → Гайды для бизнеса', href: '/guides' },
      { label: 'Для разработчиков → Cashier API', href: 'https://api.invoices.kz' },
    ],
    footerContact: [
      { label: 'Email', href: 'mailto:support@invoices.kz' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана',
  },
  kk: {
    navCta: 'Кіру',
    heroTitleLine1: 'Шот бір минутта.',
    heroTitleLine2: 'Төлем — Kaspi арқылы',
    heroSubtitle: 'Шот, КҰ, ОҚА және жүкқұжат бір минутта — қолтаңба мен мөрі бар PDF. Kaspi Pay сілтемесі мен QR коды шоттың өзінде, төлем өздігінен расталады.',
    heroPrimaryCta: 'Тегін бастау',
    heroSecondaryCta: 'Бұл қалай жұмыс істейді',
    heroNote: 'Базалық тариф 7 күн тегін — 10 шотқа дейін',
    heroStory: ['№ 2461 шот жасалды', 'Клиентке WhatsApp арқылы жіберілді', 'Kaspi арқылы төленді · 174 000 ₸'],
    heroChip2: '2% — тек төленген шоттан',
    stats: [
      { kind: 'timer', value: 1, suffix: ' минут', unit: 'мин', label: 'шот жасаудан жіберуге дейін' },
      { kind: 'ramp', value: 2, suffix: '%', label: 'тек Kaspi арқылы төленген шоттан алынатын комиссия' },
      { kind: 'slot', value: 0, suffix: ' ₸', label: 'бастау үшін — тегін' },
    ],
    mock: {
      url: 'invoices.kz/i/2461', number: '№ 2461', client: '«Ромашка» ЖШС', service: 'Кеңес беру қызметтері', vat: 'ҚҚС 16%', total: 'Барлығы', paid: 'Төленді · Kaspi',
      draft: 'Жоба', awaiting: 'Төлем күтілуде', payQr: 'Kaspi QR арқылы төлеңіз', stamp: 'Төленді',
    },
    stepsEyebrow: 'Қалай жұмыс істейді',
    stepsTitle: 'Төлемге дейін үш қадам',
    steps: [
      { title: 'Шот жасаңыз', desc: 'Клиент деректерін толтырып, қызметтер мен/немесе тауарларды қосыңыз — қолтаңба мен мөрі бар PDF бір минутта дайын.' },
      { title: 'Клиент Kaspi арқылы төлейді', desc: 'Сілтемені жіберіңіз — клиент тіркелусіз, тікелей шот бетінен Kaspi QR арқылы төлейді.' },
      { title: 'Төлем өздігінен расталады', desc: 'Платформа төлемді өзі көріп, шотты төленді деп белгілейді — қолмен тексерудің қажеті жоқ.' },
    ],
    bentoTitle: 'Шотқа қажеттінің бәрі',
    bentoSubtitle: 'Шоттан бастап қолтаңбаға, ЭШФ мен төлемдерді салыстыруға дейін — бір кабинетте.',
    bento: [
      { icon: 'invoice', title: 'Шоттар мен құжаттар', desc: 'Шот, КҰ, ОҚА және жүкқұжат бір минутта — қолтаңба мен мөрі бар PDF, ҚҚС 16%, сілтемемен немесе email арқылы жіберу.', chip: '1 минут' },
      { icon: 'kaspi', title: 'Шоттың ішінде Kaspi төлемі', desc: 'Kaspi Pay сілтемесі мен QR коды шоттың өзінде: клиент тіркелмей төлейді, ал шот өзі төленді деп белгіленеді.', chip: 'тек төленгеннен 2%' },
      { icon: 'esign', title: 'ЭЦҚ және шарттар', desc: 'Шотқа, шартқа, ОҚА мен жүкқұжатқа QR немесе eGov mobile арқылы ЭЦҚ қойыңыз. Клиент те өз тарапынан онлайн қол қояды — кеңсеге барудың қажеті жоқ.', chip: 'eGov mobile / QR' },
      { icon: 'esf', title: 'Шоттан ЭШФ', desc: 'Дайын шоттан электрондық шот-фактураны ЭШФ ақпараттық жүйесіне бірден жіберіңіз — деректерді қайта енгізбей-ақ.', chip: 'ЭШФ АЖ' },
      { icon: 'acquiring', title: 'Төлемдерді үзінді көшірмемен салыстыру', desc: 'Банк үзінді көшірмесін Excel-ден жүктеңіз — платформа төлемдерді БСН мен сома бойынша тауып, шоттармен сәйкестендіреді.', chip: 'Excel үзінді көшірме' },
      { icon: 'templates', title: 'Үлгілер мен қайталанатын шоттар', desc: 'Шотты үлгі ретінде сақтаңыз немесе қайталауды қосыңыз — тұрақты клиенттерге ай сайынғы шоттар өздігінен жазылады.', chip: 'автоматты түрде' },
    ],
    othersTitle: 'invoices.kz-тің басқа өнімдері',
    othersSubtitle: 'Аккаунт та, әмиян да ортақ — қажет болғанда қосыңыз.',
    others: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Kaspi Дүкеніндегі баға демпингі мен тапсырыстар бір кабинетте', tag: 'Про тарифіне кіреді' },
      { key: 'aiAgent', name: 'AI-агент', pitch: 'Клиенттерге WhatsApp, Instagram және сайтта жауап береді', tag: 'Про тарифіне кіреді' },
      { key: 'kaspiApi', name: 'Kaspi Cashier API', pitch: 'Kaspi Pay төлемдерін сайтыңызда API арқылы қабылдау', tag: 'Төлемнен 2%' },
      { key: 'salon', name: 'Салон', pitch: 'Клиенттерді жазу, шеберлер және салон сайты', tag: 'Өтінім бойынша' },
      { key: 'cfo', name: 'CFO', pitch: 'Бюджет, ақша ағыны және төлем күнтізбесі', tag: 'Жабық сынақ' },
    ],
    pricing: {
      title: 'Ашық бағалар',
      subtitle: 'Тегін бастаңыз — дайын болған кезде өсіңіз.',
      toggleMonth: 'Ай',
      toggleYear: 'Жыл',
      toggleYearBadge: '2 ай сыйлыққа',
      suffixMonth: '/ай',
      suffixYear: '/жыл',
      annualSavingsLabel: (amount) => `Үнемдеу ${amount} ₸/жыл`,
      free: { name: 'Тегін', cta: 'Тегін бастау' },
      basic: { name: 'Базалық', cta: 'Қосылу' },
      pro: { name: 'Про', badge: 'Максимум', cta: 'Қосылу' },
      footnote: 'Kaspi Bot пен AI-агент Про тарифіндегі барлық пайдаланушыға ашық, тарифтен бөлек әмияннан төленеді: бағаны бір тексеру — 5 ₸, AI-агенттің бір жауабы — 5 ₸. Шоттағы Kaspi Pay сілтемесі арқылы төлем және Kaspi Cashier API кез келген тарифте жұмыс істейді — төленген соманың 2%-ы әмияннан алынады.',
    },
    authEyebrow: 'Кіру',
    authTitle: 'Құпия сөзсіз кіру',
    authSubtitle: 'Google, Facebook, Face ID / Touch ID немесе email сілтемесі — бір секундта кіріңіз.',
    authMethods: [
      { icon: 'google', label: 'Google' },
      { icon: 'facebook', label: 'Facebook' },
      { icon: 'faceid', label: 'Face ID / Touch ID' },
      { icon: 'mail', label: 'Email сілтемесі' },
    ],
    extras: [
      { icon: 'globe', label: '3 тіл: орысша, қазақша, ағылшынша' },
      { icon: 'wallet', label: 'Барлық қызметтерге ортақ ₸ әмиян' },
      { icon: 'gift', label: 'Реферал бағдарламасы' },
    ],
    ctaTitle: 'Қағаз әуреден құтылуға дайынсыз ба?',
    ctaSubtitle: 'Тіркеліңіз — Базалық тариф 7 күн тегін, 10 шотқа дейін.',
    ctaButton: 'Тегін бастау',
    ctaNote: 'Кез келген уақытта бас тартуға болады',
    footerLinks: [
      { label: 'Құпиялылық', href: '/privacy' },
      { label: 'Шарттар', href: '/terms' },
      { label: 'Деректерді жою', href: '/data-deletion' },
      { label: 'Тегін → Жүкқұжаттарды желімдеу', href: '/tools/waybills' },
      { label: 'Тегін → Маржа калькуляторы', href: '/tools/margin' },
      { label: 'Пайдалы → Бизнеске арналған нұсқаулар', href: '/guides/kk' },
      { label: 'Әзірлеушілерге → Cashier API', href: 'https://api.invoices.kz' },
    ],
    footerContact: [
      { label: 'Email', href: 'mailto:support@invoices.kz' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · «First Project» ЖК · БСН 890525350143 · Астана қ.',
  },
  en: {
    navCta: 'Log in',
    heroTitleLine1: 'Invoice in a minute.',
    heroTitleLine2: 'Get paid via Kaspi',
    heroSubtitle: 'Invoices, quotes, acts and delivery notes in a minute — a PDF with your signature and stamp. A Kaspi Pay link and QR code right in the invoice; payment confirms itself.',
    heroPrimaryCta: 'Start for free',
    heroSecondaryCta: 'How it works',
    heroNote: 'Basic plan free for 7 days — up to 10 invoices',
    heroStory: ['Invoice No. 2461 created', 'Sent to the client on WhatsApp', 'Paid via Kaspi · 174 000 ₸'],
    heroChip2: '2% — only on paid invoices',
    stats: [
      { kind: 'timer', value: 1, suffix: ' minute', unit: 'min', label: 'from creating to sending an invoice' },
      { kind: 'ramp', value: 2, suffix: '%', label: 'fee — only on invoices actually paid via Kaspi' },
      { kind: 'slot', value: 0, suffix: ' ₸', label: 'to get started — free' },
    ],
    mock: {
      url: 'invoices.kz/i/2461', number: 'No. 2461', client: 'Romashka LLP', service: 'Consulting services', vat: 'VAT 16%', total: 'Total', paid: 'Paid · Kaspi',
      draft: 'Draft', awaiting: 'Awaiting payment', payQr: 'Pay with Kaspi QR', stamp: 'Paid',
    },
    stepsEyebrow: 'How it works',
    stepsTitle: 'Three steps to get paid',
    steps: [
      { title: 'Create an invoice', desc: "Fill in the client's details, add services and/or goods — a signed and stamped PDF is ready in a minute." },
      { title: 'Client pays via Kaspi', desc: 'Send the link — the client pays with a Kaspi QR code right from the invoice page, no signup required.' },
      { title: 'Payment confirms itself', desc: 'The platform detects the payment and marks the invoice paid automatically — nothing to reconcile by hand.' },
    ],
    bentoTitle: 'Everything for invoicing',
    bentoSubtitle: 'From the invoice to signatures, e-invoices and payment matching — in one dashboard.',
    bento: [
      { icon: 'invoice', title: 'Invoices & documents', desc: 'Invoices, quotes, acts and delivery notes in a minute — a signed and stamped PDF, 16% VAT, sent by link or email.', chip: '1 minute' },
      { icon: 'kaspi', title: 'Kaspi payment in the invoice', desc: 'A Kaspi Pay link and QR code right in the invoice: the client pays without signing up, and the invoice marks itself paid.', chip: '2% on paid invoices only' },
      { icon: 'esign', title: 'E-signature & contracts', desc: 'Sign invoices, contracts, acts and delivery notes with a digital signature via QR or eGov mobile. Your client signs online too — no office visit.', chip: 'eGov mobile / QR' },
      { icon: 'esf', title: 'E-invoices (ESF)', desc: 'Issue an electronic VAT invoice to the ESF system straight from a finished invoice — no retyping.', chip: 'ESF system' },
      { icon: 'acquiring', title: 'Bank statement matching', desc: 'Upload your bank statement in Excel — payments are found by BIN and amount and matched to your invoices.', chip: 'Excel statement' },
      { icon: 'templates', title: 'Templates & recurring invoices', desc: 'Save an invoice as a template or switch on repeats — monthly invoices to regular clients go out on their own.', chip: 'on autopilot' },
    ],
    othersTitle: 'More from invoices.kz',
    othersSubtitle: 'Same account, same wallet — add them when you need them.',
    others: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Kaspi Shop repricing and orders in one dashboard', tag: 'Included in Pro' },
      { key: 'aiAgent', name: 'AI agent', pitch: 'Answers customers on WhatsApp, Instagram and your website', tag: 'Included in Pro' },
      { key: 'kaspiApi', name: 'Kaspi Cashier API', pitch: 'Accept Kaspi Pay on your own website via API', tag: '2% per payment' },
      { key: 'salon', name: 'Salon', pitch: 'Client bookings, staff schedules and a salon website', tag: 'By request' },
      { key: 'cfo', name: 'CFO', pitch: 'P&L, cash flow and a payment calendar', tag: 'Closed beta' },
    ],
    pricing: {
      title: 'Transparent pricing',
      subtitle: "Start for free — grow when you're ready.",
      toggleMonth: 'Month',
      toggleYear: 'Year',
      toggleYearBadge: '2 months free',
      suffixMonth: '/mo',
      suffixYear: '/yr',
      annualSavingsLabel: (amount) => `Save ${amount} ₸/yr`,
      free: { name: 'Free', cta: 'Start for free' },
      basic: { name: 'Basic', cta: 'Subscribe' },
      pro: { name: 'Pro', badge: 'Maximum', cta: 'Subscribe' },
      footnote: 'Kaspi Bot and the AI agent are open to every Pro user and, on top of the plan, draw from your wallet: ₸5 per price check and ₸5 per AI-agent reply. Kaspi Pay links in invoices and the Kaspi Cashier API work on any plan — 2% of the paid amount, charged to your wallet.',
    },
    authEyebrow: 'Access',
    authTitle: 'Sign in without passwords',
    authSubtitle: 'Google, Facebook, Face ID / Touch ID, or an email link — sign in in seconds.',
    authMethods: [
      { icon: 'google', label: 'Google' },
      { icon: 'facebook', label: 'Facebook' },
      { icon: 'faceid', label: 'Face ID / Touch ID' },
      { icon: 'mail', label: 'Email link' },
    ],
    extras: [
      { icon: 'globe', label: '3 languages: Russian, Kazakh, English' },
      { icon: 'wallet', label: 'One shared ₸ wallet across every service' },
      { icon: 'gift', label: 'Referral program' },
    ],
    ctaTitle: 'Ready to drop the paperwork?',
    ctaSubtitle: 'Sign up — 7 days of the Basic plan free, up to 10 invoices.',
    ctaButton: 'Start for free',
    ctaNote: 'Cancel anytime',
    footerLinks: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Data Deletion', href: '/data-deletion' },
      { label: 'Free → Waybill Merger', href: '/tools/waybills' },
      { label: 'Free → Margin Calculator', href: '/tools/margin' },
      { label: 'Guides → For business', href: '/guides' },
      { label: 'For Developers → Cashier API', href: 'https://api.invoices.kz' },
    ],
    footerContact: [
      { label: 'Email', href: 'mailto:support@invoices.kz' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · First Project Sole Proprietorship · BIN 890525350143 · Astana, Kazakhstan',
  },
}

/* ------------------------------------------------------------ helpers */

function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li'
}) {
  const reduce = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-72px' }}
      transition={{ duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce ? 0 : delay }}
    >
      {children}
    </Comp>
  )
}

/* The invoice/Kaspi mockup card that used to be the hero's only visual. It
   now also does double duty as the lazy-loaded 3D scene's loading and
   error fallback (see Spline3D/SplineErrorBoundary below), so it's a
   standalone component that fetches its own copy via useLanguage() rather
   than a prop, since next/dynamic's `loading` option and a class-based
   error boundary can't easily be handed Home()'s local `t`. */
function HeroMockupCard() {
  const { lang } = useLanguage()
  // Сама карточка-история (строки -> итог с НДС -> Kaspi QR -> штамп
  // «Оплачено», по кругу) -- в invoicesLanding/InvoiceStoryCard.tsx.
  return <InvoiceStoryCard t={COPY[lang].mock} />
}

/* Desktop-only interactive 3D hero visual — vendored from 21st.dev
   (component `splite` by serafimcloud, fetched via the 21st MCP:
   mcp__21st__search + mcp__21st__get_component, source at
   src/components/ui/splite.tsx). Loaded through next/dynamic with
   ssr:false so the ~1MB @splinetool/react-spline runtime never touches
   the server render or ships in the initial bundle; `loading` reuses the
   same mockup card so there's no layout jump while the chunk fetches.
   Defined at module scope (not inside Home()) so it isn't re-created,
   and thus re-fetched, on every render. */
const Spline3D = dynamic(() => import('@/components/ui/splite').then((mod) => mod.SplineScene), {
  ssr: false,
  loading: () => <HeroMockupCard />,
})

/* React error boundaries are the only way to catch a failed lazy chunk
   (e.g. the Spline CDN or our own JS chunk failing to fetch) — Suspense's
   `loading` only covers the pending state, not a rejected one. Falls back
   to the same mockup card rather than leaving the hero blank. */
class SplineErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[hero-3d] Spline scene failed to load, showing fallback', error)
  }
  render() {
    if (this.state.hasError) return <HeroMockupCard />
    return this.props.children
  }
}

/* Gates the 3D scene to lg+ viewports client-side, on purpose: this is
   what actually stops the ~1MB @splinetool/react-spline chunk and the
   Spline scene request from ever being fetched on phones, not the `lg:`
   CSS class alone (a CSS-hidden element still mounts and fetches). Starts
   false so SSR/first client render agree (no hydration mismatch) and the
   3D block only mounts after this flips true post-hydration. */
function useIsDesktop(breakpoint = 1024) {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    setIsDesktop(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return isDesktop
}

/* ----------------------------------------------------------------- page */

// Moved off apex '/' (21.09.2026, stage 5 of the product split) so the root
// can become the Products Hub -- this page now lives at /invoices-landing,
// reached publicly through docs.invoices.kz (see hostRouting.ts) and, until
// NEXT_PUBLIC_ROOT_HUB_LIVE flips, also still at '/' itself (see
// src/app/page.tsx). Content and behaviour are otherwise unchanged from the
// original homepage.
export default function InvoicesLandingPage() {
  const { lang, setLang } = useLanguage()
  const t = COPY[lang]
  const reduce = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const isDesktop = useIsDesktop()
  // пятна за hero дрейфуют только пока hero на экране (см. AmbientBlobs)
  const heroRef = useRef<HTMLElement>(null)
  const heroInView = useInView(heroRef, { margin: '0px' })

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Absolute, not router.push: this page can now be served from
  // docs.invoices.kz (see hostRouting.ts), where /login would resolve on
  // the WRONG origin under client-side routing. A plain assignment always
  // does a real navigation to the apex, correctly, from either host.
  function goLogin(plan?: 'basic' | 'pro', period?: BillingPeriod) {
    const qs = plan && period ? `?plan=${plan}&period=${period}` : ''
    window.location.href = `https://invoices.kz/login${qs}`
  }
  const scrollToSteps = () => document.getElementById('how')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })

  const surface = SURFACE
  const border = BORDER

  return (
    // reducedMotion="user": при prefers-reduced-motion framer-motion сам
    // гасит transform-анимации (въезды, барабаны, штампы), оставляя только
    // opacity; зацикленные сценки при этом стоят на финальном кадре.
    <MotionConfig reducedMotion="user">
    <div
      className="min-h-screen overflow-x-hidden text-white"
      style={{ background: COLOR.ground, fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI Variable", "Segoe UI", Roboto, sans-serif' }}
    >
      {/* ---------------------------------------------------------- nav */}
      <header
        className="fixed inset-x-0 top-0 z-50 transition-shadow duration-300"
        style={{
          background: scrolled ? 'rgba(9,11,26,0.92)' : 'rgba(9,11,26,0.62)',
          borderBottom: `1px solid ${border}`,
          boxShadow: scrolled ? '0 12px 30px rgba(0,0,0,0.35)' : 'none',
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 sm:px-8">
          <span className="text-[15px] font-bold tracking-[0.12em]">
            INVOICES<span style={{ color: COLOR.violet }}>.KZ</span>
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${border}` }}>
              {(['ru', 'kk', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    background: lang === l ? COLOR.violet : 'transparent',
                    color: lang === l ? '#fff' : 'rgba(255,255,255,0.68)',
                  }}
                  aria-pressed={lang === l}
                >
                  {l === 'kk' ? 'ҚЗ' : l}
                </button>
              ))}
            </div>
            <button
              onClick={() => goLogin()}
              className="motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-[0.97] rounded-xl px-4 py-2 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: COLOR.violet }}
            >
              {t.navCta}
            </button>
          </div>
        </div>
      </header>

      <main>
      {/* --------------------------------------------------------- hero */}
      <section ref={heroRef} className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <AmbientBlobs paused={!heroInView} />

        <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:gap-14 lg:text-left">
            <div className="flex w-full flex-col items-center lg:w-1/2 lg:items-start">
              <motion.h1
                initial={reduce ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.06 }}
                className="text-[clamp(2.4rem,7vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.03em]"
              >
                {t.heroTitleLine1}
                <br />
                {/* A flat COLOR.teal (#0E99AA) here measured only 2.65:1 against
                    the real composited background (the ambient blur blobs
                    tint it lighter than the page's flat ground color) --
                    confirmed by a live Lighthouse re-check, not assumed.
                    #5EEAD4 keeps the teal identity but clears 3:1 with real
                    margin (~6:1) regardless of exactly which blob is behind it. */}
                <span style={{ color: '#5EEAD4' }}>
                  {t.heroTitleLine2}
                </span>
              </motion.h1>

              <motion.p
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.14 }}
                className="mt-6 max-w-xl text-[16px] leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.82)' }}
              >
                {t.heroSubtitle}
              </motion.p>

              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.2 }}
                className="mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                <button
                  onClick={() => goLogin()}
                  className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] flex items-center gap-2 rounded-2xl px-7 py-3.5 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: COLOR.violet, boxShadow: `0 14px 34px -12px ${COLOR.violet}` }}
                >
                  {t.heroPrimaryCta}
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={scrollToSteps}
                  className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] rounded-2xl px-7 py-3.5 text-[15px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: surface, border: `1px solid ${border}`, color: 'rgba(255,255,255,0.85)' }}
                >
                  {t.heroSecondaryCta}
                </button>
              </motion.div>
              <motion.p
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.28 }}
                className="mt-4 text-[12px]"
                style={{ color: 'rgba(255,255,255,0.68)' }}
              >
                {t.heroNote}
              </motion.p>
            </div>

            {/* Interactive 3D scene — desktop only (lg+), gated client-side
                by isDesktop so nothing Spline-related ever loads on phones.
                Falls back to the invoice mockup card while the chunk loads
                or if it errors (see Spline3D/SplineErrorBoundary). */}
            {isDesktop && (
              <div className="relative h-[420px] w-full shrink-0 lg:h-[480px] lg:w-1/2">
                <SplineErrorBoundary>
                  <Spline3D
                    scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                    className="h-full w-full"
                    globalMouseTracking
                  />
                </SplineErrorBoundary>

                {/* плашки у робота: история одного счёта по кругу
                    (создан -> отправлен в WhatsApp -> оплачен через Kaspi)
                    + «2% только с оплаченного», вспыхивает в момент оплаты */}
                <HeroStoryChips story={t.heroStory} feeChip={t.heroChip2} />
              </div>
            )}
          </div>

          {/* mockup — mobile/tablet hero visual; on lg+ the 3D scene above
              takes over (this card only reappears there as its load/error
              fallback) */}
          <div className="mt-10 lg:hidden">
            <HeroMockupCard />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- stats */}
      <Reveal className="relative z-10" as="div">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8" style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {t.stats.map((s) => (
              <StatCounter key={s.kind} stat={s} decimalSep={lang === 'en' ? '.' : ','} />
            ))}
          </div>
        </div>
      </Reveal>

      {/* ----------------------------------------------------------- how */}
      <section id="how" className="relative z-10 mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <Reveal className="text-center">
          <Eyebrow color={COLOR.teal}>{t.stepsEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.75rem)] font-semibold tracking-[-0.02em]">{t.stepsTitle}</h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-4">
          {t.steps.map((s, i) => (
            <Reveal key={s.title} delay={Math.min(i * 0.05, 0.2)}>
              {/* у каждого шага -- своя маленькая зацикленная сценка справа
                  (на телефоне -- под текстом), коробка фиксированного размера */}
              <div
                className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:translate-x-1.5 flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-center"
                style={{ background: surface, border: `1px solid ${border}` }}
              >
                <div className="flex flex-1 items-start gap-5">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[16px] font-bold"
                    style={{ background: `linear-gradient(135deg, ${COLOR.violet}, ${COLOR.teal})` }}
                  >
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold">{s.title}</h3>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{s.desc}</p>
                  </div>
                </div>
                <div className="shrink-0">
                  {i === 0 && <StepFormArt />}
                  {i === 1 && <StepScanArt />}
                  {i === 2 && <StepPaidArt t={t.mock} />}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- bento */}
      {/* Replaces the old asymmetric two-block "features" list -- 21st.dev's
          Bento Grid (kokonutd, id 622) adapted for this app, see
          src/components/ui/bento-grid.tsx for the vendoring notes. Keeps
          the old section's #features anchor id since external links/CTAs
          may already point at it. */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <Reveal className="max-w-xl">
          <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.bentoTitle}</h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.bentoSubtitle}</p>
        </Reveal>

        <div className="mt-12">
          <BentoGrid>
            {t.bento.map((item, i) => (
              <Reveal key={item.title} delay={Math.min(i * 0.06, 0.3)} className="h-full">
                {/* иконка плитки оживает по смыслу фичи при появлении и при
                    наведении -- см. invoicesLanding/BentoMotion.tsx */}
                <BentoMotionTile
                  kind={item.icon}
                  item={{ title: item.title, description: item.desc, chip: item.chip, href: item.href }}
                />
              </Reveal>
            ))}
          </BentoGrid>
        </div>
      </section>

      {/* ------------------------------------------------ other products */}
      <OtherProducts t={t} />

      {/* -------------------------------------------------------- pricing */}
      <PricingSection t={t} lang={lang} goLogin={goLogin} />

      {/* ---------------------------------------------------------- auth */}
      <section className="relative z-10 mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <Reveal className="text-center">
          <Eyebrow color={COLOR.teal}>{t.authEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.7rem,3.4vw,2.25rem)] font-semibold tracking-[-0.02em]">{t.authTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-[14px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.authSubtitle}</p>
        </Reveal>

        <div className="mt-9 flex flex-wrap justify-center gap-3">
          {t.authMethods.map((m, i) => {
            const AIcon = AUTH_ICONS[m.icon]
            return (
              <Reveal key={m.label} delay={i * 0.04}>
                <div
                  className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 flex items-center gap-2.5 rounded-xl px-4 py-3"
                  style={{ background: surface, border: `1px solid ${border}` }}
                >
                  <span style={{ color: COLOR.teal }}>
                    <AIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{m.label}</span>
                </div>
              </Reveal>
            )
          })}
        </div>

        <div className="mx-auto mt-6 max-w-3xl border-t" style={{ borderColor: border }} />

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {t.extras.map((e, i) => {
            const EIcon = EXTRA_ICONS[e.icon]
            return (
              <Reveal key={e.label} delay={i * 0.04}>
                <div className="flex items-center gap-2.5 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span style={{ color: COLOR.violet }}>
                    <EIcon className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{e.label}</span>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ----------------------------------------------------- final cta */}
      <section className="relative z-10 mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-[28px] px-6 py-14 text-center sm:px-14"
            style={{ background: `linear-gradient(135deg, rgba(122,108,240,0.16), rgba(14,153,170,0.12))`, border: `1px solid ${border}` }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
              style={{ background: `radial-gradient(circle, ${COLOR.violet}40, transparent 70%)`, filter: 'blur(10px)' }}
            />
            <h2 className="relative text-[clamp(1.8rem,4vw,2.5rem)] font-semibold tracking-[-0.02em]">{t.ctaTitle}</h2>
            <p className="relative mx-auto mt-3 max-w-sm text-[14.5px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.ctaSubtitle}</p>
            <button
              onClick={() => goLogin()}
              className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] relative mt-8 inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: COLOR.violet, boxShadow: `0 14px 34px -12px ${COLOR.violet}` }}
            >
              {t.ctaButton}
              <ArrowRightIcon className="h-4 w-4" />
            </button>
            <p className="relative mt-4 text-[12px]" style={{ color: 'rgba(255,255,255,0.68)' }}>{t.ctaNote}</p>
          </div>
        </Reveal>
      </section>
      </main>

      {/* ------------------------------------------------------- footer */}
      <footer className="relative z-10 mx-auto max-w-6xl px-5 py-10 sm:px-8" style={{ borderTop: `1px solid ${border}` }}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <span className="text-[13px] font-bold tracking-[0.1em]">
            INVOICES<span style={{ color: COLOR.violet }}>.KZ</span>
          </span>
          <nav className="flex flex-wrap gap-5" aria-label="legal">
            {t.footerLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[12px] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: 'rgba(255,255,255,0.68)' }}
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap gap-5">
            {t.footerContact.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target={l.href.startsWith('http') ? '_blank' : undefined}
                rel={l.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="text-[12px] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: 'rgba(255,255,255,0.68)' }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <div className="mt-6 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
          {t.footerBottom}
        </div>
      </footer>
    </div>
    </MotionConfig>
  )
}

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
      <span className="inline-block h-1 w-4 rounded-full" style={{ background: color }} />
      {children}
    </span>
  )
}

/* Цветовые пятна за hero. Дрейф перенесён с framer-motion на CSS
   (invoices-landing.css): на телефонах (до lg) пятна стоят на месте и
   размыты слабее, вне экрана дрейф на паузе, при reduced motion -- стоят. */
function AmbientBlobs({ paused }: { paused: boolean }) {
  return (
    <div aria-hidden="true" data-paused={paused ? 'true' : undefined} className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="inv-blob -left-32 -top-24 h-[520px] w-[520px]" style={{ background: COLOR.violet, opacity: 0.32 }} />
      <div className="inv-blob inv-blob-b -right-24 top-10 h-[460px] w-[460px]" style={{ background: COLOR.teal, opacity: 0.28 }} />
      <div className="inv-blob inv-blob-c bottom-[-140px] left-1/3 h-[300px] w-[300px]" style={{ background: COLOR.magenta, opacity: 0.16 }} />
    </div>
  )
}

/* «Другие продукты invoices.kz» -- заменил BotShowcase (14.10.2026): у Kaspi
   Bot и AI-агента теперь свои лендинги с живыми демо, дублировать их здесь
   незачем. Компактные карточки-ссылки на поддомены продуктов; цвет и адрес
   берутся из PRODUCTS (src/lib/products.ts), чтобы не разъезжались с хабом
   и самими лендингами. Акцент продукта -- полоска сверху, плитка иконки и
   рамка при наведении (через CSS-переменную --glow: инлайновый
   border перебил бы hover-правило). Наведение: подъём, свечение цветом
   продукта, иконка чуть поворачивается (invoices-landing.css, движение --
   только без prefers-reduced-motion). */
function OtherProducts({ t }: { t: Copy }) {
  return (
    <section id="products" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Reveal className="max-w-2xl">
        <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.othersTitle}</h2>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.othersSubtitle}</p>
      </Reveal>

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {t.others.map((o, i) => {
          const product = findProduct(o.key)
          if (!product?.landing) return null
          const Icon = OTHER_ICONS[o.key]
          const glow = glowColor(product.bg, product.ink)
          return (
            <Reveal key={o.key} as="li" delay={Math.min(i * 0.05, 0.2)} className="h-full">
              <a
                href={product.landing}
                className="inv-other group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[rgba(255,255,255,0.12)] p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ background: SURFACE, '--glow': glow } as React.CSSProperties}
              >
                <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: glow }} />
                {/* мягкое свечение цветом продукта сверху -- только opacity */}
                <span
                  aria-hidden="true"
                  className="inv-other-glow pointer-events-none absolute inset-x-0 top-0 h-28"
                  style={{ background: `radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, ${glow} 26%, transparent), transparent 70%)` }}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <span className="inv-other-icon flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: product.bg, color: product.ink }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="inv-other-arrow" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <ArrowRightIcon className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="relative mt-4 text-[15px] font-semibold text-white">{o.name}</h3>
                <p className="relative mt-1.5 flex-1 text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>{o.pitch}</p>
                <span
                  className="relative mt-4 self-start rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.82)' }}
                >
                  {o.tag}
                </span>
              </a>
            </Reveal>
          )
        })}
      </ul>
    </section>
  )
}

/* «Экономия N ₸/год» под ценой: строка есть всегда (место под неё
   зарезервировано), на «Месяц» она просто прозрачная -- переключатель
   больше не сдвигает списки фич вниз-вверх. */
function SavingsLine({ show, label }: { show: boolean; label: string }) {
  return (
    <motion.div
      aria-hidden={!show}
      className="mt-1 text-[12px] font-medium"
      style={{ color: '#5EEAD4' }}
      initial={false}
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : -4 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {label}
    </motion.div>
  )
}

/* Цвет свечения карточки продукта: сам цвет продукта, а если он слишком
   тёмный для тёмной страницы (CFO -- #0E4D45) -- смесь с его светлым ink,
   иначе рамка и свечение при наведении почти не видны. */
function glowColor(bg: string, ink: string) {
  const hex = bg.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return lum < 0.12 ? `color-mix(in srgb, ${bg} 45%, ${ink})` : bg
}

/* A single check-list row shared by all three plan cards -- the inline
   SVG CheckIcon (same stroke-based style as every other icon in this
   file) wrapped in a colored span, matching how authMethods/extras above
   apply color to their icons rather than passing a style prop into the
   icon component itself. */
function FeatureRow({ label, emphasized }: { label: string; emphasized?: boolean }) {
  return (
    <li
      className="flex items-start gap-2.5 text-[13.5px] leading-relaxed"
      style={{ color: emphasized ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.82)' }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: '#5EEAD4' }}>
        <CheckIcon className="h-4 w-4" />
      </span>
      {label}
    </li>
  )
}

/* Section 3 of the pricing/annual-billing spec (docs/superpowers/specs/
   2026-08-30-pricing-section-annual-billing-design.md) -- the landing's
   own pricing table, placed between the «Другие продукты» block and the
   passwordless-auth section. Prices come from PLAN_PRICES (the same
   server-side source of truth /upgrade and the payment routes use) so a
   price change never needs to touch this file; feature lists come from
   miscDict so they never drift from /upgrade's lists. Everything else
   (title, toggle labels, plan names, suffixes, CTAs, footnote) is local
   COPY, since none of that text exists anywhere else to reuse.

   The three cards are deliberately not identical: Free is the plainest
   (transparent background, outlined CTA), Basic sits on the standard
   surface, and Pro gets a violet border + glow + "Maximum" chip, extra
   padding, and a solid violet CTA -- avoiding the generic identical-card-
   grid look the spec calls out. Pro also naturally reads taller since it
   lists more features (8 vs 6 vs 4), with no layout hacks needed for that. */
function PricingSection({ t, lang, goLogin }: { t: Copy; lang: Lang; goLogin: (plan?: 'basic' | 'pro', period?: BillingPeriod) => void }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  // бегущий блик рамки Про крутится, только пока карточка на экране
  const proRef = useRef<HTMLDivElement>(null)
  const proInView = useInView(proRef, { margin: '0px' })
  const misc = miscDict[lang]
  const suffix = period === 'monthly' ? t.pricing.suffixMonth : t.pricing.suffixYear
  // groupThousands, не toLocaleString: разделитель тысяч одинаковый на
  // сервере и в браузере (DigitRoll режет цену посимвольно)
  const formatPrice = (plan: 'basic' | 'pro') => `${groupThousands(PLAN_PRICES[plan][period])} ₸`
  const annualSavings = (plan: 'basic' | 'pro') =>
    groupThousands(PLAN_PRICES[plan].monthly * 12 - PLAN_PRICES[plan].annual)

  return (
    <section id="pricing" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Reveal className="text-center">
        <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold tracking-[-0.02em]">{t.pricing.title}</h2>
        <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
          {t.pricing.subtitle}
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-8 flex justify-center">
        <div className="inline-flex gap-2 rounded-2xl p-1.5" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}` }}>
          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            aria-pressed={period === 'monthly'}
            className="flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: period === 'monthly' ? COLOR.violet : 'transparent',
              color: period === 'monthly' ? '#fff' : 'rgba(255,255,255,0.68)',
            }}
          >
            {t.pricing.toggleMonth}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('annual')}
            aria-pressed={period === 'annual'}
            className="flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: period === 'annual' ? COLOR.violet : 'transparent',
              color: period === 'annual' ? '#fff' : 'rgba(255,255,255,0.68)',
            }}
          >
            {t.pricing.toggleYear}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: period === 'annual' ? 'rgba(255,255,255,0.2)' : 'rgba(94,234,212,0.16)',
                color: period === 'annual' ? '#fff' : '#5EEAD4',
              }}
            >
              {t.pricing.toggleYearBadge}
            </span>
          </button>
        </div>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        {/* Free -- plainest treatment on purpose */}
        <Reveal delay={0.1}>
          <div className="flex h-full flex-col rounded-3xl p-7" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }}>
            <div className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.82)' }}>
              {t.pricing.free.name}
            </div>
            <div className="mt-4 text-[2.25rem] font-bold tracking-tight">0 ₸</div>
            <ul className="mt-6 flex-1 space-y-3">
              {misc.freeFeatures.map((f) => (
                <FeatureRow key={f} label={f} />
              ))}
            </ul>
            <button
              onClick={() => goLogin()}
              className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] mt-8 flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[14px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.9)' }}
            >
              {t.pricing.free.cta}
            </button>
          </div>
        </Reveal>

        {/* Basic -- standard surface, mid-weight CTA */}
        <Reveal delay={0.16}>
          <div id="plan-basic" className="flex h-full flex-col rounded-3xl p-7" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
            <div className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.82)' }}>
              {t.pricing.basic.name}
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              {/* смена Месяц/Год -- цифры прокручиваются барабаном */}
              <DigitRoll value={formatPrice('basic')} className="text-[2.25rem] font-bold tracking-tight" />
              <span className="text-[14px] font-normal" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {suffix}
              </span>
            </div>
            <SavingsLine show={period === 'annual'} label={t.pricing.annualSavingsLabel(annualSavings('basic'))} />
            <ul className="mt-6 flex-1 space-y-3">
              {misc.basicFeatures.map((f) => (
                <FeatureRow key={f} label={f} />
              ))}
            </ul>
            <button
              onClick={() => goLogin('basic', period)}
              className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] mt-8 flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: COLOR.violet }}
            >
              {t.pricing.basic.cta}
            </button>
          </div>
        </Reveal>

        {/* Pro -- visually emphasized: violet border/glow, "Maximum" chip,
            extra padding, solid CTA with shadow. Naturally the tallest card
            since it has the most features -- no negative-margin layout
            trick needed to make it "pop". */}
        <Reveal delay={0.22}>
          {/* Рамка Про -- медленный бегущий блик: под непрозрачной подложкой
              (inset 1.5px) вращается conic-gradient, виден только край.
              Вне экрана -- пауза, при reduced motion -- статичная рамка. */}
          <div
            id="plan-pro"
            ref={proRef}
            data-paused={proInView ? undefined : 'true'}
            className="relative h-full rounded-3xl"
            style={{ boxShadow: `0 28px 70px -28px ${COLOR.violet}` }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
              <div className="inv-shimmer-spin" />
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-[1.5px] rounded-[calc(1.5rem-1.5px)]" style={{ background: PRO_PANEL }} />
            <span
              className="absolute -top-3 left-1/2 z-[2] -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-bold text-white"
              style={{ background: COLOR.violet }}
            >
              {t.pricing.pro.badge}
            </span>
            <div className="relative z-[1] flex h-full flex-col p-8">
            <div className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.82)' }}>
              {t.pricing.pro.name}
            </div>
            <div className="mt-4 flex items-baseline gap-1.5">
              <DigitRoll value={formatPrice('pro')} className="text-[2.5rem] font-bold tracking-tight" style={{ color: '#5EEAD4' }} />
              <span className="text-[14px] font-normal" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {suffix}
              </span>
            </div>
            <SavingsLine show={period === 'annual'} label={t.pricing.annualSavingsLabel(annualSavings('pro'))} />
            <ul className="mt-6 flex-1 space-y-3">
              {misc.proFeatures.map((f) => (
                <FeatureRow key={f} label={f} emphasized />
              ))}
            </ul>
            <button
              onClick={() => goLogin('pro', period)}
              className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.97] mt-8 flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[14px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ background: COLOR.violet, boxShadow: `0 14px 34px -12px ${COLOR.violet}` }}
            >
              {t.pricing.pro.cta}
            </button>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.3} className="mt-8">
        <p className="mx-auto max-w-2xl text-center text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {t.pricing.footnote}
        </p>
      </Reveal>
    </section>
  )
}
