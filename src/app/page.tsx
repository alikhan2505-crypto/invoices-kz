'use client'

import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { BentoCard, BentoGrid, type BentoItem } from '@/components/ui/bento-grid'

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

/* Re-added from commit 1da2e2c (`git show 1da2e2c` -- removed there when the
   old "coming soon" placeholder cards were replaced by the live BotShowcase
   demo below). Restored verbatim for the bento grid's Kaspi Bot / AI-agent
   cards (see src/components/ui/bento-grid.tsx + BENTO_ICONS). */
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

type BentoKey = 'invoice' | 'kaspi' | 'kaspibot' | 'aiagent' | 'esign' | 'api'
type BotTabKey = 'kaspibot' | 'aiagent'
type AuthKey = 'google' | 'facebook' | 'faceid' | 'mail'
type ExtraKey = 'globe' | 'wallet' | 'gift'

const BENTO_ICONS: Record<BentoKey, ComponentType<{ className?: string }>> = {
  invoice: BoltIcon,
  kaspi: PaymentIcon,
  kaspibot: StoreIcon,
  aiagent: BotIcon,
  esign: PenIcon,
  api: ApiIcon,
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
  heroChip1: string
  heroChip2: string
  stats: { value: number; suffix: string; label: string }[]
  mock: { url: string; number: string; client: string; service: string; vat: string; total: string; paid: string }
  stepsEyebrow: string
  stepsTitle: string
  steps: { title: string; desc: string }[]
  bentoTitle: string
  bentoSubtitle: string
  bento: { icon: BentoKey; title: string; desc: string; chip: string; colSpan?: 2; hasPersistentHover?: boolean; href?: string }[]
  botTitle: string
  botSubtitle: string
  botTabs: { key: BotTabKey; label: string }[]
  botKaspi: { stat: string; statCaption: string; yourPriceLabel: string; yourPrice: string; competitorLabel: string; competitorPrice: string; statusText: string }
  botAgent: {
    stat: string
    statCaption: string
    messages: { from: 'customer' | 'agent'; text: string }[]
    typingLabel: string
    leadTitle: string
    leadStatus: string
    leadRequestLabel: string
    leadRequest: string
    leadNameLabel: string
    leadName: string
    leadPhoneLabel: string
    leadPhone: string
    leadCaption: string
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
    heroTitleLine1: 'Не только счета.',
    heroTitleLine2: 'Вся автоматизация бизнеса',
    heroSubtitle: 'Счета с оплатой Kaspi, демпинг-бот для Kaspi Магазина, AI-агент для клиентов и ЭЦП для любых документов — одна платформа, один кошелёк.',
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
    bentoTitle: 'Вся платформа',
    bentoSubtitle: 'Каждый модуль работает сам по себе — и ещё лучше вместе, на одном кошельке.',
    bento: [
      { icon: 'invoice', title: 'Счета и документы', desc: 'Счета, АВР, КП и накладные за минуту — PDF с подписью и печатью, НДС, отправка ссылкой или на email.', chip: '1 минута', colSpan: 2, hasPersistentHover: true },
      { icon: 'kaspi', title: 'Оплата через Kaspi', desc: 'Ссылка и QR Kaspi Pay прямо в счёте, платформа сама подтверждает оплату.', chip: '2% только с оплаченных' },
      { icon: 'kaspibot', title: 'Kaspi Bot', desc: 'Демпинг-бот держит цены в топе, плюс заказы, накладные, финансы, аналитика ниш и качество магазина — весь кабинет Kaspi в одном месте.', chip: 'проверка каждые 15 мин', colSpan: 2 },
      { icon: 'aiagent', title: 'AI-агент', desc: 'Отвечает клиентам в Instagram, Telegram и на сайте, собирает заявки в базу.', chip: '5₸ за ответ' },
      { icon: 'esign', title: 'ЭЦП и договоры', desc: 'Подписывайте любые документы ЭЦП — счета, договоры, АВР, КП и накладные — через QR или eGov mobile (SIGEX). Юридически значимо, без визита в офис. Обе стороны подписывают онлайн.', chip: 'SIGEX / eGov' },
      { icon: 'api', title: 'Cashier API', desc: 'Принимайте Kaspi Pay на своём сайте по API — для разработчиков.', chip: '2%, без абонплаты', href: '/cashier-api' },
    ],
    botTitle: 'Ещё два сотрудника, которым не нужна зарплата',
    botSubtitle: 'Kaspi Bot держит цены под контролем, AI-агент отвечает клиентам — 24/7, без вашего участия.',
    botTabs: [
      { key: 'kaspibot', label: 'Kaspi Bot' },
      { key: 'aiagent', label: 'AI-агент' },
    ],
    botKaspi: {
      stat: '15 мин',
      statCaption: 'между проверками цен конкурентов — Kaspi Bot держит вас на первой позиции без ручной работы',
      yourPriceLabel: 'Ваша цена',
      yourPrice: '14 900 ₸ ↓',
      competitorLabel: 'Конкурент',
      competitorPrice: '15 000 ₸',
      statusText: 'Проверка каждые 15 минут, без вашего участия',
    },
    botAgent: {
      stat: '5₸',
      statCaption: 'за автоответ клиенту в Instagram, Telegram и на сайте',
      messages: [
        { from: 'customer', text: 'Здравствуйте, сколько стоит доставка до Астаны?' },
        { from: 'agent', text: 'Добрый день! Доставка по Астане — бесплатно от 10 000 ₸, иначе 1 500 ₸. Хотите оформить заказ?' },
        { from: 'customer', text: 'Да, давайте. Я Айгерим, 8 701 *** 45 67' },
        { from: 'agent', text: 'Записал! Менеджер свяжется с вами в течение 10 минут 🙂' },
      ],
      typingLabel: 'печатает',
      leadTitle: 'Новая заявка',
      leadStatus: 'В работе',
      leadRequestLabel: 'Запрос',
      leadRequest: 'доставка, оформление заказа',
      leadNameLabel: 'Имя',
      leadName: 'Айгерим',
      leadPhoneLabel: 'Телефон',
      leadPhone: '8 701 *** 45 67',
      leadCaption: 'Каждый диалог сам превращается в заявку в вашей базе',
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
    ctaSubtitle: 'Зарегистрируйтесь и получите 7 дней бесплатного доступа.',
    ctaButton: 'Начать бесплатно',
    ctaNote: 'Отмена в любое время',
    footerLinks: [
      { label: 'Политика', href: '/privacy' },
      { label: 'Условия', href: '/terms' },
      { label: 'Удаление данных', href: '/data-deletion' },
      { label: 'Для разработчиков → Cashier API', href: '/cashier-api' },
    ],
    footerContact: [
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана',
  },
  kk: {
    navCta: 'Кіру',
    heroTitleLine1: 'Тек шоттар емес.',
    heroTitleLine2: 'Бизнесті толық автоматтандыру',
    heroSubtitle: 'Kaspi арқылы төленетін шоттар, Kaspi Магазинге арналған демпинг-бот, клиенттерге жауап беретін AI-агент және кез келген құжатқа ЭЦҚ — бір платформа, бір әмиян.',
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
    bentoTitle: 'Толық платформа',
    bentoSubtitle: 'Әр модуль өз алдына жұмыс істейді — ал бірге, бір әмиянмен, одан да жақсы.',
    bento: [
      { icon: 'invoice', title: 'Шоттар мен құжаттар', desc: 'Шот, ОҚА, КҰ және жүкқұжат бір минутта — қолтаңба мен мөрі бар PDF, ҚҚС, сілтемемен немесе email арқылы жіберу.', chip: '1 минут', colSpan: 2, hasPersistentHover: true },
      { icon: 'kaspi', title: 'Kaspi арқылы төлем', desc: 'Шоттың өзінде Kaspi Pay сілтемесі мен QR коды, платформа төлемді өзі растайды.', chip: 'тек төленгеннен 2%' },
      { icon: 'kaspibot', title: 'Kaspi Bot', desc: 'Демпинг-бот бағаны топта ұстайды, әрі тапсырыстар, жүкқұжаттар, қаржы, ниша аналитикасы және дүкен сапасы — Kaspi кабинетінің бәрі бір жерде.', chip: 'әр 15 минут сайын тексеру', colSpan: 2 },
      { icon: 'aiagent', title: 'AI-агент', desc: 'Instagram, Telegram және сайтта клиенттерге жауап береді, өтінімдерді дерекқорға жинайды.', chip: 'жауап үшін 5₸' },
      { icon: 'esign', title: 'ЭЦҚ және келісімшарттар', desc: 'Кез келген құжатқа ЭЦҚ қойыңыз — шоттар, келісімшарттар, ОҚА, КҰ және жүкқұжаттар — QR немесе eGov mobile (SIGEX) арқылы. Заңды күші бар, кеңсеге барудың қажеті жоқ. Екі тарап та онлайн қол қояды.', chip: 'SIGEX / eGov' },
      { icon: 'api', title: 'Cashier API', desc: 'Kaspi Pay төлемдерін өз сайтыңызда API арқылы қабылдаңыз — әзірлеушілерге арналған.', chip: '2%, абонплатасыз', href: '/cashier-api' },
    ],
    botTitle: 'Жалақы сұрамайтын тағы екі қызметкер',
    botSubtitle: 'Kaspi Bot бағаны бақылауда ұстайды, AI-агент клиенттерге жауап береді — 24/7, сіздің қатысуыңызсыз.',
    botTabs: [
      { key: 'kaspibot', label: 'Kaspi Bot' },
      { key: 'aiagent', label: 'AI-агент' },
    ],
    botKaspi: {
      stat: '15 мин',
      statCaption: 'бәсекелестердің бағасын тексеру аралығы — Kaspi Bot сізді қолмен әрекетсіз бірінші орында ұстайды',
      yourPriceLabel: 'Сіздің бағаңыз',
      yourPrice: '14 900 ₸ ↓',
      competitorLabel: 'Бәсекелес',
      competitorPrice: '15 000 ₸',
      statusText: 'Әр 15 минут сайын тексеріледі, сіздің қатысуыңызсыз',
    },
    botAgent: {
      stat: '5₸',
      statCaption: 'Instagram, Telegram және сайттағы бір автожауап үшін',
      messages: [
        { from: 'customer', text: 'Сәлеметсіз бе, Астанаға дейінгі жеткізу қанша тұрады?' },
        { from: 'agent', text: 'Қайырлы күн! Астана бойынша жеткізу 10 000 ₸-ден бастап тегін, болмаса 1 500 ₸. Тапсырыс рәсімдегіңіз келе ме?' },
        { from: 'customer', text: 'Иә, келісемін. Мен Айгеріммін, 8 701 *** 45 67' },
        { from: 'agent', text: 'Жаздым! Менеджер 10 минут ішінде сізге хабарласады 🙂' },
      ],
      typingLabel: 'жазып жатыр',
      leadTitle: 'Жаңа өтінім',
      leadStatus: 'Жұмыста',
      leadRequestLabel: 'Сұраныс',
      leadRequest: 'жеткізу, тапсырысты рәсімдеу',
      leadNameLabel: 'Аты',
      leadName: 'Айгерім',
      leadPhoneLabel: 'Телефон',
      leadPhone: '8 701 *** 45 67',
      leadCaption: 'Әр диалог дерекқорыңызда өтінімге өздігінен айналады',
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
    ctaSubtitle: 'Тіркеліп, 7 күн тегін қолжетімділік алыңыз.',
    ctaButton: 'Тегін бастау',
    ctaNote: 'Кез келген уақытта бас тартуға болады',
    footerLinks: [
      { label: 'Құпиялылық', href: '/privacy' },
      { label: 'Шарттар', href: '/terms' },
      { label: 'Деректерді жою', href: '/data-deletion' },
      { label: 'Әзірлеушілерге → Cashier API', href: '/cashier-api' },
    ],
    footerContact: [
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · «First Project» ЖК · БСН 890525350143 · Астана қ.',
  },
  en: {
    navCta: 'Log in',
    heroTitleLine1: 'More than invoicing.',
    heroTitleLine2: 'Your whole business, automated',
    heroSubtitle: 'Invoices with Kaspi payments, a repricing bot for Kaspi Shop, an AI agent for your customers, and digital signatures for any document — one platform, one wallet.',
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
    bentoTitle: 'The whole platform',
    bentoSubtitle: 'Every module works on its own — and even better together, on one wallet.',
    bento: [
      { icon: 'invoice', title: 'Invoices & documents', desc: 'Invoices, acts, quotes, and delivery notes in a minute — a signed and stamped PDF, VAT, sent by link or email.', chip: '1 minute', colSpan: 2, hasPersistentHover: true },
      { icon: 'kaspi', title: 'Payment via Kaspi', desc: 'A Kaspi Pay link and QR code right in the invoice — the platform confirms payment on its own.', chip: '2% on paid invoices only' },
      { icon: 'kaspibot', title: 'Kaspi Bot', desc: 'A repricing bot keeps your prices on top, plus orders, waybills, finances, niche analytics, and shop quality — your whole Kaspi cabinet in one place.', chip: 'checks every 15 min', colSpan: 2 },
      { icon: 'aiagent', title: 'AI Agent', desc: 'Replies to customers on Instagram, Telegram, and your website, and collects leads into your database.', chip: '₸5 per reply' },
      { icon: 'esign', title: 'Digital signatures & contracts', desc: 'Sign any document with a digital signature — invoices, contracts, acts, quotes, and delivery notes — via QR or eGov mobile (SIGEX). Legally binding, no office visit needed. Both sides sign online.', chip: 'SIGEX / eGov' },
      { icon: 'api', title: 'Cashier API', desc: 'Accept Kaspi Pay payments on your own website via API — built for developers.', chip: '2%, no subscription fee', href: '/cashier-api' },
    ],
    botTitle: 'Two more employees who never ask for a salary',
    botSubtitle: 'Kaspi Bot keeps your prices in check, the AI agent replies to customers — 24/7, with no effort from you.',
    botTabs: [
      { key: 'kaspibot', label: 'Kaspi Bot' },
      { key: 'aiagent', label: 'AI Agent' },
    ],
    botKaspi: {
      stat: '15 min',
      statCaption: 'between competitor price checks — Kaspi Bot keeps you in first place with zero manual work',
      yourPriceLabel: 'Your price',
      yourPrice: '14 900 ₸ ↓',
      competitorLabel: 'Competitor',
      competitorPrice: '15 000 ₸',
      statusText: 'Checked every 15 minutes, with no effort from you',
    },
    botAgent: {
      stat: '5₸',
      statCaption: 'per automatic reply on Instagram, Telegram, and your website',
      messages: [
        { from: 'customer', text: 'Hi, how much does delivery to Astana cost?' },
        { from: 'agent', text: 'Hello! Delivery within Astana is free from ₸10,000, otherwise ₸1,500. Would you like to place an order?' },
        { from: 'customer', text: "Yes, let's do it. I'm Aigerim, 8 701 *** 45 67" },
        { from: 'agent', text: 'Got it! A manager will call you within 10 minutes 🙂' },
      ],
      typingLabel: 'typing',
      leadTitle: 'New lead',
      leadStatus: 'In progress',
      leadRequestLabel: 'Request',
      leadRequest: 'delivery, placing an order',
      leadNameLabel: 'Name',
      leadName: 'Aigerim',
      leadPhoneLabel: 'Phone',
      leadPhone: '8 701 *** 45 67',
      leadCaption: 'Every conversation turns itself into a lead in your database',
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
    ctaSubtitle: 'Sign up and get 7 days of free access.',
    ctaButton: 'Start for free',
    ctaNote: 'Cancel anytime',
    footerLinks: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Data Deletion', href: '/data-deletion' },
      { label: 'For Developers → Cashier API', href: '/cashier-api' },
    ],
    footerContact: [
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
function HeroMockupCard({ compact = false }: { compact?: boolean } = {}) {
  const { lang } = useLanguage()
  const t = COPY[lang].mock
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
      className={compact ? 'relative mx-auto w-full max-w-[260px]' : 'relative mx-auto w-full max-w-md'}
    >
      <div
        aria-hidden="true"
        className={compact ? 'pointer-events-none absolute -inset-8 rounded-full' : 'pointer-events-none absolute -inset-16 rounded-full'}
        style={{ background: `radial-gradient(closest-side, ${COLOR.violet}33, transparent 72%)`, filter: compact ? 'blur(18px)' : 'blur(30px)' }}
      />
      <motion.div
        animate={reduce ? undefined : { y: [0, -10, 0] }}
        transition={reduce ? undefined : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative overflow-hidden rounded-3xl text-left"
        style={{ background: SURFACE, border: `1px solid ${BORDER}`, boxShadow: '0 40px 80px rgba(0,0,0,0.55)' }}
      >
        <div className={compact ? 'flex items-center gap-1.5 px-4 py-2.5' : 'flex items-center gap-2 px-5 py-3'} style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.magenta, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.violet, opacity: 0.7 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR.teal, opacity: 0.7 }} />
          <span className="ml-2 truncate text-[11px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
            {t.url}
          </span>
        </div>
        <div className={compact ? 'p-4' : 'p-5'}>
          <div className="flex items-start justify-between">
            <div>
              <div className={compact ? 'text-[10px]' : 'text-[11px]'} style={{ color: 'rgba(255,255,255,0.68)' }}>{t.number}</div>
              <div className={compact ? 'mt-0.5 text-[14px] font-semibold' : 'mt-0.5 text-[16px] font-semibold'}>{t.client}</div>
            </div>
            <span className={compact ? 'rounded-lg px-2 py-0.5 text-[9px] font-bold text-white' : 'rounded-lg px-2.5 py-1 text-[10px] font-bold text-white'} style={{ background: COLOR.teal }}>
              {t.paid}
            </span>
          </div>
          <div className={compact ? 'mt-3 space-y-1.5 text-[11px]' : 'mt-4 space-y-2 text-[12px]'} style={{ color: 'rgba(255,255,255,0.82)' }}>
            <div className="flex justify-between">
              <span>{t.service}</span>
              <span>150 000 ₸</span>
            </div>
            <div className="flex justify-between">
              <span>{t.vat}</span>
              <span>18 000 ₸</span>
            </div>
          </div>
          <div className={compact ? 'mt-3 flex items-center justify-between border-t pt-3' : 'mt-4 flex items-center justify-between border-t pt-4'} style={{ borderColor: BORDER }}>
            <span className={compact ? 'text-[11px]' : 'text-[12px]'} style={{ color: 'rgba(255,255,255,0.82)' }}>{t.total}</span>
            <span className={compact ? 'text-[17px] font-bold' : 'text-[20px] font-bold'} style={{ color: COLOR.teal }}>168 000 ₸</span>
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
                  <Spline3D
                    scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                    className="h-full w-full"
                    globalMouseTracking
                  />
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
          <div className="mt-10 lg:hidden">
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
            {t.bento.map((item, i) => {
              const Icon = BENTO_ICONS[item.icon]
              const card: BentoItem = {
                title: item.title,
                description: item.desc,
                chip: item.chip,
                hasPersistentHover: item.hasPersistentHover,
                href: item.href,
                icon: <Icon className="h-5 w-5" />,
              }
              return (
                <Reveal key={item.title} delay={Math.min(i * 0.06, 0.3)} className={item.colSpan === 2 ? 'h-full sm:col-span-2' : 'h-full'}>
                  <BentoCard item={card} />
                </Reveal>
              )
            })}
          </BentoGrid>
        </div>
      </section>

      {/* ---------------------------------------------- kaspi bot / ai agent */}
      <BotShowcase t={t} />

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

/* A single AI-agent lead-card row: label + value, fading in once `show`
   flips true (see the reveal timeline in BotShowcase below). Renders
   nothing beforehand rather than an empty/skeleton row -- the card grows
   as the "заявка" fills in, which is the point being demonstrated. */
function LeadField({ label, value, show, reduce }: { label: string; value: string; show: boolean; reduce: boolean }) {
  if (!show) return null
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
      className="flex items-center justify-between gap-3 text-[12.5px]"
    >
      <span style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </motion.div>
  )
}

/* Replaces the old static "soon" placeholder cards for Kaspi Bot and the
   AI agent -- both are live products now, so this shows an honest demo
   instead of a "coming soon" badge. Tab switch uses framer-motion's
   AnimatePresence for a fade-swap (not the raw CSS @keyframes strings
   from the throwaway brainstorm mockup) so the whole file stays on one
   animation system. "15 min" is the product's real competitor-price
   check interval (matches the /kaspi-shop UI); the AI agent's price
   mirrors AI_AGENT_CREDIT_PRICE_TENGE from src/lib/aiAgent/wallet.ts --
   both are real numbers, not marketing stats. The only looping animation
   is the functional status-pulse dot (motion-safe:animate-ping) -- no
   decorative infinite glow.

   The AI-agent tab plays a 4-message dialog plus a "Новая заявка" lead
   card that fills in as the conversation progresses -- the real "Заявки"
   (Kanban) feature the demo is illustrating. `visibleMessages`/`typing`/
   `leadStage` drive that timeline; every timer is collected in one array
   and cleared by the effect's cleanup, which fires both on unmount and on
   every dependency change (i.e. switching tabs), and the same cleanup
   path resets state to 0 so re-entering the tab always replays from the
   start. Reduced motion short-circuits straight to the end state. */
function BotShowcase({ t }: { t: Copy }) {
  const reduce = useReducedMotion()
  const [active, setActive] = useState<BotTabKey>('kaspibot')

  const [visibleMessages, setVisibleMessages] = useState(0)
  const [typing, setTyping] = useState(false)
  const [leadStage, setLeadStage] = useState<0 | 1 | 2>(0)
  const messageCount = t.botAgent.messages.length

  useEffect(() => {
    if (active !== 'aiagent') {
      setVisibleMessages(0)
      setTyping(false)
      setLeadStage(0)
      return
    }
    if (reduce) {
      setVisibleMessages(messageCount)
      setTyping(false)
      setLeadStage(2)
      return
    }
    setVisibleMessages(0)
    setTyping(false)
    setLeadStage(0)
    const timers = [
      setTimeout(() => setVisibleMessages(1), 200), // customer asks about delivery
      setTimeout(() => setLeadStage(1), 500), // "Запрос" known from the first message
      setTimeout(() => setVisibleMessages(2), 800), // agent answers
      setTimeout(() => setVisibleMessages(3), 1400), // customer agrees, gives name + phone
      setTimeout(() => setLeadStage(2), 1700), // "Имя"/"Телефон" known
      setTimeout(() => setTyping(true), 2000),
      setTimeout(() => {
        setTyping(false)
        setVisibleMessages(4) // agent confirms
      }, 3400), // ~1.4s of typing
    ]
    return () => timers.forEach(clearTimeout)
  }, [active, reduce, messageCount])

  return (
    <section id="bot-showcase" className="relative z-10 mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Reveal className="max-w-2xl">
        <h2 className="text-[clamp(1.9rem,4vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em]">{t.botTitle}</h2>
        <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>{t.botSubtitle}</p>
      </Reveal>

      <Reveal delay={0.08} className="mt-8">
        <div
          className="inline-flex gap-2 rounded-2xl p-1.5"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}` }}
        >
          {t.botTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              aria-pressed={active === tab.key}
              className="flex min-h-[44px] items-center justify-center rounded-xl px-5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                background: active === tab.key ? COLOR.violet : 'transparent',
                color: active === tab.key ? '#fff' : 'rgba(255,255,255,0.68)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.14} className="mt-6">
        <div className="overflow-hidden rounded-3xl p-6 sm:p-10" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
          <AnimatePresence mode="wait">
            {active === 'kaspibot' ? (
              <motion.div
                key="kaspibot"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center"
              >
                <div>
                  <div className="text-[clamp(2.75rem,6vw,4rem)] font-bold tracking-tight" style={{ color: '#5EEAD4' }}>
                    {t.botKaspi.stat}
                  </div>
                  <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {t.botKaspi.statCaption}
                  </p>
                </div>
                <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between text-[13px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
                    <span>{t.botKaspi.competitorLabel}</span>
                    <span className="text-[15px] font-semibold text-white">{t.botKaspi.competitorPrice}</span>
                  </div>
                  {/* Competitor on top, your (lower) price below it, in the accent
                      teal -- reads as "the bot just answered and took the lead",
                      not a warning. #5EEAD4 already carries that positive meaning
                      elsewhere in this card (the stat figure, the status dot). */}
                  <div className="mt-3 flex items-center justify-between text-[13px]" style={{ color: 'rgba(255,255,255,0.68)' }}>
                    <span>{t.botKaspi.yourPriceLabel}</span>
                    <span className="text-[15px] font-semibold" style={{ color: '#5EEAD4' }}>{t.botKaspi.yourPrice}</span>
                  </div>
                  <div className="mt-5 flex items-center gap-2 border-t pt-4 text-[12px]" style={{ borderColor: BORDER, color: 'rgba(255,255,255,0.68)' }}>
                    <span className="relative flex h-2 w-2">
                      <span
                        className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full"
                        style={{ background: '#5EEAD4', opacity: 0.6 }}
                      />
                      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#5EEAD4' }} />
                    </span>
                    {t.botKaspi.statusText}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="aiagent"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
                className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start"
              >
                <div>
                  <div className="text-[clamp(2.75rem,6vw,4rem)] font-bold tracking-tight" style={{ color: '#5EEAD4' }}>
                    {t.botAgent.stat}
                  </div>
                  <p className="mt-3 max-w-sm text-[14.5px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
                    {t.botAgent.statCaption}
                  </p>
                </div>
                {/* Chat stacks above the lead card by default; side-by-side only
                    once there's real room for both (xl:), never squeezed at lg. */}
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="min-w-0 flex-1 space-y-3 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
                    {t.botAgent.messages.slice(0, visibleMessages).map((msg, i) => (
                      <div key={i} className={msg.from === 'customer' ? 'flex justify-start' : 'flex justify-end'}>
                        <motion.div
                          initial={reduce ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                          className={
                            msg.from === 'customer'
                              ? 'max-w-[85%] rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px]'
                              : 'max-w-[85%] rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px] text-white'
                          }
                          style={msg.from === 'customer' ? { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)' } : { background: COLOR.violet }}
                        >
                          {msg.text}
                        </motion.div>
                      </div>
                    ))}
                    {typing ? (
                      <div className="flex justify-end">
                        <div
                          role="status"
                          aria-label={t.botAgent.typingLabel}
                          className="flex items-center gap-1 rounded-2xl rounded-br-sm px-3.5 py-3"
                          style={{ background: COLOR.violet }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="w-full xl:w-[240px] xl:flex-shrink-0">
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-white">{t.botAgent.leadTitle}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(94,234,212,0.16)', color: '#5EEAD4' }}>
                          {t.botAgent.leadStatus}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        <LeadField label={t.botAgent.leadRequestLabel} value={t.botAgent.leadRequest} show={leadStage >= 1} reduce={!!reduce} />
                        <LeadField label={t.botAgent.leadNameLabel} value={t.botAgent.leadName} show={leadStage >= 2} reduce={!!reduce} />
                        <LeadField label={t.botAgent.leadPhoneLabel} value={t.botAgent.leadPhone} show={leadStage >= 2} reduce={!!reduce} />
                      </div>
                    </div>
                    <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {t.botAgent.leadCaption}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  )
}
