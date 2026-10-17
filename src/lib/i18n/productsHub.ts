import type { Lang } from '@/components/LanguageProvider'
import type { ProductKey } from '@/lib/products'

// Тексты хаба продуктов (главная invoices.kz) на трёх языках — выбор
// основателя 13.10.2026 (ревизия платформы, пункт 1Б): глобальный
// переключатель языка, хаб переведён первым, остальные разделы — поэтапно.
// Названия-бренды (Kaspi Bot, CFO, AI-агент…) намеренно не переводятся.

export type HubCopy = {
  docTitle: string
  signIn: string
  dashboard: string
  eyebrowGuest: string
  eyebrowUser: string
  h1Guest: string
  h1User: string
  subGuest: string
  subUser: string
  personaHand: string
  showAll: string
  soon: string
  soonFoot: string
  inMenu: string
  notInMenu: string
  open: string
  whatsInside: string
  removeFromMenu: string
  addToMenu: string
  proTag: string
  noteGuest: string
  noteUser: string
}

export const HUB_COPY: Record<Lang, HubCopy> = {
  ru: {
    docTitle: 'invoices.kz — сервисы для бизнеса в Казахстане',
    signIn: 'Войти',
    dashboard: 'Дашборд',
    eyebrowGuest: 'Счета, Kaspi, API, агенты, CFO-кабинет',
    eyebrowUser: 'Ваши продукты',
    h1Guest: 'Один аккаунт. Каждый инструмент — отдельно.',
    h1User: 'Что показывать в меню',
    subGuest: 'Не продаёте на Kaspi — не увидите его в меню. Понадобится позже — добавите в один клик.',
    subUser: 'Отметьте продукты, которые нужны вам. Остальные уйдут из меню, но по прямой ссылке откроются — ничего не удаляется.',
    personaHand: 'чем занимаетесь?',
    showAll: 'Показать все',
    soon: 'Скоро',
    soonFoot: 'Раздел дорабатывается',
    inMenu: 'В меню',
    notInMenu: 'Не в меню',
    open: 'Открыть',
    whatsInside: 'Что внутри',
    removeFromMenu: 'Убрать из меню',
    addToMenu: 'Добавить в меню',
    proTag: ' · тариф Про',
    noteGuest: 'Аккаунт, тариф и кошелёк — общие для всех продуктов. Войдёте один раз — дальше не нужно.',
    noteUser: 'Меню — это только ваш выбор, что показывать. Доступ к продуктам он не меняет: тариф и права остаются прежними.',
  },
  kk: {
    docTitle: 'invoices.kz — Қазақстандағы бизнеске арналған сервистер',
    signIn: 'Кіру',
    dashboard: 'Дашборд',
    eyebrowGuest: 'Шоттар, Kaspi, API, агенттер, CFO-кабинет',
    eyebrowUser: 'Сіздің өнімдеріңіз',
    h1Guest: 'Бір аккаунт. Әр құрал — бөлек.',
    h1User: 'Мәзірде нені көрсету керек',
    subGuest: 'Kaspi-де сатпасаңыз — оны мәзірден көрмейсіз. Кейін керек болса — бір рет басып қосасыз.',
    subUser: 'Өзіңізге қажет өнімдерді белгілеңіз. Қалғандары мәзірден кетеді, бірақ тікелей сілтемемен ашылады — ештеңе өшірілмейді.',
    personaHand: 'немен айналысасыз?',
    showAll: 'Барлығын көрсету',
    soon: 'Жақында',
    soonFoot: 'Бөлім әзірленуде',
    inMenu: 'Мәзірде',
    notInMenu: 'Мәзірде емес',
    open: 'Ашу',
    whatsInside: 'Ішінде не бар',
    removeFromMenu: 'Мәзірден алу',
    addToMenu: 'Мәзірге қосу',
    proTag: ' · Про тарифі',
    noteGuest: 'Аккаунт, тариф және әмиян — барлық өнімге ортақ. Бір рет кірсеңіз — болды.',
    noteUser: 'Мәзір — тек нені көрсету туралы таңдауыңыз. Өнімдерге қолжетімділікті өзгертпейді: тариф пен құқықтар сол күйінде қалады.',
  },
  en: {
    docTitle: 'invoices.kz — business tools for Kazakhstan',
    signIn: 'Sign in',
    dashboard: 'Dashboard',
    eyebrowGuest: 'Invoices, Kaspi, API, agents, CFO',
    eyebrowUser: 'Your products',
    h1Guest: 'One account. Every tool on its own.',
    h1User: 'What to show in the menu',
    subGuest: 'Not selling on Kaspi? You won’t see it in your menu. Need it later — add it in one click.',
    subUser: 'Pick the products you need. The rest leave your menu but still open by direct link — nothing gets deleted.',
    personaHand: 'what do you do?',
    showAll: 'Show all',
    soon: 'Soon',
    soonFoot: 'Section in progress',
    inMenu: 'In menu',
    notInMenu: 'Not in menu',
    open: 'Open',
    whatsInside: 'What’s inside',
    removeFromMenu: 'Remove from menu',
    addToMenu: 'Add to menu',
    proTag: ' · Pro plan',
    noteGuest: 'One account, one plan, one wallet for every product. Sign in once — that’s it.',
    noteUser: 'The menu is only about what you see. It never changes access: your plan and permissions stay the same.',
  },
}

export type FooterCopy = {
  privacy: string
  terms: string
  dataDeletion: string
  contacts: string
  company: string
}

export const FOOTER_COPY: Record<Lang, FooterCopy> = {
  ru: {
    privacy: 'Политика конфиденциальности',
    terms: 'Условия сервиса',
    dataDeletion: 'Удаление данных',
    contacts: 'Связаться',
    company: 'ИП First Project · БИН 890525350143 · Астана, Казахстан',
  },
  kk: {
    privacy: 'Құпиялылық саясаты',
    terms: 'Қызмет шарттары',
    dataDeletion: 'Деректерді жою',
    contacts: 'Байланысу',
    company: 'ЖК First Project · БСН 890525350143 · Астана, Қазақстан',
  },
  en: {
    privacy: 'Privacy policy',
    terms: 'Terms of service',
    dataDeletion: 'Data deletion',
    contacts: 'Contact',
    company: 'IE First Project · BIN 890525350143 · Astana, Kazakhstan',
  },
}

export const PERSONA_LABELS: Record<Lang, Record<string, string>> = {
  ru: { kaspi: 'Продаю на Kaspi', wb: 'Продаю на Wildberries', ip: 'Я ИП или ТОО', messengers: 'Продаю в Instagram и WhatsApp', finance: 'Слежу за финансами', dev: 'Пишу код', salon: 'У меня салон' },
  kk: { kaspi: 'Kaspi-де сатамын', wb: 'Wildberries-те сатамын', ip: 'Мен ЖК немесе ЖШС', messengers: 'Instagram мен WhatsApp-та сатамын', finance: 'Қаржыны бақылаймын', dev: 'Код жазамын', salon: 'Менде салон бар' },
  en: { kaspi: 'I sell on Kaspi', wb: 'I sell on Wildberries', ip: 'I’m a business', messengers: 'I sell via Instagram & WhatsApp', finance: 'I manage the finances', dev: 'I write code', salon: 'I run a salon' },
}

export const PRODUCT_I18N: Record<ProductKey, { name: Record<Lang, string>; blurb: Record<Lang, string> }> = {
  invoices: {
    name: { ru: 'Счета', kk: 'Шоттар', en: 'Invoices' },
    blurb: {
      ru: 'Счёт, КП и АВР за 30 секунд',
      kk: 'Шот, КҰ және ОЖА 30 секундта',
      en: 'Invoice, quote and act in 30 seconds',
    },
  },
  kaspiShop: {
    name: { ru: 'Kaspi Bot', kk: 'Kaspi Bot', en: 'Kaspi Bot' },
    blurb: {
      ru: 'Демпинг цен и заказы Kaspi',
      kk: 'Kaspi баға демпингі және тапсырыстар',
      en: 'Kaspi price racing and orders',
    },
  },
  kaspiApi: {
    name: { ru: 'Kaspi Cashier API', kk: 'Kaspi Cashier API', en: 'Kaspi Cashier API' },
    blurb: {
      ru: 'Приём Kaspi Pay в ваш код',
      kk: 'Kaspi Pay қабылдауды кодыңызға қосу',
      en: 'Accept Kaspi Pay from your code',
    },
  },
  aiAgent: {
    name: { ru: 'AI-агент', kk: 'AI-агент', en: 'AI Agent' },
    blurb: {
      ru: 'Отвечает клиентам в мессенджерах',
      kk: 'Мессенджерлерде клиенттерге жауап береді',
      en: 'Replies to customers in messengers',
    },
  },
  salon: {
    name: { ru: 'Салон', kk: 'Салон', en: 'Salon' },
    blurb: {
      ru: 'Записи, мастера, сайт салона',
      kk: 'Жазылулар, шеберлер, салон сайты',
      en: 'Bookings, staff, salon website',
    },
  },
  cfo: {
    name: { ru: 'CFO', kk: 'CFO', en: 'CFO' },
    blurb: {
      ru: 'БДР, БДДС и платёжный календарь',
      kk: 'БДР, БДДС және төлем күнтізбесі',
      en: 'P&L, cash flow and payment calendar',
    },
  },
  wildberries: {
    name: { ru: 'WB Bot', kk: 'WB Bot', en: 'WB Bot' },
    blurb: {
      ru: 'Товары и заказы Wildberries',
      kk: 'Wildberries тауарлары мен тапсырыстары',
      en: 'Wildberries products and orders',
    },
  },
}

// Полоса «Бесплатно, без регистрации» под плитками хаба (решение основателя
// 14.10.2026, вариант А): ссылки на бесплатные /tools и гайды. Порядок —
// по частоте спроса: документы, потом налоги и проверки, потом Kaspi.
export const FREE_TOOLS: readonly string[] = ['schet', 'avr', 'nakladnaya', 'kp', 'nalogi', 'kontragent', 'margin', 'waybills']

export const FREE_TOOLS_COPY: Record<Lang, { title: string; sub: string; all: string; guides: string; tools: Record<string, string> }> = {
  ru: {
    title: 'Бесплатно, без регистрации',
    sub: 'Документы и расчёты прямо в браузере',
    all: 'Все инструменты',
    guides: 'Гайды',
    tools: { schet: 'Счёт на оплату', avr: 'АВР', nakladnaya: 'Накладная', kp: 'КП', nalogi: 'Налоги ИП 2026', kontragent: 'Проверка контрагента', margin: 'Маржа Kaspi', waybills: 'Печать накладных Kaspi' },
  },
  kk: {
    title: 'Тегін, тіркелусіз',
    sub: 'Құжаттар мен есептеулер тікелей браузерде',
    all: 'Барлық құралдар',
    guides: 'Нұсқаулықтар',
    tools: { schet: 'Төлем шоты', avr: 'ОЖА', nakladnaya: 'Жүкқұжат', kp: 'КҰ', nalogi: 'ЖК салықтары 2026', kontragent: 'Контрагентті тексеру', margin: 'Kaspi маржасы', waybills: 'Kaspi жүкқұжаттарын басып шығару' },
  },
  en: {
    title: 'Free, no sign-up',
    sub: 'Documents and calculators right in your browser',
    all: 'All tools',
    guides: 'Guides',
    tools: { schet: 'Invoice', avr: 'Act of work (AVR)', nakladnaya: 'Delivery note', kp: 'Quote', nalogi: 'Sole-trader taxes 2026', kontragent: 'Counterparty check', margin: 'Kaspi margin', waybills: 'Print Kaspi waybills' },
  },
}
