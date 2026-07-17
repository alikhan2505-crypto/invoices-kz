export interface ProfileAccountsContent {
  // shared
  loadingLabel: string
  errorPrefix: (message: string) => string
  savingEllipsis: string
  savedAlert: string
  cancelButton: string
  saveButton: string

  // banks page (banks/page.tsx)
  banksHeaderLabel: string
  noAccountsLabel: string
  mainBadgeLabel: string
  bikPrefixLabel: (bik: string) => string
  currencyActiveLabel: (currency: string) => string
  setMainTitle: string
  editTitle: string
  deleteTitle: string
  editAccountHeading: string
  newAccountHeading: string
  bankNameFieldLabel: string
  bankNamePlaceholder: string
  iikFieldLabel: string
  iikPlaceholder: string
  bikFieldLabel: string
  bikPlaceholder: string
  kbeFieldLabel: string
  kbePlaceholder: string
  currencyFieldLabel: string
  addLabel: string
  addAccountButton: string
  fillBankNameAndIikAlert: string
  deleteAccountConfirm: string

  // security page (security/page.tsx)
  securityHeaderLabel: string
  electronicSignatureSectionLabel: string
  ecpConnectedLabel: string
  ecpValidUntilDummy: string
  ecpHolderDummy: string
  disconnectButton: string
  ecpNotConnectedLabel: string
  ecpNotConnectedHint: string
  connectEcpAlert: string
  connectEcpButton: string
  loginSecuritySectionLabel: string
  passkeyDefaultLabel: string
  passkeyAddedPrefix: (date: string) => string
  passkeyLastUsedPrefix: (date: string) => string
  passkeyAddButton: string
  passkeyNoneHint: string
  passkeyNotSupportedHint: string
  passkeyRemoveConfirm: string
  whatIsEcpTitle: string
  whatIsEcpBody: string

  // connectors page (connectors/page.tsx)
  connectorsHeaderLabel: string
  emptyLinkLabel: string
  genericLinkLabel: string
  paymentButtonsSectionLabel: string
  paymentButtonsHint: string
  kaspiPayLinkLabel: string
  kaspiPayPlaceholder: string
  kaspiPayHint: string
  halykPayLinkLabel: string
  halykPayPlaceholder: string
  websiteSectionLabel: string
  websitePlaceholder: string
  socialMediaSectionLabel: string
  socialMediaPlaceholder: string
  addSocialButton: string
  previewSectionLabel: string
  payViaKaspiLabel: string
  payViaHalykLabel: string
  websiteBadgeLabel: string
  saveConnectorsButton: string

  // notifications page (notifications/page.tsx)
  notificationsHeaderLabel: string
  savingLabel: string
  notificationsInfoTitle: string
  notificationsInfoBody: string
  channelsGroupTitle: string
  emailNotifyLabel: string
  emailNotifyDesc: string
  telegramNotifyLabel: string
  telegramNotifyDesc: string
  eventsGroupTitle: string
  clientViewedLabel: string
  clientViewedDesc: string
  paymentReminderLabel: string
  paymentReminderDesc: string
  overdueLabel: string
  overdueDesc: string
  weeklyReportLabel: string
  weeklyReportDesc: string
  connectTelegramTitle: string
  connectTelegramBodyBefore: string
  connectTelegramBodyAfter: string
  connectTelegramBotButton: string
}

export const profileAccountsDict: Record<'ru' | 'kk' | 'en', ProfileAccountsContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    savingEllipsis: 'Сохраняем...',
    savedAlert: 'Сохранено!',
    cancelButton: 'Отмена',
    saveButton: 'Сохранить',

    banksHeaderLabel: 'Банковские счета',
    noAccountsLabel: 'Нет банковских счетов',
    mainBadgeLabel: 'Основной',
    bikPrefixLabel: (bik: string) => `БИК: ${bik}`,
    currencyActiveLabel: (currency: string) => `${currency} · Активен`,
    setMainTitle: 'Сделать основным',
    editTitle: 'Редактировать',
    deleteTitle: 'Удалить',
    editAccountHeading: 'Редактировать счёт',
    newAccountHeading: 'Новый счёт',
    bankNameFieldLabel: 'Банк',
    bankNamePlaceholder: 'АО «Kaspi Bank»',
    iikFieldLabel: 'ИИК',
    iikPlaceholder: 'KZ...',
    bikFieldLabel: 'БИК',
    bikPlaceholder: 'CASPKZKA',
    kbeFieldLabel: 'КБе',
    kbePlaceholder: '19',
    currencyFieldLabel: 'Валюта',
    addLabel: 'Добавить',
    addAccountButton: '+ Добавить счёт',
    fillBankNameAndIikAlert: 'Заполните название банка и ИИК',
    deleteAccountConfirm: 'Удалить этот счёт?',

    securityHeaderLabel: 'ЭЦП и безопасность',
    electronicSignatureSectionLabel: 'Электронная подпись',
    ecpConnectedLabel: 'ЭЦП подключена',
    ecpValidUntilDummy: 'Годна до: 15.08.2026',
    ecpHolderDummy: 'ИП First Project',
    disconnectButton: 'Отключить',
    ecpNotConnectedLabel: 'ЭЦП не подключена',
    ecpNotConnectedHint: 'Подключите ЭЦП НУЦ РК для подписания счетов',
    connectEcpAlert: 'Интеграция с НУЦ РК — скоро!',
    connectEcpButton: 'Подключить ЭЦП',
    loginSecuritySectionLabel: 'Вход по Face ID / Touch ID',
    passkeyDefaultLabel: 'Устройство',
    passkeyAddedPrefix: (date: string) => `Добавлено: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Использовался: ${date}`,
    passkeyAddButton: '+ Добавить Face ID / Touch ID',
    passkeyNoneHint: 'Пока нет ни одного устройства — вход только по email',
    passkeyNotSupportedHint: 'Этот браузер не поддерживает вход по Face ID / Touch ID',
    passkeyRemoveConfirm: 'Убрать это устройство?',
    whatIsEcpTitle: 'Что такое ЭЦП?',
    whatIsEcpBody: 'Электронная цифровая подпись (ЭЦП) — это аналог рукописной подписи. Счета подписанные ЭЦП имеют юридическую силу в Казахстане. Получить ЭЦП можно бесплатно в НУЦ РК (pki.gov.kz).',

    connectorsHeaderLabel: 'Коннекторы',
    emptyLinkLabel: 'Ссылка',
    genericLinkLabel: 'Сайт',
    paymentButtonsSectionLabel: 'Кнопки оплаты',
    paymentButtonsHint: '💡 Клиент увидит кнопку оплаты прямо на странице счёта — не нужно искать реквизиты',
    kaspiPayLinkLabel: '🟡 Kaspi Pay ссылка',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Найдите в Kaspi.kz → Мой бизнес → Ссылка на оплату',
    halykPayLinkLabel: '🟢 Halyk Pay ссылка',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Сайт компании',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Социальные сети',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: '+ Добавить соцсеть',
    previewSectionLabel: 'Превью на счёте',
    payViaKaspiLabel: '🟡 Оплатить через Kaspi',
    payViaHalykLabel: '🟢 Оплатить через Halyk',
    websiteBadgeLabel: '🌐 Сайт',
    saveConnectorsButton: '💾 Сохранить',

    notificationsHeaderLabel: 'Уведомления',
    savingLabel: 'Сохранение...',
    notificationsInfoTitle: 'ℹ️ Как работают уведомления',
    notificationsInfoBody: 'Уведомления отправляются на email указанный при регистрации. Изменения сохраняются автоматически.',
    channelsGroupTitle: 'Каналы уведомлений',
    emailNotifyLabel: 'Email уведомления',
    emailNotifyDesc: 'Получать уведомления на почту',
    telegramNotifyLabel: 'Telegram уведомления',
    telegramNotifyDesc: 'Получать уведомления в Telegram бот',
    eventsGroupTitle: 'События',
    clientViewedLabel: 'Клиент просмотрел счёт',
    clientViewedDesc: 'Когда клиент открыл вашу ссылку на счёт',
    paymentReminderLabel: 'Напоминания об оплате',
    paymentReminderDesc: 'Автоматические напоминания клиентам',
    overdueLabel: 'Счёт просрочен',
    overdueDesc: 'Если счёт не оплачен более 7 дней',
    weeklyReportLabel: 'Еженедельный отчёт',
    weeklyReportDesc: 'Сводка по счетам каждый понедельник',
    connectTelegramTitle: 'Подключить Telegram',
    connectTelegramBodyBefore: 'Напишите боту команду',
    connectTelegramBodyAfter: 'чтобы получать уведомления',
    connectTelegramBotButton: '✈️ Открыть Telegram бот',
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    errorPrefix: (message: string) => `Қате: ${message}`,
    savingEllipsis: 'Сақталуда...',
    savedAlert: 'Сақталды!',
    cancelButton: 'Бас тарту',
    saveButton: 'Сақтау',

    banksHeaderLabel: 'Банк шоттары',
    noAccountsLabel: 'Банк шоттары жоқ',
    mainBadgeLabel: 'Негізгі',
    bikPrefixLabel: (bik: string) => `БСК: ${bik}`,
    currencyActiveLabel: (currency: string) => `${currency} · Белсенді`,
    setMainTitle: 'Негізгі ету',
    editTitle: 'Өзгерту',
    deleteTitle: 'Жою',
    editAccountHeading: 'Шотты өзгерту',
    newAccountHeading: 'Жаңа шот',
    bankNameFieldLabel: 'Банк',
    bankNamePlaceholder: 'АО «Kaspi Bank»',
    iikFieldLabel: 'ЖСК',
    iikPlaceholder: 'KZ...',
    bikFieldLabel: 'БСК',
    bikPlaceholder: 'CASPKZKA',
    kbeFieldLabel: 'КБЕ',
    kbePlaceholder: '19',
    currencyFieldLabel: 'Валюта',
    addLabel: 'Қосу',
    addAccountButton: '+ Шот қосу',
    fillBankNameAndIikAlert: 'Банк атауы мен ЖСК-ны толтырыңыз',
    deleteAccountConfirm: 'Бұл шотты жоясыз ба?',

    securityHeaderLabel: 'ЭЦҚ және қауіпсіздік',
    electronicSignatureSectionLabel: 'Электрондық қолтаңба',
    ecpConnectedLabel: 'ЭЦҚ қосылған',
    ecpValidUntilDummy: 'Жарамдылығы: 15.08.2026',
    ecpHolderDummy: 'ЖК First Project',
    disconnectButton: 'Ажырату',
    ecpNotConnectedLabel: 'ЭЦҚ қосылмаған',
    ecpNotConnectedHint: 'Шоттарға қол қою үшін ҚР ҰКО ЭЦҚ қосыңыз',
    connectEcpAlert: 'ҚР ҰКО интеграциясы — жақында!',
    connectEcpButton: 'ЭЦҚ қосу',
    loginSecuritySectionLabel: 'Face ID / Touch ID арқылы кіру',
    passkeyDefaultLabel: 'Құрылғы',
    passkeyAddedPrefix: (date: string) => `Қосылды: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Соңғы рет: ${date}`,
    passkeyAddButton: '+ Face ID / Touch ID қосу',
    passkeyNoneHint: 'Әзірге бірде-бір құрылғы жоқ — тек email арқылы кіру',
    passkeyNotSupportedHint: 'Бұл браузер Face ID / Touch ID арқылы кіруді қолдамайды',
    passkeyRemoveConfirm: 'Бұл құрылғыны алып тастау керек пе?',
    whatIsEcpTitle: 'ЭЦҚ дегеніміз не?',
    whatIsEcpBody: 'Электрондық цифрлық қолтаңба (ЭЦҚ) — қолжазба қолтаңбаның аналогы. ЭЦҚ қойылған шоттар Қазақстанда заңды күшке ие болады. ЭЦҚ-ны ҚР ҰКО-дан (pki.gov.kz) тегін алуға болады.',

    connectorsHeaderLabel: 'Коннекторлар',
    emptyLinkLabel: 'Сілтеме',
    genericLinkLabel: 'Сайт',
    paymentButtonsSectionLabel: 'Төлем түймелері',
    paymentButtonsHint: '💡 Клиент шот бетінен төлем түймесін бірден көреді — деректемелерді іздеудің қажеті жоқ',
    kaspiPayLinkLabel: '🟡 Kaspi Pay сілтемесі',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Kaspi.kz → Менің бизнесім → Төлем сілтемесі бөлімінен табыңыз',
    halykPayLinkLabel: '🟢 Halyk Pay сілтемесі',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Компания сайты',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Әлеуметтік желілер',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: '+ Әлеуметтік желі қосу',
    previewSectionLabel: 'Шоттағы алдын ала қарау',
    payViaKaspiLabel: '🟡 Kaspi арқылы төлеу',
    payViaHalykLabel: '🟢 Halyk арқылы төлеу',
    websiteBadgeLabel: '🌐 Сайт',
    saveConnectorsButton: '💾 Сақтау',

    notificationsHeaderLabel: 'Хабарландырулар',
    savingLabel: 'Сақталуда...',
    notificationsInfoTitle: 'ℹ️ Хабарландырулар қалай жұмыс істейді',
    notificationsInfoBody: 'Хабарландырулар тіркелу кезінде көрсетілген email-ге жіберіледі. Өзгерістер автоматты түрде сақталады.',
    channelsGroupTitle: 'Хабарландыру арналары',
    emailNotifyLabel: 'Email хабарландырулары',
    emailNotifyDesc: 'Хабарландыруларды поштаға алу',
    telegramNotifyLabel: 'Telegram хабарландырулары',
    telegramNotifyDesc: 'Хабарландыруларды Telegram бот арқылы алу',
    eventsGroupTitle: 'Оқиғалар',
    clientViewedLabel: 'Клиент шотты қарады',
    clientViewedDesc: 'Клиент сіздің шот сілтемеңізді ашқанда',
    paymentReminderLabel: 'Төлем туралы еске салулар',
    paymentReminderDesc: 'Клиенттерге автоматты еске салулар',
    overdueLabel: 'Шот мерзімі өтті',
    overdueDesc: 'Шот 7 күннен астам төленбесе',
    weeklyReportLabel: 'Апталық есеп',
    weeklyReportDesc: 'Дүйсенбі сайын шоттар бойынша қорытынды',
    connectTelegramTitle: 'Telegram қосу',
    connectTelegramBodyBefore: 'Хабарландыруларды алу үшін ботқа',
    connectTelegramBodyAfter: 'командасын жазыңыз',
    connectTelegramBotButton: '✈️ Telegram ботты ашу',
  },
  en: {
    loadingLabel: 'Loading...',
    errorPrefix: (message: string) => `Error: ${message}`,
    savingEllipsis: 'Saving...',
    savedAlert: 'Saved!',
    cancelButton: 'Cancel',
    saveButton: 'Save',

    banksHeaderLabel: 'Bank accounts',
    noAccountsLabel: 'No bank accounts',
    mainBadgeLabel: 'Main',
    bikPrefixLabel: (bik: string) => `BIK: ${bik}`,
    currencyActiveLabel: (currency: string) => `${currency} · Active`,
    setMainTitle: 'Set as main',
    editTitle: 'Edit',
    deleteTitle: 'Delete',
    editAccountHeading: 'Edit account',
    newAccountHeading: 'New account',
    bankNameFieldLabel: 'Bank',
    bankNamePlaceholder: 'JSC "Kaspi Bank"',
    iikFieldLabel: 'IIK',
    iikPlaceholder: 'KZ...',
    bikFieldLabel: 'BIK',
    bikPlaceholder: 'CASPKZKA',
    kbeFieldLabel: 'KBe',
    kbePlaceholder: '19',
    currencyFieldLabel: 'Currency',
    addLabel: 'Add',
    addAccountButton: '+ Add account',
    fillBankNameAndIikAlert: 'Fill in the bank name and IIK',
    deleteAccountConfirm: 'Delete this account?',

    securityHeaderLabel: 'Digital signature and security',
    electronicSignatureSectionLabel: 'Electronic signature',
    ecpConnectedLabel: 'Digital signature connected',
    ecpValidUntilDummy: 'Valid until: 15.08.2026',
    ecpHolderDummy: 'Sole Proprietor First Project',
    disconnectButton: 'Disconnect',
    ecpNotConnectedLabel: 'Digital signature not connected',
    ecpNotConnectedHint: 'Connect an NCA RK digital signature to sign invoices',
    connectEcpAlert: 'NCA RK integration — coming soon!',
    connectEcpButton: 'Connect digital signature',
    loginSecuritySectionLabel: 'Sign in with Face ID / Touch ID',
    passkeyDefaultLabel: 'Device',
    passkeyAddedPrefix: (date: string) => `Added: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Last used: ${date}`,
    passkeyAddButton: '+ Add Face ID / Touch ID',
    passkeyNoneHint: 'No devices added yet — signing in still requires email',
    passkeyNotSupportedHint: 'This browser doesn’t support Face ID / Touch ID sign-in',
    passkeyRemoveConfirm: 'Remove this device?',
    whatIsEcpTitle: 'What is a digital signature?',
    whatIsEcpBody: 'A digital signature is the electronic equivalent of a handwritten signature. Invoices signed with a digital signature have legal force in Kazakhstan. You can get a digital signature for free from NCA RK (pki.gov.kz).',

    connectorsHeaderLabel: 'Connectors',
    emptyLinkLabel: 'Link',
    genericLinkLabel: 'Website',
    paymentButtonsSectionLabel: 'Payment buttons',
    paymentButtonsHint: '💡 The client will see the payment button right on the invoice page — no need to look up your details',
    kaspiPayLinkLabel: '🟡 Kaspi Pay link',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Find it in Kaspi.kz → My Business → Payment link',
    halykPayLinkLabel: '🟢 Halyk Pay link',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Company website',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Social media',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: '+ Add social network',
    previewSectionLabel: 'Preview on invoice',
    payViaKaspiLabel: '🟡 Pay via Kaspi',
    payViaHalykLabel: '🟢 Pay via Halyk',
    websiteBadgeLabel: '🌐 Website',
    saveConnectorsButton: '💾 Save',

    notificationsHeaderLabel: 'Notifications',
    savingLabel: 'Saving...',
    notificationsInfoTitle: 'ℹ️ How notifications work',
    notificationsInfoBody: 'Notifications are sent to the email you registered with. Changes are saved automatically.',
    channelsGroupTitle: 'Notification channels',
    emailNotifyLabel: 'Email notifications',
    emailNotifyDesc: 'Receive notifications by email',
    telegramNotifyLabel: 'Telegram notifications',
    telegramNotifyDesc: 'Receive notifications via the Telegram bot',
    eventsGroupTitle: 'Events',
    clientViewedLabel: 'Client viewed the invoice',
    clientViewedDesc: 'When the client opens your invoice link',
    paymentReminderLabel: 'Payment reminders',
    paymentReminderDesc: 'Automatic reminders to clients',
    overdueLabel: 'Invoice overdue',
    overdueDesc: 'If the invoice remains unpaid for more than 7 days',
    weeklyReportLabel: 'Weekly report',
    weeklyReportDesc: 'Invoice summary every Monday',
    connectTelegramTitle: 'Connect Telegram',
    connectTelegramBodyBefore: 'Send the bot the command',
    connectTelegramBodyAfter: 'to receive notifications',
    connectTelegramBotButton: '✈️ Open Telegram bot',
  },
}
