export interface ProfileCoreContent {
  // shared
  loadingLabel: string
  errorPrefix: (message: string) => string
  savedAlert: string
  savingEllipsis: string

  // profile hub page (profile/page.tsx)
  fillProfileLabel: string
  noDataLabel: string
  // БИН — у юрлица (ТОО, АО…), ИИН — у ИП; если по названию не понять — «БИН/ИИН».
  binPrefixLabel: (bin: string) => string
  iinPrefixLabel: (iin: string) => string
  binOrIinPrefixLabel: (value: string) => string
  companyCardOpenLabel: string
  paidThisMonthLabel: string
  issuedInvoicesLabel: (count: number) => string
  statsDashboardLink: string
  noInvoicesYetHint: string
  createFirstInvoiceButton: string
  companySectionLabel: string
  requisitesMenuLabel: string
  banksMenuLabel: string
  signatureMenuLabel: string
  connectorsMenuLabel: string
  documentsSectionLabel: string
  clientsMenuLabel: string
  servicesMenuLabel: string
  templatesMenuLabel: string
  documentsMenuLabel: string
  contractsMenuLabel: string
  invoiceSettingsLabel: string
  acquiringMenuLabel: string
  accountSectionLabel: string
  securityMenuLabel: string
  notificationsMenuLabel: string
  helpSectionLabel: string
  supportMenuLabel: string
  referralMenuLabel: string
  adminSectionLabel: string
  adminPanelMenuLabel: string
  proTagLabel: string
  proFeaturesLabel: string
  basicFeaturesLabel: string
  freePlanTitle: string
  trialPlanTitle: (days: number) => string
  bonusPlanTitle: (days: number) => string
  freeUsageLabel: (used: number, limit: number) => string
  freeUsageLoadingLabel: (limit: number) => string
  trialFeaturesLabel: string
  adminAccessLabel: string
  adminPlanTitle: string
  proTariffLabel: string
  basicTariffLabel: string
  planActiveUntilLabel: (tariffName: string) => string
  bonusBasicLabel: string
  untilDateLabel: (date: string) => string
  trialUntilLabel: string
  themeSectionLabel: string
  themeSystemLabel: string
  themeLightLabel: string
  themeDarkLabel: string
  signOutButton: string
  deleteAccountButton: string
  deleteAccountModalTitle: string
  deleteAccountModalBody: string
  deleteAccountModalLossWarning: string
  deleteAccountModalConfirmLabel: (phrase: string) => string
  deleteAccountModalCancelButton: string
  deleteAccountModalConfirmButton: string
  deleteAccountModalDeletingLabel: string
  deleteAccountAdminRefusal: string

  // requisites page (requisites/page.tsx)
  requisitesHeaderLabel: string
  companyNameFieldLabel: string
  requisitesMissingAlert: (missing: string) => string
  profileNotSavedMessage: string
  returnToInvoiceHint: string
  binLookupCheckButton: string
  binLookupSearching: string
  binLookupNotFound: string
  binLookupFilled: (source: string) => string
  binLookupRegistrySays: string
  binLookupApplyButton: string
  binLookupMatches: string
  binLookupSourceEgov: string
  binLookupSourceKgd: string
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
  signatureFreePlanNote: string
  signatureFreePlanUpgradeLink: string

  // settings page (settings/page.tsx)
  invoiceNumberingSectionLabel: string
  prefixFieldLabel: string
  nextNumberFieldLabel: string
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
  nextNumberInvalidAlert: (section: string) => string
  nextNumberTooLowAlert: (section: string, minimum: number) => string
  issuedNumbersCheckFailedAlert: string
}

export const profileCoreDict: Record<'ru' | 'kk' | 'en', ProfileCoreContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    savedAlert: 'Сохранено!',
    requisitesMissingAlert: (missing: string) => `Без этого счёт выставить не получится — заполните: ${missing}`,
    profileNotSavedMessage: 'изменения не сохранились. Обновите страницу и попробуйте ещё раз',
    returnToInvoiceHint: 'Черновик счёта сохранён. После сохранения вернём вас к нему.',
    binLookupCheckButton: 'Проверить',
    binLookupSearching: 'Ищем в реестре…',
    binLookupNotFound: 'В реестре не нашли — заполните поля вручную.',
    binLookupFilled: (source: string) => `Заполнено из реестра. ${source}`,
    binLookupRegistrySays: 'В реестре записано так:',
    binLookupApplyButton: 'Подставить в поля',
    binLookupMatches: 'Ваши данные совпадают с реестром.',
    binLookupSourceEgov: 'Данные: реестр юридических лиц, портал открытых данных data.egov.kz',
    binLookupSourceKgd: 'Данные: сервис «Поиск налогоплательщика», КГД МФ РК',
    savingEllipsis: 'Сохраняем...',

    fillProfileLabel: 'Заполните профиль',
    noDataLabel: 'Нет данных',
    binPrefixLabel: (bin: string) => `БИН: ${bin}`,
    iinPrefixLabel: (iin: string) => `ИИН: ${iin}`,
    binOrIinPrefixLabel: (value: string) => `БИН/ИИН: ${value}`,
    companyCardOpenLabel: 'Открыть реквизиты',
    paidThisMonthLabel: 'Оплачено в этом месяце',
    issuedInvoicesLabel: (count: number) => `Счетов: ${count}`,
    statsDashboardLink: 'Вся статистика',
    noInvoicesYetHint: 'Здесь появятся оплаты, когда вы выставите первый счёт',
    createFirstInvoiceButton: 'Создать первый счёт',
    companySectionLabel: 'Компания',
    requisitesMenuLabel: 'Реквизиты',
    banksMenuLabel: 'Банковские счета',
    signatureMenuLabel: 'Подпись, печать и логотип',
    connectorsMenuLabel: 'Кнопки оплаты и контакты',
    documentsSectionLabel: 'Документы',
    clientsMenuLabel: 'Клиенты',
    servicesMenuLabel: 'Товары и услуги',
    templatesMenuLabel: 'Шаблоны счетов',
    documentsMenuLabel: 'КП, АВР и накладные',
    contractsMenuLabel: 'Договоры',
    invoiceSettingsLabel: 'Нумерация и НДС',
    acquiringMenuLabel: 'Сверка оплат',
    accountSectionLabel: 'Аккаунт',
    securityMenuLabel: 'Вход и Face ID',
    notificationsMenuLabel: 'Уведомления',
    helpSectionLabel: 'Помощь',
    supportMenuLabel: 'Помощь и о сервисе',
    referralMenuLabel: 'Пригласить друзей',
    adminSectionLabel: 'Админ',
    adminPanelMenuLabel: 'Админ панель',
    proTagLabel: 'Про',
    proFeaturesLabel: 'Безлимит · ЭЦП · Шаблоны',
    basicFeaturesLabel: '30 счетов в месяц',
    freePlanTitle: 'Бесплатный',
    trialPlanTitle: (days: number) => `Пробный (${days} дн.)`,
    bonusPlanTitle: (days: number) => `Бонус Базового (${days} дн.)`,
    freeUsageLabel: (used: number, limit: number) => `Использовано ${used} из ${limit} счетов в этом месяце`,
    freeUsageLoadingLabel: (limit: number) => `${limit} счёта в месяц`,
    trialFeaturesLabel: 'Уровень Базового: 10 счетов · без Kaspi Bot и AI-агента',
    adminAccessLabel: 'Доступ администратора — все функции открыты',
    adminPlanTitle: 'Администратор',
    proTariffLabel: 'Про тариф',
    basicTariffLabel: 'Базовый тариф',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} действует до`,
    bonusBasicLabel: 'Бонус Базового',
    untilDateLabel: (date: string) => `до ${date}`,
    trialUntilLabel: 'Пробный период до',
    themeSectionLabel: 'Тема',
    themeSystemLabel: 'Как в системе',
    themeLightLabel: 'Светлая',
    themeDarkLabel: 'Тёмная',
    signOutButton: 'Выйти из аккаунта',
    deleteAccountButton: 'Удалить аккаунт',
    deleteAccountModalTitle: 'Удалить аккаунт?',
    deleteAccountModalBody: 'Вы больше не сможете войти в этот аккаунт. Счета, клиенты и вся история сохранятся у нас на случай, если вы вернётесь, но доступ к ним будет закрыт.',
    deleteAccountModalLossWarning: 'Оплаченные дни тарифа и остаток на балансе кошелька пропадут вместе с аккаунтом — деньги за них не возвращаются.',
    deleteAccountModalConfirmLabel: (phrase: string) => `Введите ${phrase}, чтобы подтвердить`,
    deleteAccountModalCancelButton: 'Отмена',
    deleteAccountModalConfirmButton: 'Удалить аккаунт',
    deleteAccountModalDeletingLabel: 'Удаляем...',
    deleteAccountAdminRefusal: 'Аккаунт администратора удалить нельзя.',

    requisitesHeaderLabel: 'Реквизиты компании',
    companyNameFieldLabel: 'Название компании / ИП *',
    companyNamePlaceholder: 'ИП Смагулов А.К.',
    binIinFieldLabel: 'БИН / ИИН *',
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

    signatureHeaderLabel: 'Подпись, печать и логотип',
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
    tipLabel: 'Совет',
    tipBodyText: 'Сфотографируйте печать на белом листе — белый фон уберётся автоматически. Перемещайте рамку пальцем, используйте щипок для изменения размера.',
    cropModalTitle: 'Выберите область печати',
    cropModalSubtitle: 'Перемещайте рамку · Щипок для размера',
    cropSizeLabel: 'Размер рамки',
    saveStampButton: 'Сохранить печать',
    fileReadErrorAlert: 'Ошибка чтения файла',
    signatureFreePlanNote: 'Подпись и печать появятся в счёте с тарифа Базовый.',
    signatureFreePlanUpgradeLink: 'Перейти к тарифам',

    invoiceNumberingSectionLabel: 'Нумерация счетов',
    prefixFieldLabel: 'Префикс',
    nextNumberFieldLabel: 'След. номер',
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
    vat16InfoText: 'В счетах будет автоматически рассчитываться НДС 16%',
    vat0InfoText: 'В счетах будет показываться НДС 0% — для экспортных операций',
    noVatInfoText: 'В счетах будет написано "Без НДС"',
    saveSettingsButton: 'Сохранить настройки',
    nextNumberInvalidAlert: (section: string) => `${section}: в «След. номер» — только цифры, от 1 до 999999999.`,
    nextNumberTooLowAlert: (section: string, minimum: number) => `${section}: номер ${minimum - 1} с этим префиксом уже выдан. Следующий номер — не меньше ${minimum}, иначе у двух документов будет один номер.`,
    issuedNumbersCheckFailedAlert: 'Не удалось проверить уже выданные номера — настройки не сохранены. Попробуйте ещё раз.',
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    errorPrefix: (message: string) => `Қате: ${message}`,
    savedAlert: 'Сақталды!',
    requisitesMissingAlert: (missing: string) => `Онсыз шот шығару мүмкін емес — толтырыңыз: ${missing}`,
    profileNotSavedMessage: 'өзгерістер сақталмады. Бетті жаңартып, қайталап көріңіз',
    returnToInvoiceHint: 'Шот жобасы сақталды. Сақтағаннан кейін сізді оған қайтарамыз.',
    binLookupCheckButton: 'Тексеру',
    binLookupSearching: 'Тізілімнен іздеудеміз…',
    binLookupNotFound: 'Тізілімнен табылмады — өрістерді қолмен толтырыңыз.',
    binLookupFilled: (source: string) => `Тізілімнен толтырылды. ${source}`,
    binLookupRegistrySays: 'Тізілімде былай жазылған:',
    binLookupApplyButton: 'Өрістерге қою',
    binLookupMatches: 'Деректеріңіз тізіліммен сәйкес келеді.',
    binLookupSourceEgov: 'Дереккөз: заңды тұлғалар тізілімі, ашық деректер порталы data.egov.kz',
    binLookupSourceKgd: 'Дереккөз: «Салық төлеушіні іздеу» сервисі, ҚР ҚМ МКК',
    savingEllipsis: 'Сақталуда...',

    fillProfileLabel: 'Профильді толтырыңыз',
    noDataLabel: 'Деректер жоқ',
    binPrefixLabel: (bin: string) => `БСН: ${bin}`,
    iinPrefixLabel: (iin: string) => `ЖСН: ${iin}`,
    binOrIinPrefixLabel: (value: string) => `БСН/ЖСН: ${value}`,
    companyCardOpenLabel: 'Деректемелерді ашу',
    paidThisMonthLabel: 'Осы айда төленді',
    issuedInvoicesLabel: (count: number) => `Шоттар: ${count}`,
    statsDashboardLink: 'Барлық статистика',
    noInvoicesYetHint: 'Алғашқы шотты шығарғанда мұнда төлемдер көрсетіледі',
    createFirstInvoiceButton: 'Алғашқы шотты жасау',
    companySectionLabel: 'Компания',
    requisitesMenuLabel: 'Деректемелер',
    banksMenuLabel: 'Банк шоттары',
    signatureMenuLabel: 'Қолтаңба, мөр және логотип',
    connectorsMenuLabel: 'Төлем батырмалары мен байланыстар',
    documentsSectionLabel: 'Құжаттар',
    clientsMenuLabel: 'Клиенттер',
    servicesMenuLabel: 'Тауарлар мен қызметтер',
    templatesMenuLabel: 'Шот үлгілері',
    documentsMenuLabel: 'Ұсыныстар, актілер және жүкқұжаттар',
    contractsMenuLabel: 'Шарттар',
    invoiceSettingsLabel: 'Нөмірлеу және ҚҚС',
    acquiringMenuLabel: 'Төлемдерді салыстыру',
    accountSectionLabel: 'Аккаунт',
    securityMenuLabel: 'Кіру және Face ID',
    notificationsMenuLabel: 'Хабарландырулар',
    helpSectionLabel: 'Көмек',
    supportMenuLabel: 'Көмек және сервис туралы',
    referralMenuLabel: 'Достарды шақыру',
    adminSectionLabel: 'Әкімші',
    adminPanelMenuLabel: 'Әкімші панелі',
    proTagLabel: 'Про',
    proFeaturesLabel: 'Шексіз · ЭЦҚ · Үлгілер',
    basicFeaturesLabel: 'Айына 30 шот',
    freePlanTitle: 'Тегін',
    trialPlanTitle: (days: number) => `Сынақ (${days} күн)`,
    bonusPlanTitle: (days: number) => `Негізгі тариф бонусы (${days} күн)`,
    freeUsageLabel: (used: number, limit: number) => `Осы айда ${limit} шоттан ${used} пайдаланылды`,
    freeUsageLoadingLabel: (limit: number) => `Айына ${limit} шот`,
    trialFeaturesLabel: 'Негізгі деңгей: 10 шот · Kaspi Bot пен AI-агентсіз',
    adminAccessLabel: 'Әкімші қолжетімділігі — барлық мүмкіндіктер ашық',
    adminPlanTitle: 'Әкімші',
    proTariffLabel: 'Про тарифі',
    basicTariffLabel: 'Негізгі тариф',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} қолданылу мерзімі`,
    bonusBasicLabel: 'Негізгі тариф бонусы',
    untilDateLabel: (date: string) => `${date} дейін`,
    trialUntilLabel: 'Сынақ мерзімі',
    themeSectionLabel: 'Тақырып',
    themeSystemLabel: 'Жүйедегідей',
    themeLightLabel: 'Ашық',
    themeDarkLabel: 'Қараңғы',
    signOutButton: 'Аккаунттан шығу',
    deleteAccountButton: 'Аккаунтты жою',
    deleteAccountModalTitle: 'Аккаунтты жоясыз ба?',
    deleteAccountModalBody: 'Бұл аккаунтқа енді кіре алмайсыз. Шоттар, клиенттер және барлық тарих сақталады — қайта оралсаңыз пайдалы болады, бірақ қазір оларға қол жеткізу жабылады.',
    deleteAccountModalLossWarning: 'Тарифтің төленген күндері мен әмияндағы қалдық аккаунтпен бірге жойылады — олар үшін ақша қайтарылмайды.',
    deleteAccountModalConfirmLabel: (phrase: string) => `Растау үшін ${phrase} деп жазыңыз`,
    deleteAccountModalCancelButton: 'Бас тарту',
    deleteAccountModalConfirmButton: 'Аккаунтты жою',
    deleteAccountModalDeletingLabel: 'Жойылуда...',
    deleteAccountAdminRefusal: 'Әкімші аккаунтын жоюға болмайды.',

    requisitesHeaderLabel: 'Компания деректемелері',
    companyNameFieldLabel: 'Компания / ЖК атауы *',
    companyNamePlaceholder: 'ЖК Смағұлов А.Қ.',
    binIinFieldLabel: 'БСН / ЖСН *',
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

    signatureHeaderLabel: 'Қолтаңба, мөр және логотип',
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
    tipLabel: 'Кеңес',
    tipBodyText: 'Мөрді ақ парақта суретке түсіріңіз — ақ фон автоматты түрде алынады. Рамканы саусақпен жылжытыңыз, өлшемін өзгерту үшін қысу қимылын қолданыңыз.',
    cropModalTitle: 'Мөр аймағын таңдаңыз',
    cropModalSubtitle: 'Рамканы жылжытыңыз · Өлшемі үшін қысу қимылы',
    cropSizeLabel: 'Рамка өлшемі',
    saveStampButton: 'Мөрді сақтау',
    fileReadErrorAlert: 'Файлды оқу қатесі',
    signatureFreePlanNote: 'Қолтаңба мен мөр шотта Негізгі тарифтен бастап шығады.',
    signatureFreePlanUpgradeLink: 'Тарифтерге өту',

    invoiceNumberingSectionLabel: 'Шоттарды нөмірлеу',
    prefixFieldLabel: 'Префикс',
    nextNumberFieldLabel: 'Келесі нөмір',
    defaultDueDaysFieldLabel: 'Әдепкі төлем мерзімі (күн)',
    defaultNoteFieldLabel: 'Стандартты ескертпе',
    defaultNotePlaceholder: 'Төлем 3 жұмыс күні ішінде...',
    kpNumberingSectionLabel: 'КҰ нөмірлеу',
    avrNumberingSectionLabel: 'ОЖА нөмірлеу',
    nakladnayaNumberingSectionLabel: 'Жүкқұжаттарды нөмірлеу',
    vatStatusSectionLabel: 'ҚҚС мәртебесі',
    vatNoLabel: 'ҚҚС-сыз',
    vatNoDesc: 'ҚҚС төлеушісі емеспін',
    vat0Label: 'ҚҚС 0%',
    vat0Desc: 'ҚҚС төлеушісі, мөлшерлеме 0% (экспорт)',
    vat16Label: 'ҚҚС 16%',
    vat16Desc: 'Стандартты ҚҚС мөлшерлемесі',
    vat16InfoText: 'Шоттарда ҚҚС 16% автоматты түрде есептеледі',
    vat0InfoText: 'Шоттарда ҚҚС 0% көрсетіледі — экспорттық операциялар үшін',
    noVatInfoText: 'Шоттарда «ҚҚС-сыз» деп жазылады',
    saveSettingsButton: 'Баптауларды сақтау',
    nextNumberInvalidAlert: (section: string) => `${section}: «Келесі нөмір» өрісінде тек сандар, 1-ден 999999999-ға дейін.`,
    nextNumberTooLowAlert: (section: string, minimum: number) => `${section}: осы префикспен ${minimum - 1} нөмірі берілген. Келесі нөмір ${minimum}-ден кем болмауы керек, әйтпесе екі құжаттың нөмірі бірдей болады.`,
    issuedNumbersCheckFailedAlert: 'Берілген нөмірлерді тексеру мүмкін болмады — баптаулар сақталмады. Қайталап көріңіз.',
  },
  en: {
    loadingLabel: 'Loading...',
    errorPrefix: (message: string) => `Error: ${message}`,
    savedAlert: 'Saved!',
    requisitesMissingAlert: (missing: string) => `An invoice cannot be issued without this — please fill in: ${missing}`,
    profileNotSavedMessage: 'your changes were not saved. Refresh the page and try again',
    returnToInvoiceHint: 'Your invoice draft is kept. Once you save, we will take you back to it.',
    binLookupCheckButton: 'Check',
    binLookupSearching: 'Searching the register…',
    binLookupNotFound: 'Not found in the register — please fill the fields in by hand.',
    binLookupFilled: (source: string) => `Filled in from the register. ${source}`,
    binLookupRegistrySays: 'The register has it as:',
    binLookupApplyButton: 'Put into the fields',
    binLookupMatches: 'Your details match the register.',
    binLookupSourceEgov: 'Source: register of legal entities, open data portal data.egov.kz',
    binLookupSourceKgd: 'Source: "Taxpayer search" service, State Revenue Committee',
    savingEllipsis: 'Saving...',

    fillProfileLabel: 'Fill out your profile',
    noDataLabel: 'No data',
    binPrefixLabel: (bin: string) => `BIN: ${bin}`,
    iinPrefixLabel: (iin: string) => `IIN: ${iin}`,
    binOrIinPrefixLabel: (value: string) => `BIN/IIN: ${value}`,
    companyCardOpenLabel: 'Open company details',
    paidThisMonthLabel: 'Paid this month',
    issuedInvoicesLabel: (count: number) => `Invoices: ${count}`,
    statsDashboardLink: 'All statistics',
    noInvoicesYetHint: "Payments will show up here once you issue your first invoice",
    createFirstInvoiceButton: 'Create your first invoice',
    companySectionLabel: 'Company',
    requisitesMenuLabel: 'Company details',
    banksMenuLabel: 'Bank accounts',
    signatureMenuLabel: 'Signature, stamp and logo',
    connectorsMenuLabel: 'Payment buttons and contacts',
    documentsSectionLabel: 'Documents',
    clientsMenuLabel: 'Clients',
    servicesMenuLabel: 'Products and services',
    templatesMenuLabel: 'Invoice templates',
    documentsMenuLabel: 'Quotes, acts and waybills',
    contractsMenuLabel: 'Contracts',
    invoiceSettingsLabel: 'Numbering and VAT',
    acquiringMenuLabel: 'Payment matching',
    accountSectionLabel: 'Account',
    securityMenuLabel: 'Sign-in and Face ID',
    notificationsMenuLabel: 'Notifications',
    helpSectionLabel: 'Help',
    supportMenuLabel: 'Help and about',
    referralMenuLabel: 'Invite friends',
    adminSectionLabel: 'Admin',
    adminPanelMenuLabel: 'Admin panel',
    proTagLabel: 'Pro',
    proFeaturesLabel: 'Unlimited · e-signature · Templates',
    basicFeaturesLabel: '30 invoices per month',
    freePlanTitle: 'Free',
    trialPlanTitle: (days: number) => `Trial (${days} days)`,
    bonusPlanTitle: (days: number) => `Basic bonus (${days} days)`,
    freeUsageLabel: (used: number, limit: number) => `${used} of ${limit} invoices used this month`,
    freeUsageLoadingLabel: (limit: number) => `${limit} invoices per month`,
    trialFeaturesLabel: 'Basic level: 10 invoices · no Kaspi Bot or AI agent',
    adminAccessLabel: 'Administrator access — all features unlocked',
    adminPlanTitle: 'Administrator',
    proTariffLabel: 'Pro plan',
    basicTariffLabel: 'Basic plan',
    planActiveUntilLabel: (tariffName: string) => `${tariffName} valid until`,
    bonusBasicLabel: 'Basic bonus',
    untilDateLabel: (date: string) => `until ${date}`,
    trialUntilLabel: 'Trial period until',
    themeSectionLabel: 'Theme',
    themeSystemLabel: 'System',
    themeLightLabel: 'Light',
    themeDarkLabel: 'Dark',
    signOutButton: 'Sign out',
    deleteAccountButton: 'Delete account',
    deleteAccountModalTitle: 'Delete your account?',
    deleteAccountModalBody: "You won't be able to log into this account anymore. Invoices, clients and history stay on our side in case you come back, but access to them is closed.",
    deleteAccountModalLossWarning: 'Paid plan days and your wallet balance are lost together with the account — they are not refunded.',
    deleteAccountModalConfirmLabel: (phrase: string) => `Type ${phrase} to confirm`,
    deleteAccountModalCancelButton: 'Cancel',
    deleteAccountModalConfirmButton: 'Delete account',
    deleteAccountModalDeletingLabel: 'Deleting...',
    deleteAccountAdminRefusal: 'An administrator account cannot be deleted.',

    requisitesHeaderLabel: 'Company details',
    companyNameFieldLabel: 'Company / sole proprietor name *',
    companyNamePlaceholder: 'Sole Proprietor Smagulov A.K.',
    binIinFieldLabel: 'BIN / IIN *',
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

    signatureHeaderLabel: 'Signature, stamp and logo',
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
    tipLabel: 'Tip',
    tipBodyText: 'Photograph the stamp on a white sheet of paper — the white background will be removed automatically. Drag the frame with your finger, pinch to resize it.',
    cropModalTitle: 'Select the stamp area',
    cropModalSubtitle: 'Drag the frame · Pinch to resize',
    cropSizeLabel: 'Frame size',
    saveStampButton: 'Save stamp',
    fileReadErrorAlert: 'Error reading file',
    signatureFreePlanNote: 'The signature and stamp appear on invoices from the Basic plan.',
    signatureFreePlanUpgradeLink: 'View plans',

    invoiceNumberingSectionLabel: 'Invoice numbering',
    prefixFieldLabel: 'Prefix',
    nextNumberFieldLabel: 'Next number',
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
    vat16InfoText: 'VAT of 16% will be calculated automatically on invoices',
    vat0InfoText: 'Invoices will show 0% VAT — for export operations',
    noVatInfoText: 'Invoices will say "No VAT"',
    saveSettingsButton: 'Save settings',
    nextNumberInvalidAlert: (section: string) => `${section}: “Next number” takes digits only, from 1 to 999999999.`,
    nextNumberTooLowAlert: (section: string, minimum: number) => `${section}: number ${minimum - 1} with this prefix has already been issued. The next number must be at least ${minimum}, otherwise two documents would share a number.`,
    issuedNumbersCheckFailedAlert: 'Could not check the numbers already issued — settings were not saved. Please try again.',
  },
}
