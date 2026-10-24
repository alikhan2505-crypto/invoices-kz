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
  selectBankOption: string
  otherBankOption: string
  bikFromRegistryHint: string
  kbeFieldLabel: string
  kbePlaceholder: string
  /** Подпись под полем КБе: что поставить и «проверьте по банку». */
  kbeHint: string
  kbeHintManual: string
  /** Добавляется к подписи, когда КБе подставлен по названию компании профиля. */
  kbeAutoNote: string
  currencyFieldLabel: string
  addLabel: string
  addAccountButton: string
  fillBankNameAndIikAlert: string
  fillBankBikAlert: string
  deleteAccountConfirm: string

  // security page (security/page.tsx)
  securityHeaderLabel: string
  loginSecuritySectionLabel: string
  passkeyDefaultLabel: string
  passkeyAddedPrefix: (date: string) => string
  passkeyLastUsedPrefix: (date: string) => string
  passkeyAddButton: string
  passkeyNoneHint: string
  passkeyNotSupportedHint: string
  passkeyRemoveConfirm: string

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

  // banks page (banks/page.tsx), when opened with ?next=/create
  returnToInvoiceHint: string
  returnToInvoiceButton: string
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
    selectBankOption: 'Выберите банк',
    otherBankOption: 'Другой банк — ввести вручную',
    bikFromRegistryHint: 'БИК подставлен автоматически',
    kbeFieldLabel: 'КБе',
    kbePlaceholder: '19',
    kbeHint: '19 — для ИП и физлиц, 17 — для ТОО. Проверьте по реквизитам вашего банка.',
    kbeHintManual: 'Для АО и других форм КБе зависит от сектора экономики — укажите его по реквизитам вашего банка.',
    kbeAutoNote: 'Подставлено автоматически.',
    currencyFieldLabel: 'Валюта',
    addLabel: 'Добавить',
    addAccountButton: 'Добавить счёт',
    fillBankNameAndIikAlert: 'Заполните название банка и ИИК',
    fillBankBikAlert: 'Заполните БИК банка',
    deleteAccountConfirm: 'Удалить этот счёт?',

    securityHeaderLabel: 'Вход и Face ID',
    loginSecuritySectionLabel: 'Вход по Face ID / Touch ID',
    passkeyDefaultLabel: 'Устройство',
    passkeyAddedPrefix: (date: string) => `Добавлено: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Использовался: ${date}`,
    passkeyAddButton: '+ Добавить Face ID / Touch ID',
    passkeyNoneHint: 'Пока нет ни одного устройства — вход только по email',
    passkeyNotSupportedHint: 'Этот браузер не поддерживает вход по Face ID / Touch ID',
    passkeyRemoveConfirm: 'Убрать это устройство?',

    connectorsHeaderLabel: 'Кнопки оплаты и контакты',
    emptyLinkLabel: 'Ссылка',
    genericLinkLabel: 'Сайт',
    paymentButtonsSectionLabel: 'Кнопки оплаты',
    paymentButtonsHint: 'Клиент увидит кнопку оплаты прямо на странице счёта — не нужно искать реквизиты',
    kaspiPayLinkLabel: 'Kaspi Pay ссылка',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Найдите в Kaspi.kz → Мой бизнес → Ссылка на оплату',
    halykPayLinkLabel: 'Halyk Pay ссылка',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Сайт компании',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Социальные сети',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: 'Добавить соцсеть',
    previewSectionLabel: 'Превью на счёте',
    payViaKaspiLabel: 'Оплатить через Kaspi',
    payViaHalykLabel: 'Оплатить через Halyk',
    websiteBadgeLabel: 'Сайт',
    saveConnectorsButton: 'Сохранить',

    returnToInvoiceHint: 'Черновик счёта сохранён. Добавьте банковский счёт — и вернём вас к нему.',
    returnToInvoiceButton: 'Вернуться к счёту',
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
    selectBankOption: 'Банкті таңдаңыз',
    otherBankOption: 'Басқа банк — қолмен енгізу',
    bikFromRegistryHint: 'БСК автоматты түрде қойылды',
    kbeFieldLabel: 'КБЕ',
    kbePlaceholder: '19',
    kbeHint: '19 — ЖК мен жеке тұлғалар үшін, 17 — ЖШС үшін. Өз банкіңіздің деректемелері бойынша тексеріңіз.',
    kbeHintManual: 'АҚ және өзге нысандар үшін КБе экономика секторына байланысты — оны банкіңіздің деректемелерінен көрсетіңіз.',
    kbeAutoNote: 'Автоматты түрде қойылды.',
    currencyFieldLabel: 'Валюта',
    addLabel: 'Қосу',
    addAccountButton: 'Шот қосу',
    fillBankNameAndIikAlert: 'Банк атауы мен ЖСК-ны толтырыңыз',
    fillBankBikAlert: 'Банктің БСК-сын толтырыңыз',
    deleteAccountConfirm: 'Бұл шотты жоясыз ба?',

    securityHeaderLabel: 'Кіру және Face ID',
    loginSecuritySectionLabel: 'Face ID / Touch ID арқылы кіру',
    passkeyDefaultLabel: 'Құрылғы',
    passkeyAddedPrefix: (date: string) => `Қосылды: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Соңғы рет: ${date}`,
    passkeyAddButton: '+ Face ID / Touch ID қосу',
    passkeyNoneHint: 'Әзірге бірде-бір құрылғы жоқ — тек email арқылы кіру',
    passkeyNotSupportedHint: 'Бұл браузер Face ID / Touch ID арқылы кіруді қолдамайды',
    passkeyRemoveConfirm: 'Бұл құрылғыны алып тастау керек пе?',

    connectorsHeaderLabel: 'Төлем батырмалары мен байланыстар',
    emptyLinkLabel: 'Сілтеме',
    genericLinkLabel: 'Сайт',
    paymentButtonsSectionLabel: 'Төлем түймелері',
    paymentButtonsHint: 'Клиент шот бетінен төлем түймесін бірден көреді — деректемелерді іздеудің қажеті жоқ',
    kaspiPayLinkLabel: 'Kaspi Pay сілтемесі',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Kaspi.kz → Менің бизнесім → Төлем сілтемесі бөлімінен табыңыз',
    halykPayLinkLabel: 'Halyk Pay сілтемесі',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Компания сайты',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Әлеуметтік желілер',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: 'Әлеуметтік желі қосу',
    previewSectionLabel: 'Шоттағы алдын ала қарау',
    payViaKaspiLabel: 'Kaspi арқылы төлеу',
    payViaHalykLabel: 'Halyk арқылы төлеу',
    websiteBadgeLabel: 'Сайт',
    saveConnectorsButton: 'Сақтау',

    returnToInvoiceHint: 'Шот жобасы сақталды. Банк шотын қосыңыз — сізді оған қайтарамыз.',
    returnToInvoiceButton: 'Шотқа оралу',
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
    selectBankOption: 'Choose your bank',
    otherBankOption: 'Another bank — enter manually',
    bikFromRegistryHint: 'BIK filled in automatically',
    kbeFieldLabel: 'KBe',
    kbePlaceholder: '19',
    kbeHint: '19 is for sole proprietors (IP) and individuals, 17 is for LLPs (TOO). Check it against your bank’s details.',
    kbeHintManual: 'For joint-stock companies and other forms the code depends on the economic sector — enter it from your bank’s details.',
    kbeAutoNote: 'Filled in automatically.',
    currencyFieldLabel: 'Currency',
    addLabel: 'Add',
    addAccountButton: 'Add account',
    fillBankNameAndIikAlert: 'Fill in the bank name and IIK',
    fillBankBikAlert: "Fill in the bank's BIK",
    deleteAccountConfirm: 'Delete this account?',

    securityHeaderLabel: 'Sign-in and Face ID',
    loginSecuritySectionLabel: 'Sign in with Face ID / Touch ID',
    passkeyDefaultLabel: 'Device',
    passkeyAddedPrefix: (date: string) => `Added: ${date}`,
    passkeyLastUsedPrefix: (date: string) => `Last used: ${date}`,
    passkeyAddButton: '+ Add Face ID / Touch ID',
    passkeyNoneHint: 'No devices added yet — signing in still requires email',
    passkeyNotSupportedHint: 'This browser doesn’t support Face ID / Touch ID sign-in',
    passkeyRemoveConfirm: 'Remove this device?',

    connectorsHeaderLabel: 'Payment buttons and contacts',
    emptyLinkLabel: 'Link',
    genericLinkLabel: 'Website',
    paymentButtonsSectionLabel: 'Payment buttons',
    paymentButtonsHint: 'The client will see the payment button right on the invoice page — no need to look up your details',
    kaspiPayLinkLabel: 'Kaspi Pay link',
    kaspiPayPlaceholder: 'https://kaspi.kz/pay/...',
    kaspiPayHint: 'Find it in Kaspi.kz → My Business → Payment link',
    halykPayLinkLabel: 'Halyk Pay link',
    halykPayPlaceholder: 'https://halykbank.kz/pay/...',
    websiteSectionLabel: 'Company website',
    websitePlaceholder: 'https://yoursite.kz',
    socialMediaSectionLabel: 'Social media',
    socialMediaPlaceholder: 'https://instagram.com/yourpage',
    addSocialButton: 'Add social network',
    previewSectionLabel: 'Preview on invoice',
    payViaKaspiLabel: 'Pay via Kaspi',
    payViaHalykLabel: 'Pay via Halyk',
    websiteBadgeLabel: 'Website',
    saveConnectorsButton: 'Save',

    returnToInvoiceHint: 'Your invoice draft is kept. Add a bank account and we will take you back to it.',
    returnToInvoiceButton: 'Back to the invoice',
  },
}
