import type { Lang } from '@/components/LanguageProvider'

// Строки верхней плашки кабинета (кошелёк, уведомления, помощь, аккаунт).
// Тексты были зашиты по-русски: после переключения на ҚЗ/EN менялась только
// кнопка языка (аудит 17.10.2026, P1-6). Здесь только подписи -- логика
// кошелька остаётся в TopUtilityBar.tsx.
export type UtilityBarContent = {
  walletTitle: string
  notificationsTitle: string
  helpTitle: string
  accountTitle: string
  timeJustNow: string
  timeMinutesAgo: (n: number) => string
  timeHoursAgo: (n: number) => string
  timeDaysAgo: (n: number) => string
  pluralDays: (n: number) => string
  bonusCredited: (amount: string) => string
  bonusAlready: string
  minAmount: (amount: string) => string
  invalidPhone: string
  sendFailed: string
  createFailed: string
  balance: string
  oneBalance: string
  spend30: string
  topped30: (amount: string) => string
  enoughFor: string
  atCurrentPace: string
  topUp: string
  requestDeclined: string
  retry: string
  requestSentTo: (phone: string) => string
  confirmInKaspi: string
  cancelRequest: string
  scanQr: string
  confirmPaymentEllipsis: string
  refreshingCode: string
  qrValidFor: string
  openPayment: string
  or: string
  sendToPhone: string
  customAmount: string
  creatingPayment: string
  sendingEllipsis: string
  sendRequest: string
  recentOperations: string
  loading: string
  noOperations: string
  earnedViaKaspi: string
  paymentsDirect: string
  tariff: string
  unlimited: string
  invoicesWord: string
  markAllRead: string
  noNotifications: string
  notificationSettings: string
  support: string
  about: string
  noCompanyName: string
  profileAndSettings: string
  signOut: string
  segmentInvoices: string
  segmentKaspiBot: string
  segmentAiAgent: string
}

export const utilityBarDict: Record<Lang, UtilityBarContent> = {
  ru: {
    walletTitle: 'Кошелёк',
    notificationsTitle: 'Уведомления',
    helpTitle: 'Помощь',
    accountTitle: 'Аккаунт',
    timeJustNow: 'только что',
    timeMinutesAgo: (n) => `${n} мин назад`,
    timeHoursAgo: (n) => `${n} ч назад`,
    timeDaysAgo: (n) => `${n} дн назад`,
    pluralDays: (n) => {
      const mod10 = n % 10
      const mod100 = n % 100
      if (mod10 === 1 && mod100 !== 11) return 'день'
      if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'дня'
      return 'дней'
    },
    bonusCredited: (a) => `Начислено ${a} ₸ — добро пожаловать!`,
    bonusAlready: 'Бонус уже был получен ранее.',
    minAmount: (a) => `Минимум ${a} ₸`,
    invalidPhone: 'Проверьте номер телефона',
    sendFailed: 'Не удалось отправить запрос, попробуйте ещё раз',
    createFailed: 'Не удалось создать оплату, попробуйте ещё раз',
    balance: 'Баланс',
    oneBalance: 'Один баланс на все сервисы — пополняете один раз, тратится там, где используете.',
    spend30: 'Расходы за 30 дней',
    topped30: (a) => `Пополнено за 30 дней: ${a} ₸`,
    enoughFor: 'Хватит на',
    atCurrentPace: 'при текущем темпе',
    topUp: 'Пополнить',
    requestDeclined: 'Запрос отклонён в приложении Kaspi',
    retry: 'Повторить',
    requestSentTo: (p) => `Запрос отправлен на ${p}`,
    confirmInKaspi: 'Подтвердите оплату в приложении Kaspi — баланс пополнится автоматически.',
    cancelRequest: 'Отменить запрос',
    scanQr: 'Отсканируйте QR-код Kaspi — баланс пополнится автоматически.',
    confirmPaymentEllipsis: 'Подтвердите оплату в приложении Kaspi…',
    refreshingCode: 'Обновляем код…',
    qrValidFor: 'QR действителен ещё',
    openPayment: 'Открыть оплату',
    or: 'или',
    sendToPhone: 'Отправить запрос на телефон',
    customAmount: 'Своя сумма, ₸',
    creatingPayment: 'Создаём оплату…',
    sendingEllipsis: 'Отправляем…',
    sendRequest: 'Отправить запрос',
    recentOperations: 'Последние операции',
    loading: 'Загрузка…',
    noOperations: 'Пока нет операций',
    earnedViaKaspi: 'Заработано через Kaspi',
    paymentsDirect: 'Оплаты приходят напрямую на ваш Kaspi',
    tariff: 'Тариф',
    unlimited: 'безлимит',
    invoicesWord: 'счетов',
    markAllRead: 'Отметить всё прочитанным',
    noNotifications: 'Пока нет уведомлений',
    notificationSettings: 'Настройки уведомлений',
    support: 'Поддержка',
    about: 'О сервисе',
    noCompanyName: 'Без названия',
    profileAndSettings: 'Профиль и настройки',
    signOut: 'Выйти',
    segmentInvoices: 'Счета',
    segmentKaspiBot: 'Kaspi Bot',
    segmentAiAgent: 'ИИ-агент',
  },
  kk: {
    walletTitle: 'Әмиян',
    notificationsTitle: 'Хабарландырулар',
    helpTitle: 'Көмек',
    accountTitle: 'Аккаунт',
    timeJustNow: 'жаңа ғана',
    timeMinutesAgo: (n) => `${n} мин бұрын`,
    timeHoursAgo: (n) => `${n} сағ бұрын`,
    timeDaysAgo: (n) => `${n} күн бұрын`,
    pluralDays: () => 'күнге',
    bonusCredited: (a) => `${a} ₸ есептелді — қош келдіңіз!`,
    bonusAlready: 'Бонус бұрын алынған.',
    minAmount: (a) => `Ең аз сома ${a} ₸`,
    invalidPhone: 'Телефон нөмірін тексеріңіз',
    sendFailed: 'Сұрауды жіберу мүмкін болмады, қайталап көріңіз',
    createFailed: 'Төлемді құру мүмкін болмады, қайталап көріңіз',
    balance: 'Баланс',
    oneBalance: 'Барлық сервиске бір баланс — бір рет толтырасыз, қолданған жерде жұмсалады.',
    spend30: '30 күндегі шығыстар',
    topped30: (a) => `30 күнде толтырылды: ${a} ₸`,
    enoughFor: 'Қазіргі қарқынмен',
    atCurrentPace: 'жетеді',
    topUp: 'Толтыру',
    requestDeclined: 'Сұрау Kaspi қосымшасында қабылданбады',
    retry: 'Қайталау',
    requestSentTo: (p) => `Сұрау ${p} нөміріне жіберілді`,
    confirmInKaspi: 'Kaspi қосымшасында төлемді растаңыз — баланс автоматты түрде толады.',
    cancelRequest: 'Сұрауды болдырмау',
    scanQr: 'Kaspi QR-кодын сканерлеңіз — баланс автоматты түрде толады.',
    confirmPaymentEllipsis: 'Kaspi қосымшасында төлемді растаңыз…',
    refreshingCode: 'Кодты жаңартудамыз…',
    qrValidFor: 'QR жарамды, қалғаны',
    openPayment: 'Төлемді ашу',
    or: 'немесе',
    sendToPhone: 'Сұрауды телефонға жіберу',
    customAmount: 'Өз сомаңыз, ₸',
    creatingPayment: 'Төлем құрылуда…',
    sendingEllipsis: 'Жіберілуде…',
    sendRequest: 'Сұрауды жіберу',
    recentOperations: 'Соңғы операциялар',
    loading: 'Жүктелуде…',
    noOperations: 'Операциялар әзірге жоқ',
    earnedViaKaspi: 'Kaspi арқылы тапқаныңыз',
    paymentsDirect: 'Төлемдер тікелей Kaspi-ге түседі',
    tariff: 'Тариф',
    unlimited: 'шектеусіз',
    invoicesWord: 'шот',
    markAllRead: 'Барлығын оқылған деп белгілеу',
    noNotifications: 'Хабарландырулар әзірге жоқ',
    notificationSettings: 'Хабарландыру баптаулары',
    support: 'Қолдау',
    about: 'Сервис туралы',
    noCompanyName: 'Атауы жоқ',
    profileAndSettings: 'Профиль және баптаулар',
    signOut: 'Шығу',
    segmentInvoices: 'Шоттар',
    segmentKaspiBot: 'Kaspi Bot',
    segmentAiAgent: 'ЖИ-агент',
  },
  en: {
    walletTitle: 'Wallet',
    notificationsTitle: 'Notifications',
    helpTitle: 'Help',
    accountTitle: 'Account',
    timeJustNow: 'just now',
    timeMinutesAgo: (n) => `${n} min ago`,
    timeHoursAgo: (n) => `${n} h ago`,
    timeDaysAgo: (n) => `${n} d ago`,
    pluralDays: (n) => (n === 1 ? 'day' : 'days'),
    bonusCredited: (a) => `${a} ₸ credited — welcome!`,
    bonusAlready: 'The bonus has already been claimed.',
    minAmount: (a) => `Minimum ${a} ₸`,
    invalidPhone: 'Check the phone number',
    sendFailed: 'Could not send the request, please try again',
    createFailed: 'Could not create the payment, please try again',
    balance: 'Balance',
    oneBalance: 'One balance for all services — top up once, it is spent wherever you use it.',
    spend30: 'Spending over 30 days',
    topped30: (a) => `Topped up in 30 days: ${a} ₸`,
    enoughFor: 'Enough for',
    atCurrentPace: 'at the current pace',
    topUp: 'Top up',
    requestDeclined: 'The request was declined in the Kaspi app',
    retry: 'Try again',
    requestSentTo: (p) => `Request sent to ${p}`,
    confirmInKaspi: 'Confirm the payment in the Kaspi app — the balance will update automatically.',
    cancelRequest: 'Cancel request',
    scanQr: 'Scan the Kaspi QR code — the balance will update automatically.',
    confirmPaymentEllipsis: 'Confirm the payment in the Kaspi app…',
    refreshingCode: 'Refreshing the code…',
    qrValidFor: 'QR valid for another',
    openPayment: 'Open payment',
    or: 'or',
    sendToPhone: 'Send request to phone',
    customAmount: 'Custom amount, ₸',
    creatingPayment: 'Creating payment…',
    sendingEllipsis: 'Sending…',
    sendRequest: 'Send request',
    recentOperations: 'Recent operations',
    loading: 'Loading…',
    noOperations: 'No operations yet',
    earnedViaKaspi: 'Earned via Kaspi',
    paymentsDirect: 'Payments go straight to your Kaspi',
    tariff: 'Plan',
    unlimited: 'unlimited',
    invoicesWord: 'invoices',
    markAllRead: 'Mark all as read',
    noNotifications: 'No notifications yet',
    notificationSettings: 'Notification settings',
    support: 'Support',
    about: 'About the service',
    noCompanyName: 'Untitled',
    profileAndSettings: 'Profile and settings',
    signOut: 'Sign out',
    segmentInvoices: 'Invoices',
    segmentKaspiBot: 'Kaspi Bot',
    segmentAiAgent: 'AI Agent',
  },
}

// getActivePlan() отдаёт подпись тарифа по-русски («Бесплатный», «Про»,
// «Пробный (5 дн.)», «Бонус (3 дн.)»). Для плашки кошелька переводим её по
// шаблону, не трогая саму функцию тарифа (её читают и сервер, и тесты).
export function localizePlanLabel(label: string, lang: Lang): string {
  if (lang === 'ru') return label
  const kk = lang === 'kk'
  if (label === 'Бесплатный') return kk ? 'Тегін' : 'Free'
  if (label === 'Про') return kk ? 'Про' : 'Pro'
  if (label === 'Базовый') return kk ? 'Базалық' : 'Basic'
  const m = label.match(/^(Пробный|Бонус) \((\d+) дн\.\)$/)
  if (m) {
    const n = m[2]
    if (m[1] === 'Пробный') return kk ? `Сынақ (${n} күн)` : `Trial (${n} d)`
    return kk ? `Бонус (${n} күн)` : `Bonus (${n} d)`
  }
  return label
}
