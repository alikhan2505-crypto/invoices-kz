import type { Lang } from '@/lib/langResolve'

// Тексты превью новой главной (/home-preview). Все утверждения взяты из живого
// лендинга Счетов (InvoicesLandingPage.COPY) и хаба (productsHub.ts): новых
// цифр, имён клиентов и отзывов здесь нет. Пример счёта (№ 2461, 174 000 ₸,
// «Ромашка») тот же, что в карточке на лендинге, и подписан «Пример».
// Казахские строки, которых нет в живых словарях, помечены (kk-new) в отчёте
// и ждут вычитки носителя; остальные дословно из лендинга/хаба, кроме замены
// тире на двоеточие (в новых строках тире не строим).

export interface HpCopy {
  /** Невидимый h1 для дикторов и поисковиков: анимированный заголовок скрыт от них. */
  h1: string
  /** Неподвижное слово заголовка («Счёт») и пять меняющихся слов. */
  headA: string
  words: readonly [string, string, string, string, string]
  /** Финальный заголовок после «отъезда камеры», две строки. */
  headEnd: readonly [string, string]
  /** Подпись-счётчик над заголовком: интро и финал целиком, остальные строятся из rail. */
  kickerIntro: string
  /** Короткие названия пяти глав: подписи полоски прогресса и счётчика. */
  rail: readonly [string, string, string, string, string]
  /** Тексты под заголовком: введение и пять глав. */
  intro: string
  chapters: readonly [string, string, string, string, string]
  /** Примечание к главе про Kaspi QR (комиссия). */
  qrNote: string
  scrollHint: string
  ctaPrimary: string
  ctaTools: string
  mock: {
    sample: string
    url: string
    number: string
    client: string
    service: string
    vat: string
    total: string
    draft: string
    awaiting: string
    payQr: string
    paid: string
    stamp: string
  }
  tiles: readonly { key: 'kaspiShop' | 'aiAgent' | 'cfo'; name: string; pitch: string; tag: string }[]
  final: { title: string; sub: string; button: string; note: string }
  footer: { privacy: string; terms: string; bottom: string }
  themeToLight: string
  themeToDark: string
  chaptersLabel: string
}

export const HP_COPY: Record<Lang, HpCopy> = {
  ru: {
    h1: 'Счёт за минуту. Оплата через Kaspi',
    headA: 'Счёт',
    words: ['за минуту', 'заполнен', 'посчитан', 'с Kaspi QR', 'оплачен'],
    headEnd: ['Тот же аккаунт,', 'тот же кошелёк'],
    kickerIntro: 'Для ИП и ТОО Казахстана',
    rail: ['Данные', 'НДС', 'Kaspi QR', 'Оплата', 'Кабинет'],
    intro: 'Счета, КП, АВР и накладные за минуту: PDF с подписью и печатью. Ссылка и QR Kaspi Pay прямо в счёте, оплата подтверждается сама.',
    chapters: [
      'Заполните данные клиента, добавьте услуги и/⁠или товары: PDF с подписью и печатью готов за минуту.',
      'Если вы на НДС, он считается по ставке 16%, итог собирается сам.',
      'Отправьте ссылку: клиент платит по Kaspi QR прямо со страницы счёта, без регистрации.',
      'Платформа сама видит оплату и помечает счёт оплаченным: сверять вручную ничего не нужно.',
      'Kaspi Bot, AI-агент и CFO-кабинет работают с тем же аккаунтом и кошельком. Подключайте, когда понадобится.',
    ],
    qrNote: 'Комиссия 2% берётся только с оплаченных через Kaspi счетов.',
    scrollHint: 'листайте вниз',
    ctaPrimary: 'Начать бесплатно',
    ctaTools: 'Бесплатные инструменты',
    mock: {
      sample: 'Пример', url: 'invoices.kz/i/2461', number: '№ 2461', client: 'ТОО «Ромашка»', service: 'Консалтинговые услуги',
      vat: 'НДС 16%', total: 'Итого', draft: 'Черновик', awaiting: 'Ожидает оплаты', payQr: 'Оплатите по Kaspi QR',
      paid: 'Оплачено · Kaspi', stamp: 'Оплачено',
    },
    tiles: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Демпинг цен и заказы Kaspi Магазина в одном кабинете', tag: 'Входит в Про' },
      { key: 'aiAgent', name: 'AI-агент', pitch: 'Отвечает клиентам в WhatsApp, Instagram и на сайте', tag: 'Входит в Про' },
      { key: 'cfo', name: 'CFO-кабинет', pitch: 'БДР, БДДС и платёжный календарь', tag: 'Закрытый тест' },
    ],
    final: {
      title: 'Готовы избавиться от бумажной волокиты?',
      sub: 'Зарегистрируйтесь: 7 дней тарифа Базовый бесплатно, до 10 счетов.',
      button: 'Начать бесплатно',
      note: 'Отмена в любое время',
    },
    footer: { privacy: 'Политика', terms: 'Условия', bottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана' },
    themeToLight: 'Светлая тема',
    themeToDark: 'Тёмная тема',
    chaptersLabel: 'Главы',
  },
  kk: {
    h1: 'Шот бір минутта. Төлем Kaspi арқылы',
    headA: 'Шот',
    words: ['бір минутта', 'толтырылды', 'есептелді', 'Kaspi QR-мен', 'төленді'],
    headEnd: ['Аккаунт та,', 'әмиян да ортақ'],
    kickerIntro: 'Қазақстандағы ЖК мен ЖШС үшін',
    rail: ['Деректер', 'ҚҚС', 'Kaspi QR', 'Төлем', 'Кабинет'],
    intro: 'Шот, КҰ, ОЖА және жүкқұжат бір минутта: қолтаңба мен мөрі бар PDF. Kaspi Pay сілтемесі мен QR коды шоттың өзінде, төлем өздігінен расталады.',
    chapters: [
      'Клиент деректерін толтырып, қызметтер мен/⁠немесе тауарларды қосыңыз: қолтаңба мен мөрі бар PDF бір минутта дайын.',
      'Егер сіз ҚҚС төлеушісі болсаңыз, ҚҚС 16% мөлшерлемесімен есептеледі, қорытынды өзі шығады.',
      'Сілтемені жіберіңіз: клиент тіркелусіз, тікелей шот бетінен Kaspi QR арқылы төлейді.',
      'Платформа төлемді өзі көріп, шотты төленді деп белгілейді: қолмен тексерудің қажеті жоқ.',
      'Kaspi Bot, AI-агент және CFO-кабинет бір аккаунт пен бір әмиянмен жұмыс істейді. Қажет болғанда қосыңыз.',
    ],
    qrNote: 'Комиссия 2% тек Kaspi арқылы төленген шоттардан алынады.',
    scrollHint: 'төмен сырғытыңыз',
    ctaPrimary: 'Тегін бастау',
    ctaTools: 'Тегін құралдар',
    mock: {
      sample: 'Үлгі', url: 'invoices.kz/i/2461', number: '№ 2461', client: '«Ромашка» ЖШС', service: 'Кеңес беру қызметтері',
      vat: 'ҚҚС 16%', total: 'Барлығы', draft: 'Жоба', awaiting: 'Төлем күтілуде', payQr: 'Kaspi QR арқылы төлеңіз',
      paid: 'Төленді · Kaspi', stamp: 'Төленді',
    },
    tiles: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Kaspi Магазиндегі баға демпингі мен тапсырыстар бір кабинетте', tag: 'Про тарифіне кіреді' },
      { key: 'aiAgent', name: 'AI-агент', pitch: 'Клиенттерге WhatsApp, Instagram және сайтта жауап береді', tag: 'Про тарифіне кіреді' },
      { key: 'cfo', name: 'CFO-кабинет', pitch: 'Бюджет, ақша ағыны және төлем күнтізбесі', tag: 'Жабық сынақ' },
    ],
    final: {
      title: 'Қағаз әуреден құтылуға дайынсыз ба?',
      sub: 'Тіркеліңіз: Базалық тариф 7 күн тегін, 10 шотқа дейін.',
      button: 'Тегін бастау',
      note: 'Кез келген уақытта бас тартуға болады',
    },
    footer: { privacy: 'Құпиялылық', terms: 'Шарттар', bottom: '© 2026 INVOICES.KZ · «First Project» ЖК · БСН 890525350143 · Астана қ.' },
    themeToLight: 'Ашық тема',
    themeToDark: 'Қараңғы тема',
    chaptersLabel: 'Тараулар',
  },
  en: {
    h1: 'Invoice in a minute. Get paid via Kaspi',
    headA: 'Invoice',
    words: ['in a minute', 'filled in', 'calculated', 'with Kaspi QR', 'paid'],
    headEnd: ['Same account,', 'same wallet'],
    kickerIntro: 'For sole traders and LLPs',
    rail: ['Details', 'VAT', 'Kaspi QR', 'Payment', 'Dashboard'],
    intro: 'Invoices, quotes, acts and delivery notes in a minute: a PDF with your signature and stamp. A Kaspi Pay link and QR code right in the invoice; payment confirms itself.',
    chapters: [
      "Fill in the client's details, add services and/⁠or goods: a signed and stamped PDF is ready in a minute.",
      'If you are a VAT payer, VAT is calculated at 16% and the total adds up on its own.',
      'Send the link: the client pays with a Kaspi QR code right from the invoice page, no signup required.',
      'The platform detects the payment and marks the invoice paid automatically: nothing to reconcile by hand.',
      'Kaspi Bot, the AI agent and the CFO dashboard use the same account and wallet. Add them when you need them.',
    ],
    qrNote: 'A 2% fee applies only to invoices actually paid via Kaspi.',
    scrollHint: 'scroll down',
    ctaPrimary: 'Start for free',
    ctaTools: 'Free tools',
    mock: {
      sample: 'Sample', url: 'invoices.kz/i/2461', number: 'No. 2461', client: 'Romashka LLP', service: 'Consulting services',
      vat: 'VAT 16%', total: 'Total', draft: 'Draft', awaiting: 'Awaiting payment', payQr: 'Pay with Kaspi QR',
      paid: 'Paid · Kaspi', stamp: 'Paid',
    },
    tiles: [
      { key: 'kaspiShop', name: 'Kaspi Bot', pitch: 'Kaspi Shop repricing and orders in one dashboard', tag: 'Included in Pro' },
      { key: 'aiAgent', name: 'AI agent', pitch: 'Answers customers on WhatsApp, Instagram and your website', tag: 'Included in Pro' },
      { key: 'cfo', name: 'CFO dashboard', pitch: 'P&L, cash flow and a payment calendar', tag: 'Closed beta' },
    ],
    final: {
      title: 'Ready to drop the paperwork?',
      sub: 'Sign up: 7 days of the Basic plan free, up to 10 invoices.',
      button: 'Start for free',
      note: 'Cancel anytime',
    },
    footer: { privacy: 'Privacy', terms: 'Terms', bottom: '© 2026 INVOICES.KZ · First Project Sole Proprietorship · BIN 890525350143 · Astana, Kazakhstan' },
    themeToLight: 'Light theme',
    themeToDark: 'Dark theme',
    chaptersLabel: 'Chapters',
  },
}
