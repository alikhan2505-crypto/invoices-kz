import type { Lang } from '@/components/LanguageProvider'
import type { ProductKey } from './products'

// Content of the public product landings (stage 4 of the product split).
// Colours come from the PRODUCTS registry; only the softer sticker tint lives
// here. Copy follows the founder-approved mock of 21.09.2026.
export type LandingKey = 'kaspi' | 'agent' | 'salon'

type L10n = Record<Lang, string>

export type LandingDef = {
  key: LandingKey
  product: ProductKey
  origin: string // canonical public address
  cabinet: '/kaspi-shop/overview' | '/ai-agent/overview' | '/admin/site-generator' // where a signed-in person goes
  // 'invite': the product is not open to everyone yet -- the call to action is
  // an application by e-mail, and only admins are sent to the cabinet.
  access: 'open' | 'invite'
  soft: string
  audience: L10n
  tagline: L10n
  lead: L10n
  points: Record<Lang, [string, string, string]>
  metaTitle: string
  metaDescription: string
}

export const LANDINGS: Record<LandingKey, LandingDef> = {
  kaspi: {
    key: 'kaspi',
    product: 'kaspiShop',
    origin: 'https://kaspi.invoices.kz',
    cabinet: '/kaspi-shop/overview',
    access: 'open',
    soft: '#FF8F7F',
    audience: { ru: 'Продавцы Kaspi Магазина', kk: 'Kaspi Дүкені сатушылары', en: 'Kaspi Magazin sellers' },
    tagline: {
      ru: 'Демпинг цен и заказы Kaspi в одном кабинете',
      kk: 'Kaspi бағаларын түсіру мен тапсырыстар бір кабинетте',
      en: 'Kaspi price undercutting and orders in one dashboard',
    },
    lead: {
      ru: 'Цена сама следует за конкурентами, но не падает ниже вашей границы. Заказы упаковываются и печатаются пачкой.',
      kk: 'Баға бәсекелестердің соңынан өзі жүреді, бірақ сіздің шегіңізден төмен түспейді. Тапсырыстар бумамен оралады және басылады.',
      en: 'Your price follows competitors but never drops below your floor. Orders are packed and printed in batches.',
    },
    points: {
      ru: ['Автоснижение цены до нижней границы', 'Упаковка, передача, накладные — все заказы сразу', 'Прибыль по каждому товару после комиссий'],
      kk: ['Бағаны төменгі шекке дейін автоматты түсіру', 'Орау, тапсыру, жүкқұжаттар — барлық тапсырыс бірден', 'Комиссиядан кейінгі әр тауар бойынша пайда'],
      en: ['Automatic price cuts down to your floor', 'Packing, handover, waybills — all orders at once', 'Profit per product after commissions'],
    },
    metaTitle: 'Kaspi Bot — демпинг цен и заказы Kaspi | invoices.kz',
    metaDescription: 'Цена на Kaspi сама следует за конкурентами, но не падает ниже вашей границы. Заказы, накладные, финансы и прибыль по товарам в одном кабинете.',
  },
  agent: {
    key: 'agent',
    product: 'aiAgent',
    origin: 'https://agent.invoices.kz',
    cabinet: '/ai-agent/overview',
    access: 'open',
    soft: '#D2C7FF',
    audience: { ru: 'Бизнес, который живёт в переписке', kk: 'Жазысуда жұмыс істейтін бизнес', en: 'Businesses that live in chat' },
    tagline: {
      ru: 'Отвечает клиентам в WhatsApp, Instagram и на сайте',
      kk: 'WhatsApp, Instagram және сайтта клиенттерге жауап береді',
      en: 'Answers customers on WhatsApp, Instagram and your website',
    },
    lead: {
      ru: 'Агент ведёт диалог по вашим правилам и передаёт человеку, когда нужно. Счёт или запись он готовит черновиком на подтверждение.',
      kk: 'Агент сіздің ережелеріңіз бойынша сөйлеседі және қажет кезде адамға береді. Шот немесе жазылуды растауға арналған жоба ретінде дайындайды.',
      en: 'The agent follows your rules and hands the chat to a person when needed. Invoices and bookings are prepared as drafts for your approval.',
    },
    points: {
      ru: ['Сценарии и кнопки без кода', 'Передаёт диалог человеку в нужный момент', 'Счёт или запись — черновиком, вы подтверждаете'],
      kk: ['Кодсыз сценарийлер мен түймелер', 'Диалогты қажет сәтте адамға береді', 'Шот немесе жазылу — жоба, сіз растайсыз'],
      en: ['Scenarios and buttons without code', 'Hands the chat to a person at the right moment', 'Invoice or booking as a draft, you approve'],
    },
    metaTitle: 'AI-агент — ответы клиентам в WhatsApp и Instagram | invoices.kz',
    metaDescription: 'AI-агент отвечает клиентам в WhatsApp, Instagram и на сайте, готовит счета и записи черновиком на подтверждение и передаёт диалог человеку.',
  },
  salon: {
    key: 'salon',
    product: 'salon',
    origin: 'https://salon.invoices.kz',
    cabinet: '/admin/site-generator',
    access: 'invite',
    soft: '#FBDDE6',
    audience: { ru: 'Салоны красоты и барбершопы', kk: 'Сұлулық салондары мен барбершоптар', en: 'Beauty salons and barbershops' },
    tagline: {
      ru: 'Записи клиентов, мастера и сайт салона',
      kk: 'Клиент жазылулары, мастерлер және салон сайты',
      en: 'Client bookings, masters and a salon website',
    },
    lead: {
      ru: 'Календарь по мастерам, записи из переписки на подтверждение владельцу и история каждого клиента.',
      kk: 'Мастерлер бойынша күнтізбе, жазысудан келген жазылулар иесіне растауға және әр клиенттің тарихы.',
      en: 'A calendar by master, bookings from chats for the owner to approve, and a history for every client.',
    },
    points: {
      ru: ['Календарь по мастерам и категориям услуг', 'Записи из переписки — на подтверждение', 'Клиенты и статус «Постоянный»'],
      kk: ['Мастерлер мен қызмет санаттары бойынша күнтізбе', 'Жазысудан келген жазылулар — растауға', 'Клиенттер және «Тұрақты» мәртебесі'],
      en: ['Calendar by master and service category', 'Bookings from chats wait for your approval', 'Clients and a "Regular" status'],
    },
    metaTitle: 'Салон — записи клиентов, мастера и сайт салона | invoices.kz',
    metaDescription: 'Календарь по мастерам, записи из переписки на подтверждение владельцу, история клиентов и сайт салона. Подключаем салоны по заявке.',
  },
}

export function isLandingKey(v: string): v is LandingKey {
  return Object.prototype.hasOwnProperty.call(LANDINGS, v)
}

export const LANDING_UI: Record<Lang, { allProducts: string; login: string; open: string; enter: string; apply: string; inviteNote: string; others: string; soon: string; lockedHint: string }> = {
  ru: { allProducts: 'Все продукты', login: 'Войти', open: 'Открыть кабинет', enter: 'Войти и открыть', apply: 'Оставить заявку', inviteNote: 'Салоны подключаем по заявке', others: 'Другие продукты', soon: 'скоро', lockedHint: 'Раздел ещё дорабатывается' },
  kk: { allProducts: 'Барлық өнімдер', login: 'Кіру', open: 'Кабинетті ашу', enter: 'Кіріп ашу', apply: 'Өтінім қалдыру', inviteNote: 'Салондарды өтінім бойынша қосамыз', others: 'Басқа өнімдер', soon: 'жақында', lockedHint: 'Бөлім әлі дайындалуда' },
  en: { allProducts: 'All products', login: 'Log in', open: 'Open dashboard', enter: 'Log in and open', apply: 'Request access', inviteNote: 'We onboard salons by request', others: 'Other products', soon: 'soon', lockedHint: 'This section is still in progress' },
}

// Public addresses shown in the "other products" bar.
export const OTHER_PRODUCT_LINKS: { product: ProductKey; label: string; url: string | null }[] = [
  { product: 'invoices', label: 'Счета', url: 'https://invoices.kz' },
  { product: 'kaspiShop', label: 'Kaspi Bot', url: 'https://kaspi.invoices.kz' },
  { product: 'kaspiApi', label: 'Kaspi Cashier API', url: 'https://api.invoices.kz' },
  { product: 'aiAgent', label: 'AI-агент', url: 'https://agent.invoices.kz' },
  { product: 'salon', label: 'Салон', url: 'https://salon.invoices.kz' },
  { product: 'wildberries', label: 'WB Bot', url: null },
]
