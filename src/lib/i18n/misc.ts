export interface MiscContent {
  // shared
  errorPrefix: (message: string) => string
  tryAgainDefault: string
  loadingLabel: string

  // not-found page
  notFoundTitle: string
  notFoundBody: string
  goHomeButton: string

  // promo/[code] page
  applyingPromoLabel: string

  // upgrade page
  pageTitle: string
  heroTitle: string
  heroSubtitle: string
  promoSectionLabel: string
  promoPlaceholder: string
  applyButtonLabel: string
  applyingButtonLabel: string
  enterPromoCodeError: string
  promoNotFoundError: string
  promoAlreadyUsedError: string
  promoPlanActiveError: string
  promoActivatedMessage: (planLabel: string, days: number) => string
  monthlyToggleLabel: string
  annualToggleLabel: string
  annualBadgeLabel: string
  freePlanName: string
  currentBadge: string
  freeFeatures: string[]
  basicPlanName: string
  popularBadge: string
  basicFeatures: string[]
  perMonthSuffix: string
  perYearSuffix: string
  proPlanName: string
  maxBadge: string
  proFeatures: string[]
  activeLabel: string
  higherPlanNotice: string
  renewButtonLabel: (period: 'monthly' | 'annual') => string
  connectButtonLabel: (amount: string, suffix: string) => string
  questionsText: string
  telegramLinkLabel: string
  creatingPaymentLabel: string
  pleaseWaitLabel: string
  paymentForLabel: (planName: string) => string
  redirectingKaspiLabel: string
  appNotOpenedHint: string
  openKaspiButton: string
  orLabel: string
  sendPhoneRequestButton: string
  scanQrTitle: string
  qrCodeAltText: string
  otherMethodHint: string
  openLinkDirectlyLabel: string
  toPayLabel: string
  checkingPaymentLabel: string
  awaitingConfirmationLabel: string
  checkManuallyButton: string
  paymentSuccessTitle: string
  planActivatedPrefixLabel: string
  planActivatedSuffixLabel: string
  subscriptionActiveLabel: (period: 'monthly' | 'annual') => string
  goToWorkButton: string
  phonePaymentTitle: string
  phoneInstructionText: string
  phoneNumberLabel: string
  sendKaspiRequestButton: (submitting: boolean) => string
  cancelButton: string
  enterFullPhoneAlert: string
  phoneRequestSentAlert: string
  phoneRequestPendingNote: string
  alreadyPendingAlert: string

  // admin page
  adminBrandLabel: string
  controlPanelLabel: string
  backToSiteButton: string
  usersStatLabel: string
  totalInvoicesStatLabel: string
  paidStatLabel: string
  newRequestsStatLabel: string
  paymentsTabLabel: string
  usersTabLabel: string
  promosTabLabel: string
  statsTabLabel: string
  noPaymentsYetLabel: string
  amountPrefixLabel: string
  submittedLabel: (date: string) => string
  activatedLabel: (date: string) => string
  activateButton: string
  rejectButton: string
  searchUsersPlaceholder: string
  userColumnLabel: string
  binColumnLabel: string
  planColumnLabel: string
  actionColumnLabel: string
  createPromoLabel: string
  codeFieldLabel: string
  planFieldLabel: string
  bonusDaysFieldLabel: string
  maxUsesFieldLabel: string
  creatingPromoLabel: string
  createPromoButton: string
  codeColumnLabel: string
  daysColumnLabel: string
  usedColumnLabel: string
  noPromoCodesLabel: string
  promoDaysLabel: (days: number) => string
  activeToggleLabel: string
  inactiveToggleLabel: string
  kaspiAdminStatsTitle: string
  kaspiAdminActiveConnectionsLabel: string
  kaspiAdminTotalRequestsLabel: string
  kaspiAdminPaidLabel: string
  kaspiAdminConversionLabel: string
  planDistributionLabel: string
  registrationsLabel: string
  totalPeriodLabel: (count: number) => string
  registrationsTooltipLabel: string
  revenueLabel: string
  realPayingUsersOnlyLabel: string
  basicUsersLabel: (count: number) => string
  proUsersLabel: (count: number) => string
  totalLabel: string
  kaspiPayNoteLabel: string
  confirmRejectPayment: string
  confirmDeletePromo: string
  enterCodeAlert: string
  paymentActivatedAlert: (plan: string, email: string) => string
  statusPendingLabel: string
  statusConfirmedLabel: string
  statusActivatedLabel: string
  statusRejectedLabel: string
}

export const miscDict: Record<'ru' | 'kk' | 'en', MiscContent> = {
  ru: {
    errorPrefix: (message) => `Ошибка: ${message}`,
    tryAgainDefault: 'Попробуйте снова',
    loadingLabel: 'Загрузка...',

    notFoundTitle: 'Страница не найдена',
    notFoundBody: 'Возможно ссылка устарела или страница была удалена',
    goHomeButton: 'На главную',

    applyingPromoLabel: 'Применяем промокод...',

    pageTitle: 'Тарифы',
    heroTitle: 'Выберите тариф',
    heroSubtitle: 'Оплата через Kaspi Pay · Активация моментально',
    promoSectionLabel: '🎟️ Есть промокод?',
    promoPlaceholder: 'Введите промокод',
    applyButtonLabel: 'Применить',
    applyingButtonLabel: '...',
    enterPromoCodeError: 'Введите промокод',
    promoNotFoundError: 'Промокод не найден или недействителен',
    promoAlreadyUsedError: 'Промокод уже использован',
    promoPlanActiveError: 'Промокод можно применить только без активного платного тарифа',
    promoActivatedMessage: (planLabel, days) => `🎉 Промокод активирован! ${planLabel} тариф на ${days} дней`,
    monthlyToggleLabel: 'Месяц',
    annualToggleLabel: 'Год',
    annualBadgeLabel: '2 месяца в подарок',
    freePlanName: 'Бесплатно',
    currentBadge: 'Текущий',
    freeFeatures: ['3 счета в месяц', 'PDF без подписи и печати', 'Публичная ссылка на счёт', 'История счетов'],
    basicPlanName: 'Базовый',
    popularBadge: 'Популярный',
    basicFeatures: ['30 счетов в месяц', 'PDF с подписью и печатью', 'Отправка на email и ссылкой', 'Справочник клиентов', 'Услуги и товары', 'Поддержка в Telegram'],
    perMonthSuffix: '/мес',
    perYearSuffix: '/год',
    proPlanName: 'Про',
    maxBadge: 'Максимум',
    proFeatures: ['Безлимитные счета', 'КП, АВР и накладные', 'Kaspi Bot — весь кабинет магазина (скоро)', 'AI-агент для клиентов (скоро)', 'WB Bot (скоро)', 'ЭЦП и договоры', 'Приоритетная поддержка'],
    activeLabel: '✓ Активен',
    higherPlanNotice: 'У вас более высокий тариф',
    renewButtonLabel: (period) => period === 'annual' ? 'Продлить на год' : 'Продлить на месяц',
    connectButtonLabel: (amount, suffix) => `Подключить за ${amount} ₸${suffix}`,
    questionsText: 'Вопросы?',
    telegramLinkLabel: 'Написать в Telegram',
    creatingPaymentLabel: 'Создаём платёж...',
    pleaseWaitLabel: 'Подождите несколько секунд',
    paymentForLabel: (planName) => `Оплата ${planName}`,
    redirectingKaspiLabel: 'Переходим в Kaspi...',
    appNotOpenedHint: 'Если приложение не открылось — нажмите кнопку ниже',
    openKaspiButton: '💳 Открыть Kaspi',
    orLabel: 'или',
    sendPhoneRequestButton: '📲 Отправить запрос на телефон',
    scanQrTitle: 'Отсканируйте QR в приложении Kaspi',
    qrCodeAltText: 'QR код',
    otherMethodHint: 'Или воспользуйтесь другим способом ниже',
    openLinkDirectlyLabel: 'Открыть ссылку напрямую',
    toPayLabel: 'К оплате',
    checkingPaymentLabel: 'Проверяем оплату...',
    awaitingConfirmationLabel: 'Ожидаем подтверждение...',
    checkManuallyButton: '🔄 Проверить вручную',
    paymentSuccessTitle: 'Оплата прошла!',
    planActivatedPrefixLabel: 'Тариф ',
    planActivatedSuffixLabel: ' активирован',
    subscriptionActiveLabel: (period) => period === 'annual' ? '✅ Подписка активна на 365 дней' : '✅ Подписка активна на 30 дней',
    goToWorkButton: 'Перейти к работе →',
    phonePaymentTitle: 'Оплата по номеру телефона',
    phoneInstructionText: 'Введите номер телефона привязанный к Kaspi. На него придёт уведомление с запросом на оплату.',
    phoneNumberLabel: 'Номер телефона Kaspi',
    sendKaspiRequestButton: (submitting) => submitting ? 'Отправляем...' : '📲 Отправить запрос в Kaspi',
    cancelButton: 'Отмена',
    enterFullPhoneAlert: 'Введите полный номер телефона',
    phoneRequestSentAlert: '✅ Запрос отправлен! Откройте Kaspi и подтвердите оплату.',
    phoneRequestPendingNote: 'Запрос отправлен на телефон — подтвердите оплату в приложении Kaspi',
    alreadyPendingAlert: 'У вас уже есть неподтверждённый платёж — проверьте Kaspi или дождитесь его истечения, прежде чем создавать новый.',

    adminBrandLabel: 'INVOICES.KZ Admin',
    controlPanelLabel: 'Панель управления',
    backToSiteButton: '← На сайт',
    usersStatLabel: 'Пользователей',
    totalInvoicesStatLabel: 'Всего счетов',
    paidStatLabel: 'Оплачено',
    newRequestsStatLabel: 'Новых заявок',
    paymentsTabLabel: '💳 Заявки на оплату',
    usersTabLabel: '👥 Пользователи',
    promosTabLabel: '🎟️ Промокоды',
    statsTabLabel: '📊 Статистика',
    noPaymentsYetLabel: 'Заявок пока нет',
    amountPrefixLabel: 'Сумма: ',
    submittedLabel: (date) => `Подана: ${date}`,
    activatedLabel: (date) => `Активирован: ${date}`,
    activateButton: '✅ Активировать',
    rejectButton: '✕ Отклонить',
    searchUsersPlaceholder: 'Поиск по email, компании, БИН...',
    userColumnLabel: 'Пользователь',
    binColumnLabel: 'БИН',
    planColumnLabel: 'Тариф',
    actionColumnLabel: 'Действие',
    createPromoLabel: 'Создать промокод',
    codeFieldLabel: 'Код',
    planFieldLabel: 'Тариф',
    bonusDaysFieldLabel: 'Дней бонуса',
    maxUsesFieldLabel: 'Макс. использований',
    creatingPromoLabel: 'Создаём...',
    createPromoButton: '+ Создать промокод',
    codeColumnLabel: 'Код',
    daysColumnLabel: 'Дней',
    usedColumnLabel: 'Использован',
    noPromoCodesLabel: 'Промокодов нет',
    promoDaysLabel: (days) => `${days} дн.`,
    activeToggleLabel: 'Актив',
    inactiveToggleLabel: 'Откл',
    kaspiAdminStatsTitle: 'Kaspi Pay Cashier — приём платежей',
    kaspiAdminActiveConnectionsLabel: 'Активных подключений',
    kaspiAdminTotalRequestsLabel: 'Всего запросов',
    kaspiAdminPaidLabel: 'Оплачено',
    kaspiAdminConversionLabel: 'Конверсия',
    planDistributionLabel: 'Распределение по тарифам',
    registrationsLabel: 'Регистрации за 14 дней',
    totalPeriodLabel: (count) => `Всего за период: ${count} пользователей`,
    registrationsTooltipLabel: 'Регистраций',
    revenueLabel: 'Доход от подписок',
    realPayingUsersOnlyLabel: 'Только реальные платящие пользователи',
    basicUsersLabel: (count) => `Basic (${count} польз.)`,
    proUsersLabel: (count) => `Pro (${count} польз.)`,
    totalLabel: 'Итого',
    kaspiPayNoteLabel: '* После подключения Kaspi Pay доход будет считаться автоматически.',
    confirmRejectPayment: 'Отклонить заявку?',
    confirmDeletePromo: 'Удалить промокод?',
    enterCodeAlert: 'Введите код',
    paymentActivatedAlert: (plan, email) => `✅ Тариф ${plan} активирован для ${email}`,
    statusPendingLabel: '⏳ Ожидает',
    statusConfirmedLabel: '💰 Оплата подтверждена',
    statusActivatedLabel: '✅ Активирован',
    statusRejectedLabel: '❌ Отклонён',
  },
  kk: {
    errorPrefix: (message) => `Қате: ${message}`,
    tryAgainDefault: 'Қайталап көріңіз',
    loadingLabel: 'Жүктелуде...',

    notFoundTitle: 'Бет табылмады',
    notFoundBody: 'Сілтеме ескірген немесе бет жойылған болуы мүмкін',
    goHomeButton: 'Басты бетке',

    applyingPromoLabel: 'Промокод қолданылуда...',

    pageTitle: 'Тарифтер',
    heroTitle: 'Тарифті таңдаңыз',
    heroSubtitle: 'Kaspi Pay арқылы төлем · Лезде белсендіру',
    promoSectionLabel: '🎟️ Промокодыңыз бар ма?',
    promoPlaceholder: 'Промокодты енгізіңіз',
    applyButtonLabel: 'Қолдану',
    applyingButtonLabel: '...',
    enterPromoCodeError: 'Промокодты енгізіңіз',
    promoNotFoundError: 'Промокод табылмады немесе жарамсыз',
    promoAlreadyUsedError: 'Промокод бұрын қолданылған',
    promoPlanActiveError: 'Промокодты тек ақылы тарифіңіз белсенді болмаған жағдайда ғана қолдануға болады',
    promoActivatedMessage: (planLabel, days) => `🎉 Промокод белсендірілді! ${planLabel} тарифі ${days} күнге`,
    monthlyToggleLabel: 'Ай',
    annualToggleLabel: 'Жыл',
    annualBadgeLabel: '2 ай сыйлыққа',
    freePlanName: 'Тегін',
    currentBadge: 'Ағымдағы',
    freeFeatures: ['Айына 3 шот', 'Қолтаңба мен мөрсіз PDF', 'Шотқа ортақ сілтеме', 'Шоттар тарихы'],
    basicPlanName: 'Базалық',
    popularBadge: 'Танымал',
    basicFeatures: ['Айына 30 шот', 'Қолтаңба мен мөрі бар PDF', 'Email және сілтеме арқылы жіберу', 'Клиенттер анықтамалығы', 'Қызметтер мен тауарлар', 'Telegram арқылы қолдау'],
    perMonthSuffix: '/ай',
    perYearSuffix: '/жыл',
    proPlanName: 'Про',
    maxBadge: 'Максимум',
    proFeatures: ['Шексіз шоттар', 'КҰ, ОҚА және жүкқұжаттар', 'Kaspi Bot — дүкен кабинетінің барлығы (жақында)', 'Клиенттерге арналған AI-агент (жақында)', 'WB Bot (жақында)', 'ЭЦҚ және шарттар', 'Басым қолдау'],
    activeLabel: '✓ Белсенді',
    higherPlanNotice: 'Сізде жоғарырақ тариф бар',
    renewButtonLabel: (period) => period === 'annual' ? 'Бір жылға ұзарту' : 'Бір айға ұзарту',
    connectButtonLabel: (amount, suffix) => `${amount} ₸${suffix} — қосылу`,
    questionsText: 'Сұрақтар бар ма?',
    telegramLinkLabel: 'Telegram-ға жазу',
    creatingPaymentLabel: 'Төлем құрылуда...',
    pleaseWaitLabel: 'Бірнеше секунд күтіңіз',
    paymentForLabel: (planName) => `${planName} төлемі`,
    redirectingKaspiLabel: 'Kaspi-ге өтудеміз...',
    appNotOpenedHint: 'Егер қосымша ашылмаса — төмендегі батырманы басыңыз',
    openKaspiButton: '💳 Kaspi ашу',
    orLabel: 'немесе',
    sendPhoneRequestButton: '📲 Телефонға сұрау жіберу',
    scanQrTitle: 'Kaspi қосымшасында QR-кодты сканерлеңіз',
    qrCodeAltText: 'QR код',
    otherMethodHint: 'Немесе төмендегі басқа әдісті пайдаланыңыз',
    openLinkDirectlyLabel: 'Сілтемені тікелей ашу',
    toPayLabel: 'Төлеуге',
    checkingPaymentLabel: 'Төлем тексерілуде...',
    awaitingConfirmationLabel: 'Растауды күтудеміз...',
    checkManuallyButton: '🔄 Қолмен тексеру',
    paymentSuccessTitle: 'Төлем өтті!',
    planActivatedPrefixLabel: '',
    planActivatedSuffixLabel: ' тарифі белсендірілді',
    subscriptionActiveLabel: (period) => period === 'annual' ? '✅ Жазылым 365 күнге (бір жылға) белсенді' : '✅ Жазылым 30 күнге белсенді',
    goToWorkButton: 'Жұмысқа өту →',
    phonePaymentTitle: 'Телефон нөмірі арқылы төлем',
    phoneInstructionText: 'Kaspi-ге байланысты телефон нөмірін енгізіңіз. Оған төлем сұрауы туралы хабарлама келеді.',
    phoneNumberLabel: 'Kaspi телефон нөмірі',
    sendKaspiRequestButton: (submitting) => submitting ? 'Жіберілуде...' : '📲 Kaspi-ге сұрау жіберу',
    cancelButton: 'Бас тарту',
    enterFullPhoneAlert: 'Толық телефон нөмірін енгізіңіз',
    phoneRequestSentAlert: '✅ Сұрау жіберілді! Kaspi-ді ашып, төлемді растаңыз.',
    phoneRequestPendingNote: 'Телефонға сұрау жіберілді — Kaspi қосымшасында төлемді растаңыз',
    alreadyPendingAlert: 'Сізде әлі расталмаған төлем бар — жаңасын жасамас бұрын Kaspi-ді тексеріңіз немесе оның мерзімі өткенше күтіңіз.',

    adminBrandLabel: 'INVOICES.KZ Admin',
    controlPanelLabel: 'Басқару панелі',
    backToSiteButton: '← Сайтқа',
    usersStatLabel: 'Пайдаланушылар',
    totalInvoicesStatLabel: 'Барлық шоттар',
    paidStatLabel: 'Төленген',
    newRequestsStatLabel: 'Жаңа өтінімдер',
    paymentsTabLabel: '💳 Төлем өтінімдері',
    usersTabLabel: '👥 Пайдаланушылар',
    promosTabLabel: '🎟️ Промокодтар',
    statsTabLabel: '📊 Статистика',
    noPaymentsYetLabel: 'Әзірге өтінімдер жоқ',
    amountPrefixLabel: 'Сома: ',
    submittedLabel: (date) => `Жіберілді: ${date}`,
    activatedLabel: (date) => `Белсендірілді: ${date}`,
    activateButton: '✅ Белсендіру',
    rejectButton: '✕ Қабылдамау',
    searchUsersPlaceholder: 'Email, компания, БСН бойынша іздеу...',
    userColumnLabel: 'Пайдаланушы',
    binColumnLabel: 'БСН',
    planColumnLabel: 'Тариф',
    actionColumnLabel: 'Әрекет',
    createPromoLabel: 'Промокод құру',
    codeFieldLabel: 'Код',
    planFieldLabel: 'Тариф',
    bonusDaysFieldLabel: 'Бонус күндері',
    maxUsesFieldLabel: 'Макс. қолдану саны',
    creatingPromoLabel: 'Құрылуда...',
    createPromoButton: '+ Промокод құру',
    codeColumnLabel: 'Код',
    daysColumnLabel: 'Күндер',
    usedColumnLabel: 'Қолданылған',
    noPromoCodesLabel: 'Промокодтар жоқ',
    promoDaysLabel: (days) => `${days} күн`,
    activeToggleLabel: 'Белсенді',
    inactiveToggleLabel: 'Өшірулі',
    kaspiAdminStatsTitle: 'Kaspi Pay Cashier — төлемдерді қабылдау',
    kaspiAdminActiveConnectionsLabel: 'Белсенді қосылымдар',
    kaspiAdminTotalRequestsLabel: 'Барлық сұраулар',
    kaspiAdminPaidLabel: 'Төленді',
    kaspiAdminConversionLabel: 'Конверсия',
    planDistributionLabel: 'Тарифтер бойынша бөлініс',
    registrationsLabel: '14 күндегі тіркелулер',
    totalPeriodLabel: (count) => `Кезең бойынша барлығы: ${count} пайдаланушы`,
    registrationsTooltipLabel: 'Тіркелулер',
    revenueLabel: 'Жазылымдардан түскен табыс',
    realPayingUsersOnlyLabel: 'Тек нақты төлеуші пайдаланушылар',
    basicUsersLabel: (count) => `Basic (${count} пайд.)`,
    proUsersLabel: (count) => `Pro (${count} пайд.)`,
    totalLabel: 'Барлығы',
    kaspiPayNoteLabel: '* Kaspi Pay қосылғаннан кейін табыс автоматты түрде есептеледі.',
    confirmRejectPayment: 'Өтінімді қабылдамайсыз ба?',
    confirmDeletePromo: 'Промокодты жоясыз ба?',
    enterCodeAlert: 'Кодты енгізіңіз',
    paymentActivatedAlert: (plan, email) => `✅ ${email} үшін ${plan} тарифі белсендірілді`,
    statusPendingLabel: '⏳ Күтілуде',
    statusConfirmedLabel: '💰 Төлем расталды',
    statusActivatedLabel: '✅ Белсендірілді',
    statusRejectedLabel: '❌ Қабылданбады',
  },
  en: {
    errorPrefix: (message) => `Error: ${message}`,
    tryAgainDefault: 'Please try again',
    loadingLabel: 'Loading...',

    notFoundTitle: 'Page not found',
    notFoundBody: 'This link may be outdated or the page may have been removed',
    goHomeButton: 'Go home',

    applyingPromoLabel: 'Applying promo code...',

    pageTitle: 'Pricing',
    heroTitle: 'Choose your plan',
    heroSubtitle: 'Payment via Kaspi Pay · Instant activation',
    promoSectionLabel: '🎟️ Have a promo code?',
    promoPlaceholder: 'Enter promo code',
    applyButtonLabel: 'Apply',
    applyingButtonLabel: '...',
    enterPromoCodeError: 'Enter a promo code',
    promoNotFoundError: 'Promo code not found or invalid',
    promoAlreadyUsedError: 'Promo code already used',
    promoPlanActiveError: "Promo codes can only be applied when you don't have an active paid plan",
    promoActivatedMessage: (planLabel, days) => `🎉 Promo code activated! ${planLabel} plan for ${days} days`,
    monthlyToggleLabel: 'Month',
    annualToggleLabel: 'Year',
    annualBadgeLabel: '2 months free',
    freePlanName: 'Free',
    currentBadge: 'Current',
    freeFeatures: ['3 invoices per month', 'PDF without signature or stamp', 'Public invoice link', 'Invoice history'],
    basicPlanName: 'Basic',
    popularBadge: 'Popular',
    basicFeatures: ['30 invoices per month', 'Signed & stamped PDF', 'Send via email and link', 'Client directory', 'Services & products', 'Telegram support'],
    perMonthSuffix: '/mo',
    perYearSuffix: '/yr',
    proPlanName: 'Pro',
    maxBadge: 'Maximum',
    proFeatures: ['Unlimited invoices', 'Quotes, acts & delivery notes', 'Kaspi Bot — full shop dashboard (coming soon)', 'AI agent for customers (coming soon)', 'WB Bot (coming soon)', 'e-signature & contracts', 'Priority support'],
    activeLabel: '✓ Active',
    higherPlanNotice: 'You already have a higher plan',
    renewButtonLabel: (period) => period === 'annual' ? 'Extend by a year' : 'Extend by a month',
    connectButtonLabel: (amount, suffix) => `Subscribe for ${amount} ₸${suffix}`,
    questionsText: 'Questions?',
    telegramLinkLabel: 'Message us on Telegram',
    creatingPaymentLabel: 'Creating payment...',
    pleaseWaitLabel: 'Please wait a few seconds',
    paymentForLabel: (planName) => `Payment for ${planName}`,
    redirectingKaspiLabel: 'Redirecting to Kaspi...',
    appNotOpenedHint: "If the app didn't open — tap the button below",
    openKaspiButton: '💳 Open Kaspi',
    orLabel: 'or',
    sendPhoneRequestButton: '📲 Send request to phone',
    scanQrTitle: 'Scan the QR code in the Kaspi app',
    qrCodeAltText: 'QR code',
    otherMethodHint: 'Or use another method below',
    openLinkDirectlyLabel: 'Open the link directly',
    toPayLabel: 'Amount due',
    checkingPaymentLabel: 'Checking payment...',
    awaitingConfirmationLabel: 'Awaiting confirmation...',
    checkManuallyButton: '🔄 Check manually',
    paymentSuccessTitle: 'Payment successful!',
    planActivatedPrefixLabel: 'The ',
    planActivatedSuffixLabel: ' plan has been activated',
    subscriptionActiveLabel: (period) => period === 'annual' ? '✅ Subscription active for 365 days' : '✅ Subscription active for 30 days',
    goToWorkButton: 'Get started →',
    phonePaymentTitle: 'Pay by phone number',
    phoneInstructionText: "Enter the phone number linked to Kaspi. You'll receive a payment request notification.",
    phoneNumberLabel: 'Kaspi phone number',
    sendKaspiRequestButton: (submitting) => submitting ? 'Sending...' : '📲 Send request to Kaspi',
    cancelButton: 'Cancel',
    enterFullPhoneAlert: 'Enter the full phone number',
    phoneRequestSentAlert: '✅ Request sent! Open Kaspi and confirm the payment.',
    phoneRequestPendingNote: 'Request sent to your phone — confirm the payment in the Kaspi app',
    alreadyPendingAlert: 'You already have an unconfirmed payment — check Kaspi or wait for it to expire before creating a new one.',

    adminBrandLabel: 'INVOICES.KZ Admin',
    controlPanelLabel: 'Control panel',
    backToSiteButton: '← Back to site',
    usersStatLabel: 'Users',
    totalInvoicesStatLabel: 'Total invoices',
    paidStatLabel: 'Paid',
    newRequestsStatLabel: 'New requests',
    paymentsTabLabel: '💳 Payment requests',
    usersTabLabel: '👥 Users',
    promosTabLabel: '🎟️ Promo codes',
    statsTabLabel: '📊 Statistics',
    noPaymentsYetLabel: 'No requests yet',
    amountPrefixLabel: 'Amount: ',
    submittedLabel: (date) => `Submitted: ${date}`,
    activatedLabel: (date) => `Activated: ${date}`,
    activateButton: '✅ Activate',
    rejectButton: '✕ Reject',
    searchUsersPlaceholder: 'Search by email, company, BIN...',
    userColumnLabel: 'User',
    binColumnLabel: 'BIN',
    planColumnLabel: 'Plan',
    actionColumnLabel: 'Action',
    createPromoLabel: 'Create promo code',
    codeFieldLabel: 'Code',
    planFieldLabel: 'Plan',
    bonusDaysFieldLabel: 'Bonus days',
    maxUsesFieldLabel: 'Max uses',
    creatingPromoLabel: 'Creating...',
    createPromoButton: '+ Create promo code',
    codeColumnLabel: 'Code',
    daysColumnLabel: 'Days',
    usedColumnLabel: 'Used',
    noPromoCodesLabel: 'No promo codes',
    promoDaysLabel: (days) => `${days} days`,
    activeToggleLabel: 'Active',
    inactiveToggleLabel: 'Off',
    kaspiAdminStatsTitle: 'Kaspi Pay Cashier — payment acceptance',
    kaspiAdminActiveConnectionsLabel: 'Active connections',
    kaspiAdminTotalRequestsLabel: 'Total requests',
    kaspiAdminPaidLabel: 'Paid',
    kaspiAdminConversionLabel: 'Conversion',
    planDistributionLabel: 'Plan distribution',
    registrationsLabel: 'Registrations over 14 days',
    totalPeriodLabel: (count) => `Total for period: ${count} users`,
    registrationsTooltipLabel: 'Registrations',
    revenueLabel: 'Subscription revenue',
    realPayingUsersOnlyLabel: 'Real paying users only',
    basicUsersLabel: (count) => `Basic (${count} users)`,
    proUsersLabel: (count) => `Pro (${count} users)`,
    totalLabel: 'Total',
    kaspiPayNoteLabel: '* Once Kaspi Pay is connected, revenue will be calculated automatically.',
    confirmRejectPayment: 'Reject this request?',
    confirmDeletePromo: 'Delete this promo code?',
    enterCodeAlert: 'Enter a code',
    paymentActivatedAlert: (plan, email) => `✅ ${plan} plan activated for ${email}`,
    statusPendingLabel: '⏳ Pending',
    statusConfirmedLabel: '💰 Payment confirmed',
    statusActivatedLabel: '✅ Activated',
    statusRejectedLabel: '❌ Rejected',
  },
}
