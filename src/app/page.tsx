'use client'

import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { useLanguage, type Lang } from '@/components/LanguageProvider'

const EASE = [0.16, 1, 0.3, 1] as const

const COLOR = {
  violet: '#7A6CF0',
  teal: '#0E99AA',
  magenta: '#CE4C86',
  ground: '#0a0d1f',
}

// Shared with the standalone HeroMockupCard below (it has no access to
// Home()'s local `surface`/`border` consts since it doubles as the
// Spline 3D block's lazy-load/error fallback, defined at module scope).
const SURFACE = 'rgba(20,23,46,0.86)'
const BORDER = 'rgba(255,255,255,0.12)'

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/* ---------------------------------------------------------------- icons */

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M12.5 2 4 13.5h6.2L11 22l8.5-11.5H13.3L12.5 2Z" />
    </svg>
  )
}

function PaymentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
      <path d="M2.5 10.5h19" />
      <path d="M6.5 15h4" />
      <path d="M15.5 3.5 18 6l-2.5 2.5" transform="translate(1 -1)" />
    </svg>
  )
}

function ApiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <polyline points="8.5 8 3.5 12 8.5 16" />
      <polyline points="15.5 8 20.5 12 15.5 16" />
      <line x1="13.2" y1="5.5" x2="10.8" y2="18.5" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M4 20l.9-4L15.3 5.6a2.1 2.1 0 0 1 3 0l.1.1a2.1 2.1 0 0 1 0 3L8 19.1 4 20Z" />
      <path d="M13.2 7.7l3 3" />
    </svg>
  )
}

function ContractIcon({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" {...ICON_PROPS}>
      <path d="M8 3h6l4 4v12.5A1.5 1.5 0 0 1 16.5 21h-8A1.5 1.5 0 0 1 7 19.5V4.5A1.5 1.5 0 0 1 8.5 3Z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 13.7l1.9 1.9L15.5 11" />
    </svg>
  )
}

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

/* -------------------------------------------------------------- content */

type FeatureKey = 'invoice' | 'kaspi' | 'api' | 'esign' | 'contract'
type SoonKey = 'store' | 'bot'
type AuthKey = 'google' | 'facebook' | 'faceid' | 'mail'
type ExtraKey = 'globe' | 'wallet' | 'gift'

const FEATURE_ICONS: Record<FeatureKey, ComponentType<{ className?: string }>> = {
  invoice: BoltIcon,
  kaspi: PaymentIcon,
  api: ApiIcon,
  esign: PenIcon,
  contract: ContractIcon,
}
const SOON_ICONS: Record<SoonKey, ComponentType<{ className?: string }>> = {
  store: StoreIcon,
  bot: BotIcon,
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
  heroBadge: string
  heroTitleLine1: string
  heroTitleLine2: string
  heroSubtitle: string
  heroPrimaryCta: string
  heroSecondaryCta: string
  heroNote: string
  heroChip1: string
  heroChip2: string
  stats: { value: number; suffix: string; label: string }[]
  mock: { url: string; number: string; client: string; service: string; vat: string; total: string; paid: string }
  stepsEyebrow: string
  stepsTitle: string
  steps: { title: string; desc: string }[]
  featuresEyebrow: string
  featuresTitle: string
  featuresSubtitle: string
  features: { icon: FeatureKey; title: string; desc: string; badge?: string }[]
  soonEyebrow: string
  soonTitle: string
  soon: { icon: SoonKey; title: string; desc: string; badge: string }[]
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
    heroBadge: 'Экосистема для бизнеса в Казахстане',
    heroTitleLine1: 'От счёта до оплаты',
    heroTitleLine2: 'и автоматизации',
    heroSubtitle: 'Счета с подписью и печатью, оплата через Kaspi, ЭЦП, договоры и Kaspi-бот для магазина — всё в одном месте.',
    heroPrimaryCta: 'Начать бесплатно',
    heroSecondaryCta: 'Как это работает',
    heroNote: '7 дней бесплатно на тарифе Базовый',
    heroChip1: 'Счёт оплачен · 12 000 ₸',
    heroChip2: '2% комиссия',
    stats: [
      { value: 1, suffix: ' минута', label: 'от создания до отправки счёта' },
      { value: 2, suffix: '%', label: 'комиссия — только с оплаченных через Kaspi счетов' },
      { value: 0, suffix: ' ₸', label: 'чтобы начать — бесплатно' },
    ],
    mock: { url: 'invoices.kz/i/2461', number: '№ 2461', client: 'ТОО «Ромашка»', service: 'Консалтинговые услуги', vat: 'НДС 12%', total: 'Итого', paid: 'Оплачено · Kaspi' },
    stepsEyebrow: 'Как это работает',
    stepsTitle: 'Три шага до оплаты',
    steps: [
      { title: 'Создайте счёт', desc: 'Заполните данные клиента, добавьте услуги — PDF с подписью и печатью готов за минуту.' },
      { title: 'Клиент оплачивает через Kaspi', desc: 'Отправьте ссылку — клиент платит по Kaspi QR прямо со страницы счёта, без регистрации.' },
      { title: 'Оплата подтверждается сама', desc: 'Платформа сама видит оплату и помечает счёт оплаченным — сверять вручную ничего не нужно.' },
    ],
    featuresEyebrow: 'Возможности',
    featuresTitle: 'Главное, что вы получаете',
    featuresSubtitle: 'Реальные инструменты, которыми уже пользуется бизнес в Казахстане.',
    features: [
      { icon: 'invoice', title: 'Счета за 1 минуту', desc: 'Конструктор счетов, PDF с подписью и печатью, НДС, шаблоны. Отправка на email или публичной ссылкой, статусы оплат и история.' },
      { icon: 'kaspi', title: 'Оплата через Kaspi', desc: 'Платёжная ссылка и QR Kaspi Pay прямо в счёте. Платформа сама подтверждает оплату. Комиссия 2% — только с реально оплаченных счетов. Есть импорт выписки из Excel с автосопоставлением.' },
      { icon: 'api', title: 'Kaspi API и вебхуки', desc: 'Принимайте оплаты Kaspi на своём сайте: создание платежа по API, вебхук об оплате, документация — в разделе «Kaspi API».' },
      { icon: 'esign', title: 'ЭЦП-подписание', desc: 'Подписывайте счета и договоры ЭЦП через QR или eGov mobile (SIGEX) — юридически значимо, без визита в офис.', badge: 'Pro' },
      { icon: 'contract', title: 'Договоры', desc: 'Создавайте договоры и подписывайте их онлайн обеими сторонами — без бумаги и личных встреч.' },
    ],
    soonEyebrow: 'В разработке',
    soonTitle: 'Скоро',
    soon: [
      { icon: 'store', title: 'Kaspi Bot', desc: 'Автоматическое управление ценами на Kaspi Магазине: демпинг-бот, заказы, финансы и прибыль магазина, аналитика ниш, цены по городам.', badge: 'Скоро для всех' },
      { icon: 'bot', title: 'AI-агент для Instagram', desc: 'Авто-ответы на комментарии и сообщения Direct от ИИ, обученного на вашем бизнесе.', badge: 'Скоро' },
    ],
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
      { icon: 'globe', label: '3 языка: русский, қазақша, English' },
      { icon: 'wallet', label: 'Единый кошелёк в ₸ для всех сервисов' },
      { icon: 'gift', label: 'Реферальная программа' },
    ],
    ctaTitle: 'Готовы избавиться от бумажной волокиты?',
    ctaSubtitle: 'Зарегистрируйтесь и получите 7 дней бесплатного доступа.',
    ctaButton: 'Начать бесплатно',
    ctaNote: 'Отмена в любое время',
    footerLinks: [
      { label: 'Политика', href: '/privacy' },
      { label: 'Условия', href: '/terms' },
      { label: 'Удаление данных', href: '/data-deletion' },
    ],
    footerContact: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана',
  },
  kk: {
    navCta: 'Кіру',
    heroBadge: 'Қазақстандағы бизнеске арналған экожүйе',
    heroTitleLine1: 'Шоттан төлемге',
    heroTitleLine2: 'және автоматтандыруға дейін',
    heroSubtitle: 'Қолтаңба мен мөрі бар шоттар, Kaspi арқылы төлем, ЭЦҚ, келісімшарттар және дүкенге арналған Kaspi-бот — бәрі бір жерде.',
    heroPrimaryCta: 'Тегін бастау',
    heroSecondaryCta: 'Бұл қалай жұмыс істейді',
    heroNote: 'Тіркелгенде 7 күн тегін (Негізгі тариф)',
    heroChip1: 'Шот төленді · 12 000 ₸',
    heroChip2: '2% комиссия',
    stats: [
      { value: 1, suffix: ' минут', label: 'шот жасаудан жіберуге дейін' },
      { value: 2, suffix: '%', label: 'тек Kaspi арқылы төленген шоттан алынатын комиссия' },
      { value: 0, suffix: ' ₸', label: 'бастау үшін — тегін' },
    ],
    mock: { url: 'invoices.kz/i/2461', number: '№ 2461', client: '«Ромашка» ЖШС', service: 'Кеңес беру қызметтері', vat: 'ҚҚС 12%', total: 'Барлығы', paid: 'Төленді · Kaspi' },
    stepsEyebrow: 'Қалай жұмыс істейді',
    stepsTitle: 'Төлемге дейін үш қадам',
    steps: [
      { title: 'Шот жасаңыз', desc: 'Клиент деректерін толтырып, қызметтерді қосыңыз — қолтаңба мен мөрі бар PDF бір минутта дайын.' },
      { title: 'Клиент Kaspi арқылы төлейді', desc: 'Сілтемені жіберіңіз — клиент тіркелусіз, тікелей шот бетінен Kaspi QR арқылы төлейді.' },
      { title: 'Төлем өздігінен расталады', desc: 'Платформа төлемді өзі көріп, шотты төленді деп белгілейді — қолмен тексерудің қажеті жоқ.' },
    ],
    featuresEyebrow: 'Мүмкіндіктер',
    featuresTitle: 'Сіз алатын негізгі нәрселер',
    featuresSubtitle: 'Қазақстандағы бизнес қазірдің өзінде пайдаланатын нақты құралдар.',
    features: [
      { icon: 'invoice', title: 'Бір минутта шот', desc: 'Шот конструкторы, қолтаңба мен мөрі бар PDF, ҚҚС, үлгілер. Email арқылы немесе жария сілтемемен жіберу, төлем мәртебелері мен тарихы.' },
      { icon: 'kaspi', title: 'Kaspi арқылы төлем', desc: 'Шоттың өзінде Kaspi Pay сілтемесі мен QR коды. Платформа төлемді өзі растайды. Комиссия 2% — тек нақты төленген шоттан. Excel үзінді-көшірмесін автоматты салыстырумен жүктеуге болады.' },
      { icon: 'api', title: 'Kaspi API және вебхук', desc: 'Kaspi төлемдерін өз сайтыңызда қабылдаңыз: API арқылы төлем жасау, төлем вебхугі, құжаттама — «Kaspi API» бөлімінде.' },
      { icon: 'esign', title: 'ЭЦҚ қолтаңба', desc: 'Шоттар мен келісімшарттарға QR немесе eGov mobile (SIGEX) арқылы ЭЦҚ қойыңыз — заңды күші бар, кеңсеге барудың қажеті жоқ.', badge: 'Pro' },
      { icon: 'contract', title: 'Келісімшарттар', desc: 'Келісімшарт жасаңыз және екі тарап та онлайн қол қойсын — қағазсыз, кездесусіз.' },
    ],
    soonEyebrow: 'Әзірленуде',
    soonTitle: 'Жақында',
    soon: [
      { icon: 'store', title: 'Kaspi Bot', desc: 'Kaspi Дүкеніндегі бағаларды автоматты басқару: демпинг-бот, тапсырыстар, дүкен қаржысы мен пайдасы, ниша аналитикасы, қала бойынша бағалар.', badge: 'Жақында бәріне' },
      { icon: 'bot', title: 'Instagram үшін AI-агент', desc: 'Бизнесіңізге оқытылған ЖИ-ден пікірлер мен Direct хабарламаларына автоматты жауап.', badge: 'Жақында' },
    ],
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
      { icon: 'globe', label: '3 тіл: орыс, қазақ, ағылшын' },
      { icon: 'wallet', label: 'Барлық қызметтерге ортақ ₸ әмиян' },
      { icon: 'gift', label: 'Реферал бағдарламасы' },
    ],
    ctaTitle: 'Қағаз әуреден құтылуға дайынсыз ба?',
    ctaSubtitle: 'Тіркеліп, 7 күн тегін қолжетімділік алыңыз.',
    ctaButton: 'Тегін бастау',
    ctaNote: 'Кез келген уақытта бас тартуға болады',
    footerLinks: [
      { label: 'Құпиялылық', href: '/privacy' },
      { label: 'Шарттар', href: '/terms' },
      { label: 'Деректерді жою', href: '/data-deletion' },
    ],
    footerContact: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · «First Project» ЖК · БСН 890525350143 · Астана қ.',
  },
  en: {
    navCta: 'Log in',
    heroBadge: 'An ecosystem for business in Kazakhstan',
    heroTitleLine1: 'From invoice to payment',
    heroTitleLine2: 'to automation',
    heroSubtitle: 'Signed and stamped invoices, Kaspi payments, digital signatures, contracts, and a Kaspi price bot for your store — all in one place.',
    heroPrimaryCta: 'Start for free',
    heroSecondaryCta: 'How it works',
    heroNote: '7 days free on the Basic plan',
    heroChip1: 'Invoice paid · ₸12,000',
    heroChip2: '2% fee',
    stats: [
      { value: 1, suffix: ' minute', label: 'from creating to sending an invoice' },
      { value: 2, suffix: '%', label: 'fee — only on invoices actually paid via Kaspi' },
      { value: 0, suffix: ' ₸', label: 'to get started — free' },
    ],
    mock: { url: 'invoices.kz/i/2461', number: 'No. 2461', client: 'Romashka LLP', service: 'Consulting services', vat: 'VAT 12%', total: 'Total', paid: 'Paid · Kaspi' },
    stepsEyebrow: 'How it works',
    stepsTitle: 'Three steps to get paid',
    steps: [
      { title: 'Create an invoice', desc: "Fill in the client's details, add services — a signed and stamped PDF is ready in a minute." },
      { title: 'Client pays via Kaspi', desc: 'Send the link — the client pays with a Kaspi QR code right from the invoice page, no signup required.' },
      { title: 'Payment confirms itself', desc: 'The platform detects the payment and marks the invoice paid automatically — nothing to reconcile by hand.' },
    ],
    featuresEyebrow: 'Features',
    featuresTitle: 'What you actually get',
    featuresSubtitle: 'Real tools that businesses in Kazakhstan already use.',
    features: [
      { icon: 'invoice', title: 'Invoices in 1 minute', desc: 'An invoice builder, PDF with your signature and stamp, VAT, templates. Send by email or a public link, track payment status and history.' },
      { icon: 'kaspi', title: 'Payment via Kaspi', desc: 'A Kaspi Pay link and QR code right inside the invoice. The platform confirms payment on its own. A 2% fee applies only to invoices actually paid via Kaspi. You can also import an Excel bank statement with automatic matching.' },
      { icon: 'api', title: 'Kaspi API & webhooks', desc: "Accept Kaspi payments on your own site: create a payment via the API, get a payment webhook, and read the docs — all in the platform's “Kaspi API” section." },
      { icon: 'esign', title: 'Digital signature', desc: 'Sign invoices and contracts with a digital signature via QR or eGov mobile (SIGEX) — legally binding, no office visit needed.', badge: 'Pro' },
      { icon: 'contract', title: 'Contracts', desc: 'Create contracts and have both parties sign them online — no paper, no meetings.' },
    ],
    soonEyebrow: 'In progress',
    soonTitle: 'Coming soon',
    soon: [
      { icon: 'store', title: 'Kaspi Bot', desc: 'Automatic price management on Kaspi Shop: a price-matching bot, orders, store finances and profit, niche analytics, and per-city pricing.', badge: 'Coming soon for everyone' },
      { icon: 'bot', title: 'AI agent for Instagram', desc: 'Automatic replies to comments and Direct messages from an AI trained on your business.', badge: 'Coming soon' },
    ],
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
    ctaSubtitle: 'Sign up and get 7 days of free access.',
    ctaButton: 'Start for free',
    ctaNote: 'Cancel anytime',
    footerLinks: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Data Deletion', href: '/data-deletion' },
    ],
    footerContact: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
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

function CountUp({ value, suffix, reduce }: { value: number; suffix: string; reduce: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(reduce ? value : 0)

  useEffect(() => {
    if (!inView) return
    if (reduce) {
      setDisplay(value)
      return
    }
    let raf = 0
    const duration = 900
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(eased * value))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, reduce, value])

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
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
  const t = COPY[lang].mock
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
      className="relative mx-auto w-full max-w-md"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-16 rounded-full"
        style={{ background: `radial-gradient(closest-side, ${COLOR.violet}33, transparent 72%)`, filter: 'blur(30px)' }}
      />
      <motion.div
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative overflow-hidden rounded-3xl text-left"
        style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }}
      >
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.magenta, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.violet, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.teal, opacity: 0.7 }} />
          <span className="ml-2 truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {t.url}
          </span>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>{t.number}</div>
              <div className="mt-0.5 text-[16px] font-semibold">{t.client}</div>
            </div>
            <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold text-white" style={{ background: COLOR.teal }}>
              {t.paid}
            </span>
          </div>
          <div className="mt-4 space-y-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
            <div className="flex justify-between">
              <span>{t.service}</span>
              <span>150 000 ₸</span>
            </div>
            <div className="flex justify-between">
              <span>{t.vat}</span>
              <span>18 000 ₸</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: BORDER }}>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.total}</span>
            <span className="text-[20px] font-bold" style={{ color: COLOR.teal }}>168 000 ₸</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
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

export default function Home() {
  const router = useRouter()
  const { lang, setLang } = useLanguage()
  const t = COPY[lang]
  const reduce = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const isDesktop = useIsDesktop()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goLogin = () => router.push('/login')
  const scrollToSteps = () => document.getElementById('how')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' })

  const surface = SURFACE
  const border = BORDER

  return (
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
              onClick={goLogin}
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
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        <AmbientBlobs reduce={!!reduce} />

        <div className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col items-center text-center lg:flex-row lg:items-center lg:gap-14 lg:text-left">
            <div className="flex w-full flex-col items-center lg:w-1/2 lg:items-start">
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduce ? 0 : 0.5, ease: EASE }}
                className="mb-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold"
                style={{ background: surface, border: `1px solid ${border}`, color: 'rgba(255,255,255,0.85)' }}
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COLOR.teal }} />
                {t.heroBadge}
              </motion.div>

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
                  onClick={goLogin}
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
                  <Spline3D scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode" className="h-full w-full" />
                </SplineErrorBoundary>

                {/* real-data chips, tying the demo scene back to the product */}
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: -10 }}
                  animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -8, 0] }}
                  transition={reduce ? { duration: 0 } : { opacity: { duration: 0.5, delay: 0.6 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.6 } }}
                  className="pointer-events-none absolute left-2 top-8 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
                  style={{ background: surface, border: `1px solid ${border}`, color: 'rgba(255,255,255,0.9)' }}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR.teal }} />
                  {t.heroChip1}
                </motion.div>
                <motion.div
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={reduce ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, 8, 0] }}
                  transition={reduce ? { duration: 0 } : { opacity: { duration: 0.5, delay: 0.8 }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.8 } }}
                  className="pointer-events-none absolute bottom-10 right-2 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
                  style={{ background: surface, border: `1px solid ${border}`, color: 'rgba(255,255,255,0.9)' }}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR.violet }} />
                  {t.heroChip2}
                </motion.div>
              </div>
            )}
          </div>

          {/* mockup — mobile/tablet hero visual; on lg+ the 3D scene above
              takes over (this card only reappears there as its load/error
              fallback) */}
          <div className="mt-16 lg:hidden">
            <HeroMockupCard />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- stats */}
      <Reveal className="relative z-10" as="div">
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8" style={{ borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {t.stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-[clamp(2rem,4vw,2.75rem)] font-bold tracking-[-0.02em]" style={{ color: COLOR.violet }}>
                  <CountUp value={s.value} suffix={s.suffix} reduce={!!reduce} />
                </div>
                <div className="mt-2 text-[13px]" style={{ color: 'rgba(255,255,255,0.82)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ----------------------------------------------------------- how */}
      <section id="how" className="relative z-10 mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="text-center">
          <Eyebrow color={COLOR.teal}>{t.stepsEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.75rem)] font-semibold tracking-[-0.02em]">{t.stepsTitle}</h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-4">
          {t.steps.map((s, i) => (
            <Reveal key={s.title} delay={Math.min(i * 0.05, 0.2)}>
              <div
                className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:translate-x-1.5 flex items-start gap-5 rounded-2xl p-6"
                style={{ background: surface, border: `1px solid ${border}` }}
              >
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
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ features */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="max-w-xl">
          <Eyebrow color={COLOR.violet}>{t.featuresEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.featuresTitle}</h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.featuresSubtitle}</p>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map((f, i) => {
            const FIcon = FEATURE_ICONS[f.icon]
            return (
              <Reveal key={f.title} delay={Math.min(i * 0.045, 0.27)}>
                <div
                  className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 relative h-full rounded-2xl p-6"
                  style={{ background: surface, border: `1px solid ${border}` }}
                >
                  {f.badge && (
                    <span
                      className="absolute right-5 top-5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                      style={{ background: COLOR.magenta }}
                    >
                      {f.badge}
                    </span>
                  )}
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(122,108,240,0.16)', color: COLOR.violet }}
                  >
                    <FIcon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{f.desc}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- soon */}
      <section className="relative z-10 mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <Reveal>
          <Eyebrow color={COLOR.magenta}>{t.soonEyebrow}</Eyebrow>
          <h2 className="mt-4 text-[clamp(1.7rem,3.4vw,2.25rem)] font-semibold tracking-[-0.02em]">{t.soonTitle}</h2>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t.soon.map((s, i) => {
            const SIcon = SOON_ICONS[s.icon]
            return (
              <Reveal key={s.title} delay={i * 0.05}>
                <div
                  className="motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:-translate-y-1 flex h-full flex-col rounded-2xl p-6"
                  style={{ background: 'rgba(20,23,46,0.55)', border: `1px dashed ${border}` }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.8)' }}
                    >
                      <SIcon className="h-5 w-5" />
                    </div>
                    <span className="rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: COLOR.violet }}>
                      {s.badge}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{s.desc}</p>
                </div>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* ---------------------------------------------------------- auth */}
      <section className="relative z-10 mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
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
      <section className="relative z-10 mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-24">
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
              onClick={goLogin}
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

function AmbientBlobs({ reduce }: { reduce: boolean }) {
  const drift = (dx: number, dy: number, scale: number, duration: number) =>
    reduce
      ? undefined
      : { x: [0, dx, dx * 0.4, 0], y: [0, dy, dy * 0.5, 0], scale: [1, scale, 1.02, 1], transition: { duration, repeat: Infinity, ease: 'easeInOut' as const } }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-32 -top-24 h-[520px] w-[520px] rounded-full"
        style={{ background: COLOR.violet, opacity: 0.32, filter: 'blur(110px)' }}
        animate={drift(60, 40, 1.08, 22)}
      />
      <motion.div
        className="absolute -right-24 top-10 h-[460px] w-[460px] rounded-full"
        style={{ background: COLOR.teal, opacity: 0.28, filter: 'blur(110px)' }}
        animate={drift(-50, 55, 1.06, 27)}
      />
      <motion.div
        className="absolute bottom-[-140px] left-1/3 h-[300px] w-[300px] rounded-full"
        style={{ background: COLOR.magenta, opacity: 0.16, filter: 'blur(100px)' }}
        animate={drift(40, -35, 1.1, 24)}
      />
    </div>
  )
}
