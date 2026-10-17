import type { Lang } from '@/components/LanguageProvider'

// Строки страницы /dashboard и панелей верхней плашки (кошелёк, уведомления,
// помощь, аккаунт). Раньше они были зашиты по-русски, и после переключения на
// ҚЗ/EN меню менялось, а заголовки «Продукты платформы», «Аналитика» нет
// (аудит 17.10.2026, пункт P1-6). Статусы счетов и «Без клиента» берутся из
// history.ts, чтобы не плодить вторую копию.
export type DashboardContent = {
  pageTitle: string
  productsHeading: string
  analyticsHeading: string
  productInvoices: string
  productKaspiApi: string
  productAiAgent: string
  productKaspiBot: string
  lockedText: string
  vsPrevMonth: string
  perMonthCount: (n: number) => string
  paymentsLine: (count: string, amount: string) => string
  kaspiApiNeutral: string
  aiAgentNeutral: string
  kaspiBotNeutral: string
  revenueByInvoices: string
  periodDays: (n: number) => string
  periodTotal: string
  averageInvoice: string
  trend: string
  noPaidInPeriod: string
  monthsShort: string[]
  recentInvoices: string
  allHistory: string
  noInvoicesYet: string
  createFirstInvoice: string
  createInvoice: string
  invoiceAnalytics: string
  topBuyers: string
  topItems: string
  noPaidInvoicesYet: string
  appearAfterFirst: string
  footerPolicy: string
  footerTerms: string
  footerDataDeletion: string
}

export const dashboardDict: Record<Lang, DashboardContent> = {
  ru: {
    pageTitle: 'Дашборд',
    productsHeading: 'Продукты платформы',
    analyticsHeading: 'Аналитика',
    productInvoices: 'Счета',
    productKaspiApi: 'Kaspi Cashier API',
    productAiAgent: 'AI-агент',
    productKaspiBot: 'Kaspi Bot',
    lockedText: 'Доступно на тарифе Про',
    vsPrevMonth: 'к прошлому месяцу',
    perMonthCount: (n) => `${n} за этот месяц`,
    paymentsLine: (count, amount) => `${count} платежей · ${amount} ₸ за 30д`,
    kaspiApiNeutral: 'Приём оплат Kaspi на вашем сайте',
    aiAgentNeutral: 'Диалоги появятся здесь',
    kaspiBotNeutral: 'Показатели появятся здесь',
    revenueByInvoices: 'Выручка по счетам',
    periodDays: (n) => `${n}д`,
    periodTotal: 'Итого за период',
    averageInvoice: 'Средний счёт',
    trend: 'Динамика',
    noPaidInPeriod: 'Пока нет оплаченных счетов за этот период',
    monthsShort: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
    recentInvoices: 'Последние счета',
    allHistory: 'Вся история →',
    noInvoicesYet: 'У вас пока нет счетов. Создайте первый, чтобы начать.',
    createFirstInvoice: 'Создать первый счёт',
    createInvoice: 'Создать счёт',
    invoiceAnalytics: 'Аналитика по счетам',
    topBuyers: 'Топ покупателей',
    topItems: 'Топ товаров и услуг',
    noPaidInvoicesYet: 'Пока нет оплаченных счетов',
    appearAfterFirst: 'Появятся после первых счетов',
    footerPolicy: 'Политика',
    footerTerms: 'Условия',
    footerDataDeletion: 'Удаление данных',
  },
  kk: {
    pageTitle: 'Дашборд',
    productsHeading: 'Платформа өнімдері',
    analyticsHeading: 'Аналитика',
    productInvoices: 'Шоттар',
    productKaspiApi: 'Kaspi Cashier API',
    productAiAgent: 'AI-агент',
    productKaspiBot: 'Kaspi Bot',
    lockedText: 'Про тарифінде қолжетімді',
    vsPrevMonth: 'өткен айға қарағанда',
    perMonthCount: (n) => `осы айда ${n}`,
    paymentsLine: (count, amount) => `${count} төлем · 30 күнде ${amount} ₸`,
    kaspiApiNeutral: 'Сайтыңызда Kaspi төлемдерін қабылдау',
    aiAgentNeutral: 'Диалогтар осы жерде пайда болады',
    kaspiBotNeutral: 'Көрсеткіштер осы жерде пайда болады',
    revenueByInvoices: 'Шоттар бойынша түсім',
    periodDays: (n) => `${n} к.`,
    periodTotal: 'Кезеңдегі жиыны',
    averageInvoice: 'Орташа шот',
    trend: 'Динамика',
    noPaidInPeriod: 'Бұл кезеңде төленген шоттар әзірге жоқ',
    monthsShort: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'],
    recentInvoices: 'Соңғы шоттар',
    allHistory: 'Барлық тарих →',
    noInvoicesYet: 'Сізде әзірге шот жоқ. Бастау үшін алғашқысын құрыңыз.',
    createFirstInvoice: 'Алғашқы шотты құру',
    createInvoice: 'Шот құру',
    invoiceAnalytics: 'Шоттар аналитикасы',
    topBuyers: 'Үздік сатып алушылар',
    topItems: 'Үздік тауарлар мен қызметтер',
    noPaidInvoicesYet: 'Төленген шоттар әзірге жоқ',
    appearAfterFirst: 'Алғашқы шоттардан кейін пайда болады',
    footerPolicy: 'Саясат',
    footerTerms: 'Шарттар',
    footerDataDeletion: 'Деректерді жою',
  },
  en: {
    pageTitle: 'Dashboard',
    productsHeading: 'Platform products',
    analyticsHeading: 'Analytics',
    productInvoices: 'Invoices',
    productKaspiApi: 'Kaspi Cashier API',
    productAiAgent: 'AI Agent',
    productKaspiBot: 'Kaspi Bot',
    lockedText: 'Available on the Pro plan',
    vsPrevMonth: 'vs last month',
    perMonthCount: (n) => `${n} this month`,
    paymentsLine: (count, amount) => `${count} payments · ${amount} ₸ in 30d`,
    kaspiApiNeutral: 'Accept Kaspi payments on your website',
    aiAgentNeutral: 'Conversations will appear here',
    kaspiBotNeutral: 'Metrics will appear here',
    revenueByInvoices: 'Revenue from invoices',
    periodDays: (n) => `${n}d`,
    periodTotal: 'Total for the period',
    averageInvoice: 'Average invoice',
    trend: 'Trend',
    noPaidInPeriod: 'No paid invoices in this period yet',
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    recentInvoices: 'Recent invoices',
    allHistory: 'Full history →',
    noInvoicesYet: 'You have no invoices yet. Create the first one to get started.',
    createFirstInvoice: 'Create your first invoice',
    createInvoice: 'Create invoice',
    invoiceAnalytics: 'Invoice analytics',
    topBuyers: 'Top buyers',
    topItems: 'Top products and services',
    noPaidInvoicesYet: 'No paid invoices yet',
    appearAfterFirst: 'Will appear after your first invoices',
    footerPolicy: 'Privacy',
    footerTerms: 'Terms',
    footerDataDeletion: 'Data deletion',
  },
}
