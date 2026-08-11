export interface ProfileCoreContent {
  // shared
  loadingLabel: string
  errorPrefix: (message: string) => string
  savedAlert: string
  savingEllipsis: string

  // profile hub page (profile/page.tsx)
  fillProfileLabel: string
  noDataLabel: string
  binIinPrefixLabel: (bin: string) => string
  incomeThisMonthLabel: string
  totalInvoicesLabel: (count: number) => string
  chartIncomeLabel: string
  noInvoicesYetHint: string
  createFirstInvoiceButton: string
  companySectionLabel: string
  requisitesMenuLabel: string
  signatureMenuLabel: string
  banksMenuLabel: string
  securityMenuLabel: string
  acquiringMenuLabel: string
  kaspiPayMenuLabel: string
  connectorsMenuLabel: string
  directoriesSectionLabel: string
  clientsMenuLabel: string
  servicesMenuLabel: string
  templatesMenuLabel: string
  documentsMenuLabel: string
  contractsMenuLabel: string
  settingsSectionLabel: string
  invoiceSettingsLabel: string
  notificationsMenuLabel: string
  supportMenuLabel: string
  aboutMenuLabel: string
  referralMenuLabel: string
  adminPanelMenuLabel: string
  igRepliesMenuLabel: string
  subscriptionSectionLabel: string
  proFeaturesLabel: string
  basicFeaturesLabel: string
  freeFeaturesLabel: string
  trialFeaturesLabel: string
  proTariffLabel: string
  basicTariffLabel: string
  planActiveUntilLabel: (tariffName: string) => string
  referralBonusLabel: (days: number) => string
  untilDateLabel: (date: string) => string
  trialUntilLabel: string
  darkThemeLabel: string
  lightThemeLabel: string
  languageSectionLabel: string
  signOutButton: string

  // requisites page (requisites/page.tsx)
  requisitesHeaderLabel: string
  companyNameFieldLabel: string
  companyNamePlaceholder: string
  binIinFieldLabel: string
  binIinPlaceholder: string
  legalAddressFieldLabel: string
  legalAddressPlaceholder: string
  emailFieldLabel: string
  emailPlaceholder: string
  phoneFieldLabel: string
  phonePlaceholder: string
  directorNameFieldLabel: string
  accountantNameFieldLabel: string
  personNamePlaceholder: string
  saveChangesButton: string

  // signature page (signature/page.tsx)
  signatureHeaderLabel: string
  signatureSectionLabel: string
  signatureAltText: string
  redrawButton: string
  removeButton: string
  drawSignatureHint: string
  clearButton: string
  cancelButton: string
  saveButton: string
  noSignatureHint: string
  drawSignatureButton: string
  stampSectionLabel: string
  stampAltText: string
  replaceButton: string
  noStampHint: string
  uploadingLabel: string
  uploadPhotoButton: string
  logoSectionLabel: string
  logoAltText: string
  noLogoHint: string
  uploadLogoButton: string
  tipLabel: string
  tipBodyText: string
  cropModalTitle: string
  cropModalSubtitle: string
  cropSizeLabel: string
  saveStampButton: string
  fileReadErrorAlert: string

  // settings page (settings/page.tsx)
  invoiceNumberingSectionLabel: string
  prefixFieldLabel: string
  nextNumberFieldLabel: string
  defaultCurrencyFieldLabel: string
  defaultDueDaysFieldLabel: string
  defaultNoteFieldLabel: string
  defaultNotePlaceholder: string
  kpNumberingSectionLabel: string
  avrNumberingSectionLabel: string
  nakladnayaNumberingSectionLabel: string
  vatStatusSectionLabel: string
  vatNoLabel: string
  vatNoDesc: string
  vat0Label: string
  vat0Desc: string
  vat16Label: string
  vat16Desc: string
  vat16InfoText: string
  vat0InfoText: string
  noVatInfoText: string
  saveSettingsButton: string
}

export const profileCoreDict: Record<'ru' | 'kk' | 'en', ProfileCoreContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    savedAlert: 'Сохранено!',
    savingEllipsis: 'Сохраняем...',

    fillProfileLabel: 'Заполните профиль',
    noDataLabel: 'Нет данных',
    binIinPrefixLabel: (bin: string) => `ИИН: ${bin}`,
    incomeThisMonthLabel: 'Доход за месяц',
    totalInvoicesLabel: (count: number) => `Всего счетов: ${count}`,
    chartIncomeLabel: 'Доход',
    noInvoicesYetHint: 'Здесь появится доход, когда вы создадите первый счёт',
    createFirstInvoiceButton: 'Создать первый счёт',
    companySectionLabel: 'Компания',
    requisitesMenuLabel: 'Реквизиты',
    signatureMenuLabel: 'Брендинг',
    banksMenuLabel: 'Банковские счета',
    securityMenuLabel: 'ЭЦП и безопасность',
    acquiringMenuLabel: 'Эквайринг',
    kaspiPayMenuLabel: 'Приём Kaspi',
    connectorsMenuLabel: 'Коннекторы',
    directoriesSectionLabel: 'Справочники',
    clientsMenuLabel: 'Мои клиенты',
    servicesMenuLabel: 'Услуги и товары',
    templatesMenuLabel: 'Шаблоны счетов',
    documentsMenuLabel: 'Документы для налоговой',
    contractsMenuLabel: 'Договора',
    settingsSectionLabel: 'Настройки',
    invoiceSettingsLabel: 'Настройки счетов',
    notificationsMenuLabel: 'Уведомления',
    supportMenuLabel: 'Поддержка',
    aboutMenuLabel: 'О приложении',
    referralMenuLabel: 'Пригласить друзей',
    adminPanelMenuLabel: 'Админ панель',
    igRepliesMenuLabel: 'Автоответы Instagram',
    subscriptionSectionLabel: 'Подписка',
    proFeaturesLabel: 'Безлимит · ЭЦП · Шаблоны',
    basicFeaturesLabel: '30 счетов в месяц',
    freeFeaturesLabel: 'Перейдите на платный тариф',
    trialFeaturesLabel: 'Все функции Pro открыты',
    proTariffLabel: 'Про тариф',
    basicTariffLabel: 'Базовый тариф',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} действует до`,
    referralBonusLabel: (days: number) => `Реферальный бонус Basic (+${days} дн.)`,
    untilDateLabel: (date: string) => `до ${date}`,
    trialUntilLabel: 'Пробный период до',
    darkThemeLabel: 'Тёмная тема',
    lightThemeLabel: 'Светлая тема',
    languageSectionLabel: 'Язык / Тіл',
    signOutButton: 'Выйти из аккаунта',

    requisitesHeaderLabel: 'Реквизиты компании',
    companyNameFieldLabel: 'Название компании / ИП',
    companyNamePlaceholder: 'ИП Смагулов А.К.',
    binIinFieldLabel: 'БИН / ИИН',
    binIinPlaceholder: '920101401234',
    legalAddressFieldLabel: 'Юридический адрес',
    legalAddressPlaceholder: 'г. Алматы, ул. Абая 10, оф 25',
    emailFieldLabel: 'Email',
    emailPlaceholder: 'smagulov@example.kz',
    phoneFieldLabel: 'Телефон',
    phonePlaceholder: '+7 701 123 45 67',
    directorNameFieldLabel: 'Руководитель (ФИО)',
    accountantNameFieldLabel: 'Бухгалтер (ФИО)',
    personNamePlaceholder: 'Смагулов А.К.',
    saveChangesButton: 'Сохранить изменения',

    signatureHeaderLabel: 'Подпись и печать',
    signatureSectionLabel: 'Подпись руководителя',
    signatureAltText: 'Подпись',
    redrawButton: 'Перерисовать',
    removeButton: 'Удалить',
    drawSignatureHint: 'Нарисуйте подпись в поле ниже:',
    clearButton: 'Очистить',
    cancelButton: 'Отмена',
    saveButton: 'Сохранить',
    noSignatureHint: 'Подпись будет добавлена на PDF счёт',
    drawSignatureButton: 'Нарисовать подпись',
    stampSectionLabel: 'Печать организации',
    stampAltText: 'Печать',
    replaceButton: 'Заменить',
    noStampHint: 'Загрузите фото печати — белый фон уберётся автоматически',
    uploadingLabel: 'Загружаем...',
    uploadPhotoButton: 'Загрузить фото',
    logoSectionLabel: 'Логотип компании',
    logoAltText: 'Логотип',
    noLogoHint: 'Логотип появится над шапкой на всех документах',
    uploadLogoButton: 'Загрузить логотип',
    tipLabel: '💡 Совет',
    tipBodyText: 'Сфотографируйте печать на белом листе — белый фон уберётся автоматически. Перемещайте рамку пальцем, используйте щипок для изменения размера.',
    cropModalTitle: 'Выберите область печати',
    cropModalSubtitle: 'Перемещайте рамку · Щипок для размера',
    cropSizeLabel: 'Размер рамки',
    saveStampButton: '✅ Сохранить печать',
    fileReadErrorAlert: 'Ошибка чтения файла',

    invoiceNumberingSectionLabel: 'Нумерация счетов',
    prefixFieldLabel: 'Префикс',
    nextNumberFieldLabel: 'След. номер',
    defaultCurrencyFieldLabel: 'Валюта по умолчанию',
    defaultDueDaysFieldLabel: 'Срок оплаты по умолчанию (дней)',
    defaultNoteFieldLabel: 'Стандартное примечание',
    defaultNotePlaceholder: 'Оплата в течение 3 рабочих дней...',
    kpNumberingSectionLabel: 'Нумерация КП',
    avrNumberingSectionLabel: 'Нумерация АВР',
    nakladnayaNumberingSectionLabel: 'Нумерация Накладных',
    vatStatusSectionLabel: 'Статус НДС',
    vatNoLabel: 'Без НДС',
    vatNoDesc: 'Не являюсь плательщиком НДС',
    vat0Label: 'НДС 0%',
    vat0Desc: 'Плательщик НДС, ставка 0% (экспорт)',
    vat16Label: 'НДС 16%',
    vat16Desc: 'Стандартная ставка НДС',
    vat16InfoText: '💡 В счетах будет автоматически рассчитываться НДС 16%',
    vat0InfoText: '💡 В счетах будет показываться НДС 0% — для экспортных операций',
    noVatInfoText: '💡 В счетах будет написано "Без НДС"',
    saveSettingsButton: 'Сохранить настройки',
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    errorPrefix: (message: string) => `Қате: ${message}`,
    savedAlert: 'Сақталды!',
    savingEllipsis: 'Сақталуда...',

    fillProfileLabel: 'Профильді толтырыңыз',
    noDataLabel: 'Деректер жоқ',
    binIinPrefixLabel: (bin: string) => `ЖСН: ${bin}`,
    incomeThisMonthLabel: 'Айлық табыс',
    totalInvoicesLabel: (count: number) => `Барлық шоттар: ${count}`,
    chartIncomeLabel: 'Табыс',
    noInvoicesYetHint: 'Алғашқы шотты жасағанда мұнда табыс көрсетіледі',
    createFirstInvoiceButton: 'Алғашқы шотты жасау',
    companySectionLabel: 'Компания',
    requisitesMenuLabel: 'Деректемелер',
    signatureMenuLabel: 'Брендинг',
    banksMenuLabel: 'Банк шоттары',
    securityMenuLabel: 'ЭЦҚ және қауіпсіздік',
    acquiringMenuLabel: 'Эквайринг',
    kaspiPayMenuLabel: 'Kaspi қабылдау',
    connectorsMenuLabel: 'Коннекторлар',
    directoriesSectionLabel: 'Анықтамалар',
    clientsMenuLabel: 'Менің клиенттерім',
    servicesMenuLabel: 'Қызметтер мен тауарлар',
    templatesMenuLabel: 'Шот үлгілері',
    documentsMenuLabel: 'Салық құжаттары',
    contractsMenuLabel: 'Шарттар',
    settingsSectionLabel: 'Баптаулар',
    invoiceSettingsLabel: 'Шот баптаулары',
    notificationsMenuLabel: 'Хабарландырулар',
    supportMenuLabel: 'Қолдау қызметі',
    aboutMenuLabel: 'Қосымша туралы',
    referralMenuLabel: 'Достарды шақыру',
    adminPanelMenuLabel: 'Әкімші панелі',
    igRepliesMenuLabel: 'Instagram автожауаптары',
    subscriptionSectionLabel: 'Жазылым',
    proFeaturesLabel: 'Шексіз · ЭЦҚ · Үлгілер',
    basicFeaturesLabel: 'Айына 30 шот',
    freeFeaturesLabel: 'Ақылы тарифке өтіңіз',
    trialFeaturesLabel: 'Pro нұсқасының барлық мүмкіндіктері ашық',
    proTariffLabel: 'Про тарифі',
    basicTariffLabel: 'Негізгі тариф',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} қолданылу мерзімі`,
    referralBonusLabel: (days: number) => `Basic реферал бонусы (+${days} күн)`,
    untilDateLabel: (date: string) => `${date} дейін`,
    trialUntilLabel: 'Сынақ мерзімі',
    darkThemeLabel: 'Қараңғы тақырып',
    lightThemeLabel: 'Ашық тақырып',
    languageSectionLabel: 'Тіл',
    signOutButton: 'Аккаунттан шығу',

    requisitesHeaderLabel: 'Компания деректемелері',
    companyNameFieldLabel: 'Компания / ЖК атауы',
    companyNamePlaceholder: 'ЖК Смағұлов А.Қ.',
    binIinFieldLabel: 'БСН / ЖСН',
    binIinPlaceholder: '920101401234',
    legalAddressFieldLabel: 'Заңды мекенжай',
    legalAddressPlaceholder: 'Алматы қ., Абай көш. 10, кеңсе 25',
    emailFieldLabel: 'Email',
    emailPlaceholder: 'smagulov@example.kz',
    phoneFieldLabel: 'Телефон',
    phonePlaceholder: '+7 701 123 45 67',
    directorNameFieldLabel: 'Басшы (Аты-жөні)',
    accountantNameFieldLabel: 'Бухгалтер (Аты-жөні)',
    personNamePlaceholder: 'Смағұлов А.Қ.',
    saveChangesButton: 'Өзгерістерді сақтау',

    signatureHeaderLabel: 'Қолтаңба мен мөр',
    signatureSectionLabel: 'Басшының қолтаңбасы',
    signatureAltText: 'Қолтаңба',
    redrawButton: 'Қайта салу',
    removeButton: 'Жою',
    drawSignatureHint: 'Төмендегі өріске қолтаңбаңызды салыңыз:',
    clearButton: 'Тазалау',
    cancelButton: 'Бас тарту',
    saveButton: 'Сақтау',
    noSignatureHint: 'Қолтаңба PDF шотқа қосылады',
    drawSignatureButton: 'Қолтаңба салу',
    stampSectionLabel: 'Ұйым мөрі',
    stampAltText: 'Мөр',
    replaceButton: 'Ауыстыру',
    noStampHint: 'Мөрдің фотосын жүктеңіз — ақ фон автоматты түрде алынады',
    uploadingLabel: 'Жүктелуде...',
    uploadPhotoButton: 'Фото жүктеу',
    logoSectionLabel: 'Компания логотипі',
    logoAltText: 'Логотип',
    noLogoHint: 'Логотип барлық құжаттарда тақырыптың үстінде көрсетіледі',
    uploadLogoButton: 'Логотип жүктеу',
    tipLabel: '💡 Кеңес',
    tipBodyText: 'Мөрді ақ парақта суретке түсіріңіз — ақ фон автоматты түрде алынады. Рамканы саусақпен жылжытыңыз, өлшемін өзгерту үшін қысу қимылын қолданыңыз.',
    cropModalTitle: 'Мөр аймағын таңдаңыз',
    cropModalSubtitle: 'Рамканы жылжытыңыз · Өлшемі үшін қысу қимылы',
    cropSizeLabel: 'Рамка өлшемі',
    saveStampButton: '✅ Мөрді сақтау',
    fileReadErrorAlert: 'Файлды оқу қатесі',

    invoiceNumberingSectionLabel: 'Шоттарды нөмірлеу',
    prefixFieldLabel: 'Префикс',
    nextNumberFieldLabel: 'Келесі нөмір',
    defaultCurrencyFieldLabel: 'Әдепкі валюта',
    defaultDueDaysFieldLabel: 'Әдепкі төлем мерзімі (күн)',
    defaultNoteFieldLabel: 'Стандартты ескертпе',
    defaultNotePlaceholder: 'Төлем 3 жұмыс күні ішінде...',
    kpNumberingSectionLabel: 'КҰ нөмірлеу',
    avrNumberingSectionLabel: 'ОҚА нөмірлеу',
    nakladnayaNumberingSectionLabel: 'Жүкқұжаттарды нөмірлеу',
    vatStatusSectionLabel: 'ҚҚС мәртебесі',
    vatNoLabel: 'ҚҚС-сыз',
    vatNoDesc: 'ҚҚС төлеушісі емеспін',
    vat0Label: 'ҚҚС 0%',
    vat0Desc: 'ҚҚС төлеушісі, мөлшерлеме 0% (экспорт)',
    vat16Label: 'ҚҚС 16%',
    vat16Desc: 'Стандартты ҚҚС мөлшерлемесі',
    vat16InfoText: '💡 Шоттарда ҚҚС 16% автоматты түрде есептеледі',
    vat0InfoText: '💡 Шоттарда ҚҚС 0% көрсетіледі — экспорттық операциялар үшін',
    noVatInfoText: '💡 Шоттарда «ҚҚС-сыз» деп жазылады',
    saveSettingsButton: 'Баптауларды сақтау',
  },
  en: {
    loadingLabel: 'Loading...',
    errorPrefix: (message: string) => `Error: ${message}`,
    savedAlert: 'Saved!',
    savingEllipsis: 'Saving...',

    fillProfileLabel: 'Fill out your profile',
    noDataLabel: 'No data',
    binIinPrefixLabel: (bin: string) => `IIN: ${bin}`,
    incomeThisMonthLabel: 'Income this month',
    totalInvoicesLabel: (count: number) => `Total invoices: ${count}`,
    chartIncomeLabel: 'Income',
    noInvoicesYetHint: "You'll see income here once you create your first invoice",
    createFirstInvoiceButton: 'Create your first invoice',
    companySectionLabel: 'Company',
    requisitesMenuLabel: 'Company details',
    signatureMenuLabel: 'Branding',
    banksMenuLabel: 'Bank accounts',
    securityMenuLabel: 'Digital signature and security',
    acquiringMenuLabel: 'Acquiring',
    kaspiPayMenuLabel: 'Kaspi payments',
    connectorsMenuLabel: 'Connectors',
    directoriesSectionLabel: 'Directories',
    clientsMenuLabel: 'My clients',
    servicesMenuLabel: 'Services and products',
    templatesMenuLabel: 'Invoice templates',
    documentsMenuLabel: 'Tax documents',
    contractsMenuLabel: 'Contracts',
    settingsSectionLabel: 'Settings',
    invoiceSettingsLabel: 'Invoice settings',
    notificationsMenuLabel: 'Notifications',
    supportMenuLabel: 'Support',
    aboutMenuLabel: 'About the app',
    referralMenuLabel: 'Invite friends',
    adminPanelMenuLabel: 'Admin panel',
    igRepliesMenuLabel: 'Instagram auto-replies',
    subscriptionSectionLabel: 'Subscription',
    proFeaturesLabel: 'Unlimited · e-signature · Templates',
    basicFeaturesLabel: '30 invoices per month',
    freeFeaturesLabel: 'Upgrade to a paid plan',
    trialFeaturesLabel: 'All Pro features unlocked',
    proTariffLabel: 'Pro plan',
    basicTariffLabel: 'Basic plan',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} valid until`,
    referralBonusLabel: (days: number) => `Basic referral bonus (+${days} days)`,
    untilDateLabel: (date: string) => `until ${date}`,
    trialUntilLabel: 'Trial period until',
    darkThemeLabel: 'Dark theme',
    lightThemeLabel: 'Light theme',
    languageSectionLabel: 'Language',
    signOutButton: 'Sign out',

    requisitesHeaderLabel: 'Company details',
    companyNameFieldLabel: 'Company / sole proprietor name',
    companyNamePlaceholder: 'Sole Proprietor Smagulov A.K.',
    binIinFieldLabel: 'BIN / IIN',
    binIinPlaceholder: '920101401234',
    legalAddressFieldLabel: 'Legal address',
    legalAddressPlaceholder: 'Almaty, Abay St. 10, office 25',
    emailFieldLabel: 'Email',
    emailPlaceholder: 'smagulov@example.kz',
    phoneFieldLabel: 'Phone',
    phonePlaceholder: '+7 701 123 45 67',
    directorNameFieldLabel: 'Director (full name)',
    accountantNameFieldLabel: 'Accountant (full name)',
    personNamePlaceholder: 'Smagulov A.K.',
    saveChangesButton: 'Save changes',

    signatureHeaderLabel: 'Signature and stamp',
    signatureSectionLabel: "Director's signature",
    signatureAltText: 'Signature',
    redrawButton: 'Redraw',
    removeButton: 'Remove',
    drawSignatureHint: 'Draw your signature in the field below:',
    clearButton: 'Clear',
    cancelButton: 'Cancel',
    saveButton: 'Save',
    noSignatureHint: 'The signature will be added to the PDF invoice',
    drawSignatureButton: 'Draw signature',
    stampSectionLabel: 'Company stamp',
    stampAltText: 'Stamp',
    replaceButton: 'Replace',
    noStampHint: 'Upload a photo of the stamp — the white background will be removed automatically',
    uploadingLabel: 'Uploading...',
    uploadPhotoButton: 'Upload photo',
    logoSectionLabel: 'Company logo',
    logoAltText: 'Logo',
    noLogoHint: 'The logo will appear above the header on all documents',
    uploadLogoButton: 'Upload logo',
    tipLabel: '💡 Tip',
    tipBodyText: 'Photograph the stamp on a white sheet of paper — the white background will be removed automatically. Drag the frame with your finger, pinch to resize it.',
    cropModalTitle: 'Select the stamp area',
    cropModalSubtitle: 'Drag the frame · Pinch to resize',
    cropSizeLabel: 'Frame size',
    saveStampButton: '✅ Save stamp',
    fileReadErrorAlert: 'Error reading file',

    invoiceNumberingSectionLabel: 'Invoice numbering',
    prefixFieldLabel: 'Prefix',
    nextNumberFieldLabel: 'Next number',
    defaultCurrencyFieldLabel: 'Default currency',
    defaultDueDaysFieldLabel: 'Default payment due (days)',
    defaultNoteFieldLabel: 'Default note',
    defaultNotePlaceholder: 'Payment due within 3 business days...',
    kpNumberingSectionLabel: 'Quote numbering',
    avrNumberingSectionLabel: 'Completion act numbering',
    nakladnayaNumberingSectionLabel: 'Waybill numbering',
    vatStatusSectionLabel: 'VAT status',
    vatNoLabel: 'No VAT',
    vatNoDesc: 'Not a VAT payer',
    vat0Label: 'VAT 0%',
    vat0Desc: 'VAT payer, 0% rate (export)',
    vat16Label: 'VAT 16%',
    vat16Desc: 'Standard VAT rate',
    vat16InfoText: '💡 VAT of 16% will be calculated automatically on invoices',
    vat0InfoText: '💡 Invoices will show 0% VAT — for export operations',
    noVatInfoText: '💡 Invoices will say "No VAT"',
    saveSettingsButton: 'Save settings',
  },
}
