import type { Lang } from '@/components/LanguageProvider'
import type { ProductKey } from './products'
import { PLAN_PRICES } from './plans/pricing'

// «5 990» с неразрывным пробелом — сумма Про берётся из PLAN_PRICES (единый
// источник цен), чтобы строка на лендинге не разошлась с тарифами. Свой
// форматтер, а не toLocaleString: одинаковый результат на сервере и в браузере.
const tenge = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}\u00A0₸`
const PRO_MONTHLY = tenge(PLAN_PRICES.pro.monthly)

// Content of the public product landings (stage 4 of the product split).
// Colours come from the PRODUCTS registry; only the softer sticker tint lives
// here. Copy follows the founder-approved mock of 21.09.2026.
export type LandingKey = 'kaspi' | 'agent' | 'salon' | 'cfo'

type L10n = Record<Lang, string>

export type LandingDef = {
  key: LandingKey
  product: ProductKey
  origin: string // canonical public address
  cabinet: '/kaspi-shop/overview' | '/ai-agent/overview' | '/admin/site-generator' | '/cfo/overview' // where a signed-in person goes
  // 'invite': the product is not open to everyone yet -- the call to action is
  // an application by e-mail, and only admins are sent to the cabinet.
  access: 'open' | 'invite'
  // Text colour on the soft stickers when the product ink is light (CFO): falls back to the product ink.
  softInk?: string
  // Note under the call to action for 'invite' landings; falls back to LANDING_UI.inviteNote.
  inviteNote?: L10n
  // Одна честная строка о цене под кнопкой (решение основателя «1А», 14.10):
  // полная таблица тарифов — только на лендинге Счетов, здесь — тариф и
  // расход из кошелька + ссылка «Тарифы →». У salon/cfo нет (заявка/закрытый тест).
  priceNote?: L10n
  soft: string
  audience: L10n
  tagline: L10n
  lead: L10n
  points: Record<Lang, [string, string, string]>
  // Заголовок вкладки на языке страницы: язык живёт в браузере (cookie), сервер
  // его не знает, поэтому клиент подменяет серверный <title> (как на хабе).
  title: L10n
  // Для поисковиков — русский + казахский (решение основателя, как на хабе):
  // <title> = metaTitle (без «| invoices.kz») · metaTitleKk | invoices.kz,
  // description = metaDescription + metaDescriptionKk.
  metaTitle: string
  metaTitleKk: string
  metaDescription: string
  metaDescriptionKk: string
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
      kk: 'Kaspi демпингі мен тапсырыстары бір кабинетте',
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
    priceNote: {
      ru: `Входит в тариф Про — ${PRO_MONTHLY}/мес. Каждая проверка цены — 5\u00A0₸ из кошелька.`,
      kk: `Про тарифіне кіреді — ${PRO_MONTHLY}/ай. Бағаны әр тексеру — әмияннан 5\u00A0₸.`,
      en: `Included in the Pro plan — ${PRO_MONTHLY}/mo. Each price check takes 5\u00A0₸ from your wallet.`,
    },
    title: {
      ru: 'Kaspi Bot — демпинг цен и заказы Kaspi | invoices.kz',
      kk: 'Kaspi Bot — Kaspi-дегі баға демпингі мен тапсырыстар | invoices.kz',
      en: 'Kaspi Bot — Kaspi price undercutting and orders | invoices.kz',
    },
    metaTitle: 'Kaspi Bot — демпинг цен и заказы Kaspi | invoices.kz',
    metaTitleKk: 'Kaspi-дегі баға демпингі мен тапсырыстар',
    metaDescription: 'Цена на Kaspi сама следует за конкурентами, но не падает ниже вашей границы. Заказы, накладные, финансы и прибыль по товарам в одном кабинете.',
    metaDescriptionKk: 'Kaspi-дегі баға бәсекелестерге ілесіп өзі өзгереді, бірақ сіз белгілеген шектен төмен түспейді. Тапсырыстар, жүкқұжаттар, қаржы және әр тауар бойынша пайда — бір кабинетте.',
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
      // Короче, чем было («…в WhatsApp, Instagram и на сайте»): в пять строк
      // заголовок выталкивал страницу в прокрутку (правка основателя 13.10).
      // Каналы по именам — в окне анимации, мета-тегах и описании.
      ru: 'Отвечает клиентам в мессенджерах и на сайте',
      kk: 'Клиенттерге мессенджер мен сайтта жауап береді',
      en: 'Answers customers in messengers and on your site',
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
    priceNote: {
      ru: `Входит в тариф Про — ${PRO_MONTHLY}/мес. Каждый ответ агента — 5\u00A0₸ из кошелька.`,
      kk: `Про тарифіне кіреді — ${PRO_MONTHLY}/ай. Агенттің әр жауабы — әмияннан 5\u00A0₸.`,
      en: `Included in the Pro plan — ${PRO_MONTHLY}/mo. Each agent reply takes 5\u00A0₸ from your wallet.`,
    },
    title: {
      ru: 'AI-агент — ответы клиентам в WhatsApp и Instagram | invoices.kz',
      kk: 'AI-агент — WhatsApp пен Instagram-да клиенттерге жауап береді | invoices.kz',
      en: 'AI Agent — replies to customers on WhatsApp and Instagram | invoices.kz',
    },
    metaTitle: 'AI-агент — ответы клиентам в WhatsApp и Instagram | invoices.kz',
    metaTitleKk: 'WhatsApp пен Instagram-да клиенттерге жауап береді',
    metaDescription: 'AI-агент отвечает клиентам в WhatsApp, Instagram и на сайте, готовит счета и записи черновиком на подтверждение и передаёт диалог человеку.',
    metaDescriptionKk: 'AI-агент WhatsApp, Instagram және сайттағы клиенттерге жауап береді, шот пен жазылуды растауға жоба ретінде дайындайды және қажет кезде диалогты адамға өткізеді.',
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
      kk: 'Жазылулар, мастерлер және салон сайты',
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
    title: {
      ru: 'Салон — записи клиентов, мастера и сайт салона | invoices.kz',
      kk: 'Салон — клиенттердің жазылуы, мастерлер және салон сайты | invoices.kz',
      en: 'Salon — client bookings, staff and a salon website | invoices.kz',
    },
    metaTitle: 'Салон — записи клиентов, мастера и сайт салона | invoices.kz',
    metaTitleKk: 'жазылулар, мастерлер және салон сайты',
    metaDescription: 'Календарь по мастерам, записи из переписки на подтверждение владельцу, история клиентов и сайт салона. Подключаем салоны по заявке.',
    metaDescriptionKk: 'Мастерлер бойынша күнтізбе, хат алмасудан келген жазылулар — салон иесінің растауына, клиенттер тарихы және салон сайты. Салондарды өтінім бойынша қосамыз.',
  },
  cfo: {
    key: 'cfo',
    product: 'cfo',
    origin: 'https://cfo.invoices.kz',
    cabinet: '/cfo/overview',
    access: 'invite',
    soft: '#9BE3CF',
    softInk: '#0E4D45',
    // Семейный бюджет — тоже аудитория (правка основателя 13.10): в кабинете есть режим «Семья».
    audience: { ru: 'Для бизнеса и семейного бюджета', kk: 'Бизнес пен отбасы бюджеті үшін', en: 'For business and family budgets' },
    tagline: {
      ru: 'БДР, БДДС и платёжный календарь',
      kk: 'Бюджет, ақша ағыны және төлем күнтізбесі',
      en: 'P&L, cash flow and a payment calendar',
    },
    lead: {
      ru: 'Заносите операции один раз — прибыль, движение денег и прогноз остатка по дням строятся сами. Подходит и для семейного бюджета.',
      kk: 'Операцияларды бір рет енгізіңіз — пайда, ақша қозғалысы және күн сайынғы қалдық болжамы өзі құрылады. Отбасы бюджетіне де жарайды.',
      en: 'Enter each transaction once — profit, cash flow and a daily balance forecast build themselves. Works for a family budget too.',
    },
    points: {
      ru: ['План и факт по статьям за каждый месяц', 'Платёжный календарь с прогнозом остатка', 'Режим «Семья» — тот же учёт для домашнего бюджета'],
      kk: ['Әр ай бойынша баптар бойынша жоспар мен факт', 'Қалдық болжамы бар төлем күнтізбесі', '«Отбасы» режимі — үй бюджетіне сол есеп'],
      en: ['Plan vs actual by line item, every month', 'Payment calendar with a balance forecast', '“Family” mode — the same tracking for a home budget'],
    },
    inviteNote: {
      ru: 'Сейчас в закрытом тесте — открываем по заявке',
      kk: 'Қазір жабық сынақта — өтінім бойынша ашамыз',
      en: 'In closed beta — access by request',
    },
    title: {
      ru: 'CFO — БДР, БДДС и платёжный календарь | invoices.kz',
      kk: 'CFO — кіріс-шығыс бюджеті, ақша ағыны және төлем күнтізбесі | invoices.kz',
      en: 'CFO — P&L, cash flow and a payment calendar | invoices.kz',
    },
    metaTitle: 'CFO — БДР, БДДС и платёжный календарь | invoices.kz',
    metaTitleKk: 'кіріс-шығыс бюджеті, ақша ағыны және төлем күнтізбесі',
    metaDescription: 'Кабинет финансового директора: бюджет доходов и расходов, движение денежных средств, платёжный календарь с прогнозом кассовых разрывов и ключевые показатели. Есть режим для семейного бюджета.',
    metaDescriptionKk: 'Қаржы директорының кабинеті: кірістер мен шығыстар бюджеті, ақша қаражатының қозғалысы, кассалық алшақтықты алдын ала көрсететін төлем күнтізбесі және негізгі көрсеткіштер. Отбасы бюджетіне арналған режимі де бар.',
  },
}

export function isLandingKey(v: string): v is LandingKey {
  return Object.prototype.hasOwnProperty.call(LANDINGS, v)
}

export const LANDING_UI: Record<Lang, { allProducts: string; login: string; open: string; enter: string; apply: string; inviteNote: string; others: string; soon: string; lockedHint: string; pricing: string }> = {
  ru: { allProducts: 'Все продукты', login: 'Войти', open: 'Открыть кабинет', enter: 'Войти и открыть', apply: 'Оставить заявку', inviteNote: 'Салоны подключаем по заявке', others: 'Другие продукты', soon: 'скоро', lockedHint: 'Раздел ещё дорабатывается', pricing: 'Тарифы' },
  kk: { allProducts: 'Барлық өнімдер', login: 'Кіру', open: 'Кабинетті ашу', enter: 'Кіріп ашу', apply: 'Өтінім қалдыру', inviteNote: 'Салондарды өтінім бойынша қосамыз', others: 'Басқа өнімдер', soon: 'жақында', lockedHint: 'Бөлім әлі дайындалуда', pricing: 'Тарифтер' },
  en: { allProducts: 'All products', login: 'Log in', open: 'Open dashboard', enter: 'Log in and open', apply: 'Request access', inviteNote: 'We onboard salons by request', others: 'Other products', soon: 'soon', lockedHint: 'This section is still in progress', pricing: 'Pricing' },
}

// Полная таблица тарифов живёт на лендинге Счетов (docs.invoices.kz).
export const PRICING_URL = 'https://docs.invoices.kz/#pricing'

// Public addresses shown in the "other products" bar (names come from
// PRODUCT_I18N in the page's language). All seven products, same set as the hub:
// CFO is a "скоро" teaser for everyone but admins (adminOnly in PRODUCTS).
export const OTHER_PRODUCT_LINKS: { product: ProductKey; url: string | null }[] = [
  { product: 'invoices', url: 'https://invoices.kz' },
  { product: 'kaspiShop', url: 'https://kaspi.invoices.kz' },
  { product: 'kaspiApi', url: 'https://api.invoices.kz' },
  { product: 'aiAgent', url: 'https://agent.invoices.kz' },
  { product: 'salon', url: 'https://salon.invoices.kz' },
  { product: 'cfo', url: 'https://cfo.invoices.kz' },
  { product: 'wildberries', url: null },
]
