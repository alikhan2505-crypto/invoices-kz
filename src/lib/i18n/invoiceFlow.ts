interface KnpOption { value: string; label: string }
interface StatusChangeOption { status: string; label: string }

export interface InvoiceFlowContent {
  // shared
  errorPrefix: (message: string) => string
  genericErrorLabel: string
  loadingLabel: string
  cancelButton: string
  clientDataHeader: string
  companyNameLabel: string
  companyNamePlaceholder: string
  binIinLabel: string
  binIinPlaceholder: string
  emailLabel: string
  emailPlaceholder: string
  buyerPhoneLabel: string
  addressPlaceholder: string
  contractDateLabel: string
  contractDatePlaceholder: string
  dueDateLabel: string
  servicesHeader: string
  addButton: string
  serviceToggleLabel: string
  productToggleLabel: string
  serviceNamePlaceholder: string
  codeLabel: string
  codePlaceholder: string
  qtyLabel: string
  qtyPlaceholder: string
  unitLabel: string
  priceLabel: string
  pricePlaceholder: string
  perLineTotal: (amount: string) => string
  amountWithoutVatLabel: string
  vat16Label: string
  vat0Label: string
  vat0Amount: string
  noVatLabel: string
  noVatDash: string
  amountDueLabel: string
  noteHeader: string
  enterClientNameAlert: string
  previewFromLabel: string
  previewToLabel: string

  // dashboard
  newInvoiceTitle: string
  newInvoiceSubtitle: string
  statsInvoicesLabel: string
  statsPaidLabel: string
  statsIncomeLabel: string
  freePlanTitle: string
  freePlanSubtitle: string
  ratesButton: string
  trialPlanTitle: string
  trialDaysLeftLabel: (days: number, invoicesLeft: number) => string
  buyButton: string
  expiringPlanTitle: string
  daysLeftLabel: (days: number) => string
  extendButton: string
  onboardingTitle: string
  onboardingStep1Title: string
  onboardingStep1Desc: string
  onboardingStep1Btn: string
  onboardingStep2Title: string
  onboardingStep2Desc: string
  onboardingStep2Btn: string
  onboardingStep3Title: string
  onboardingStep3Desc: string
  onboardingStep3Btn: string
  onboardingStep4Title: string
  onboardingStep4Desc: string
  quickClientPickLabel: string
  binLabel: (bin: string) => string
  knpLabel: string
  knpOptions: KnpOption[]
  addressLabelDashboard: string
  buyerPhonePlaceholderDashboard: string
  contractNumberLabelDashboard: string
  contractNumberPlaceholderDashboard: string
  fromDirectoryButton: string
  servicePickerTitle: string
  fillCompanyDetailsFirstAlert: string
  draftKeptNote: string
  signInAlert: string
  bankDetailsNeededConfirm: string
  enterClientBinAlert: string
  addAtLeastOneServiceAlert: string
  specifyPriceForAllServicesAlert: string
  recentInvoiceConfirm: string
  planLimitFreeMessage: (limit: number) => string
  planLimitTrialMessage: (limit: number) => string
  planLimitBasicMessage: (limit: number) => string
  creatingButton: string
  createButton: string
  saveClientModalTitle: string
  saveClientPrompt: (name: string) => string
  skipButton: string
  saveButtonLabel: string
  bankPickerTitle: string
  mainBankBadge: string
  addBankAccountLabel: string
  vatHintAriaLabel: string
  vatHintText: string
  vatHintLink: string
  kaspiCashierHintText: string
  kaspiCashierHintLink: string
  noContractLabel: string
  noContractValue: string

  // invoice detail
  statusLabelPaid: string
  statusLabelSent: string
  statusLabelOverdue: string
  statusLabelDraft: string
  statusLabelViewed: string
  statusChangeOptions: StatusChangeOption[]
  invoiceNotFoundLabel: string
  invoiceHeaderTitle: (number: string) => string
  noClientLabel: string
  whatsappButtonLabel: string
  linkButtonLabel: string
  pdfButtonLabel: string
  emailUpgradeMessage: string
  servicesAndGoodsHeader: string
  serviceTypeBadge: (type: string) => string
  totalLabel: string
  bankDetailsHeader: string
  bankNameFieldLabel: string
  iikFieldLabel: string
  bikFieldLabel: string
  kbeFieldLabel: string
  historyHeader: string
  noEntriesLabel: string
  changeStatusHeader: string
  editButtonLabel: string
  duplicateButtonLabel: string
  repeatInvoiceButtonLabel: string
  kpDocLabel: string
  avrDocLabel: string
  nakladnayaDocLabel: string
  proLockedLabel: string
  proBadge: string
  basicBadge: string
  unavailableLabel: string
  noServicesInInvoiceLabel: string
  noProductsInInvoiceLabel: string
  savedToTaxLabel: (count: number) => string
  kpValidUntilPrompt: string
  avrContractNumberPrompt: string
  avrContractDatePrompt: string
  templateNamePrompt: string
  templateSavedAlert: string
  saveAsTemplateLabel: string
  remindPaymentButtonLabel: string
  recurringEnabledLabel: string
  recurringMonthlyLabel: string
  recurringUntilPrompt: string
  recurringDisabledAlert: string
  invalidDateFormatAlert: string
  clientNoEmailAlert: string
  recurringEnabledUntilMessage: (until: string) => string
  cancelInvoiceButtonLabel: string
  cancelInvoiceConfirm: string
  upgradeNeededTitle: string
  goToPlansButton: string
  sendInvoiceEmailModalTitle: string
  changeEmailIfNeededSubtitle: string
  recipientEmailLabel: string
  sendingButtonLabel: string
  sendButtonLabel: string
  documentFormatModalTitle: string
  chooseDownloadVariantSubtitle: string
  withSignatureButtonLabel: string
  basicPlusBadge: string
  withoutSignatureButtonLabel: string
  pdfSignUpgradeMessage: string
  ecpSectionLabel: string
  ecpProUpgradeMessage: string
  linkCopiedMessage: (link: string) => string
  tokenNotFoundAlert: string
  enterEmailAddressAlert: string
  emailSentMessage: (email: string) => string
  whatsappShareMessage: (invoiceNumber: string, amount: string, link: string) => string
  reminderMessage: (clientName: string, invoiceNumber: string, amount: string, link: string) => string

  // invoice edit
  editInvoiceHeaderTitle: string
  addressLabelEdit: string
  buyerPhonePlaceholderEdit: string
  contractHeader: string
  contractNumberLabelEdit: string
  contractNumberPlaceholderEdit: string
  notePlaceholder: string
  paymentDueNote: (date: string) => string
  enterBinIinAlert: string
  fillAllServicesAlert: string
  savingButtonLabel: string
  saveChangesButton: string
}

export const invoiceFlowDict: Record<'ru' | 'kk' | 'en', InvoiceFlowContent> = {
  ru: {
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    genericErrorLabel: 'Ошибка',
    loadingLabel: 'Загрузка...',
    cancelButton: 'Отмена',
    clientDataHeader: 'Данные клиента',
    companyNameLabel: 'Название компании / ИП *',
    companyNamePlaceholder: 'ТОО «Пример»',
    binIinLabel: 'БИН/ИИН *',
    binIinPlaceholder: '123456789012',
    emailLabel: 'Email',
    emailPlaceholder: 'client@mail.kz',
    buyerPhoneLabel: 'Телефон покупателя',
    addressPlaceholder: 'г. Алматы, ул. Абая 1',
    contractDateLabel: 'Дата договора',
    contractDatePlaceholder: '01.01.2026',
    dueDateLabel: 'Срок оплаты',
    servicesHeader: 'Услуги / Товары',
    addButton: '+ Добавить',
    serviceToggleLabel: '📋 Услуга',
    productToggleLabel: '📦 Товар',
    serviceNamePlaceholder: 'Название услуги / товара',
    codeLabel: 'Код',
    codePlaceholder: '001',
    qtyLabel: 'Кол-во',
    qtyPlaceholder: '0',
    unitLabel: 'Ед.',
    priceLabel: 'Цена ₸',
    pricePlaceholder: '0',
    perLineTotal: (amount: string) => `Итого: ${amount} ₸`,
    amountWithoutVatLabel: 'Сумма без НДС',
    vat16Label: 'НДС 16%',
    vat0Label: 'НДС 0%',
    vat0Amount: '0 ₸',
    noVatLabel: 'Без НДС',
    noVatDash: '—',
    amountDueLabel: 'К оплате',
    noteHeader: 'Примечание',
    enterClientNameAlert: 'Введите название клиента',
    previewFromLabel: 'От кого',
    previewToLabel: 'Кому',

    newInvoiceTitle: 'Новый счёт',
    newInvoiceSubtitle: 'Создайте счёт за 1 минуту',
    statsInvoicesLabel: 'Счетов',
    statsPaidLabel: 'Оплачено',
    statsIncomeLabel: 'Доход ₸',
    freePlanTitle: 'Бесплатный тариф',
    freePlanSubtitle: 'Перейдите на платный для безлимитных счетов',
    ratesButton: 'Тарифы',
    trialPlanTitle: '🎉 Пробный период',
    trialDaysLeftLabel: (days: number, invoicesLeft: number) => `Осталось ${days} дней · осталось ${invoicesLeft} счетов`,
    buyButton: 'Купить',
    expiringPlanTitle: '⚠️ Тариф истекает',
    daysLeftLabel: (days: number) => `Осталось ${days} дней`,
    extendButton: 'Продлить',
    onboardingTitle: '🚀 Начало работы',
    onboardingStep1Title: 'Заполните реквизиты',
    onboardingStep1Desc: 'Название компании, БИН, адрес',
    onboardingStep1Btn: 'Заполнить',
    onboardingStep2Title: 'Добавьте банковский счёт',
    onboardingStep2Desc: 'ИИК, БИК — для реквизитов оплаты',
    onboardingStep2Btn: 'Добавить',
    onboardingStep3Title: 'Загрузите подпись',
    onboardingStep3Desc: 'Нарисуйте подпись для PDF',
    onboardingStep3Btn: 'Загрузить',
    onboardingStep4Title: 'Создайте первый счёт',
    onboardingStep4Desc: 'Заполните данные клиента',
    quickClientPickLabel: 'Быстрый выбор клиента',
    binLabel: (bin: string) => `БИН: ${bin}`,
    knpLabel: 'КНП (Код назначения платежа)',
    knpOptions: [
      { value: '710', label: '710 — Оплата за товар' },
      { value: '849', label: '849 — Оплата за услуги' },
      { value: '119', label: '119 — Прочие услуги' },
    ],
    addressLabelDashboard: 'Адрес (необязательно)',
    buyerPhonePlaceholderDashboard: '+7 776 355 5177',
    contractNumberLabelDashboard: '№ договора',
    contractNumberPlaceholderDashboard: '123',
    fromDirectoryButton: 'Из справочника',
    servicePickerTitle: 'Выберите услугу',
    fillCompanyDetailsFirstAlert: 'Сначала заполните реквизиты компании в Профиле',
    draftKeptNote: 'Начатый счёт сохранён — вернётесь и продолжите с того же места.',
    signInAlert: 'Войдите в систему',
    bankDetailsNeededConfirm: 'Не заполнены банковские реквизиты — они нужны для PDF. Заполнить сейчас?',
    enterClientBinAlert: 'Введите БИН/ИИН клиента',
    addAtLeastOneServiceAlert: 'Добавьте хотя бы одну услугу',
    specifyPriceForAllServicesAlert: 'Укажите цену для всех услуг',
    recentInvoiceConfirm: 'Вы уже создали счёт недавно. Создать ещё один?',
    planLimitFreeMessage: (limit: number) => `На бесплатном тарифе максимум ${limit} счета в месяц. Перейдите на платный тариф.`,
    planLimitTrialMessage: (limit: number) => `На пробном периоде максимум ${limit} счетов. Купите подписку для продолжения.`,
    planLimitBasicMessage: (limit: number) => `На тарифе Базовый максимум ${limit} счетов в месяц. Перейдите на Про.`,
    creatingButton: 'Создаём...',
    createButton: '✈ Создать и скачать PDF',
    saveClientModalTitle: 'Сохранить клиента?',
    saveClientPrompt: (name: string) => `${name} будет добавлен в справочник`,
    skipButton: 'Пропустить',
    saveButtonLabel: 'Сохранить',
    bankPickerTitle: 'Выберите счёт',
    mainBankBadge: '★ Основной',
    addBankAccountLabel: '+ Добавить счёт',
    vatHintAriaLabel: 'Что такое НДС 16%',
    vatHintText: 'Ставка НДС задаётся в настройках профиля и применяется ко всем новым счетам.',
    vatHintLink: 'Изменить в настройках →',
    kaspiCashierHintText: 'Хотите, чтобы оплата приходила с точной суммой счёта и автоматической отметкой «Оплачено»? Подключите Kaspi Cashier API.',
    kaspiCashierHintLink: 'Подключить →',
    noContractLabel: 'Без договора',
    noContractValue: 'Без договора',

    statusLabelPaid: 'Оплачен',
    statusLabelSent: 'Отправлен',
    statusLabelOverdue: 'Просрочен',
    statusLabelDraft: 'Черновик',
    statusLabelViewed: 'Просмотрен',
    statusChangeOptions: [
      { status: 'draft', label: '📝 Черновик' },
      { status: 'sent', label: '📤 Отправлен' },
      { status: 'viewed', label: '👁 Просмотрен клиентом' },
      { status: 'paid', label: '✅ Оплачен' },
      { status: 'overdue', label: '⏰ Просрочен' },
    ],
    invoiceNotFoundLabel: 'Счёт не найден',
    invoiceHeaderTitle: (number: string) => `Счёт ${number}`,
    noClientLabel: 'Без клиента',
    whatsappButtonLabel: 'WhatsApp',
    linkButtonLabel: 'Ссылка',
    pdfButtonLabel: 'PDF',
    emailUpgradeMessage: 'Email отправка доступна с тарифа Базовый',
    servicesAndGoodsHeader: 'Услуги и товары',
    serviceTypeBadge: (type: string) => (type === 'product' ? 'Товар' : 'Услуга'),
    totalLabel: 'Итого',
    bankDetailsHeader: 'Банковские реквизиты',
    bankNameFieldLabel: 'Банк',
    iikFieldLabel: 'ИИК',
    bikFieldLabel: 'БИК',
    kbeFieldLabel: 'КБе',
    historyHeader: 'История',
    noEntriesLabel: 'Нет записей',
    changeStatusHeader: 'Изменить статус',
    editButtonLabel: '📝 Редактировать',
    duplicateButtonLabel: '📋 Дублировать',
    repeatInvoiceButtonLabel: 'Повторить счёт',
    kpDocLabel: 'Коммерческое предложение',
    avrDocLabel: 'Акт выполненных работ',
    nakladnayaDocLabel: 'Накладная на отпуск товара',
    proLockedLabel: 'Доступно на тарифе Про',
    proBadge: 'Про',
    basicBadge: 'Базовый',
    unavailableLabel: 'Недоступно',
    noServicesInInvoiceLabel: 'Нет услуг в счёте',
    noProductsInInvoiceLabel: 'Нет товаров в счёте',
    savedToTaxLabel: (count: number) => `${count} ${count === 1 ? 'документ' : 'документа'} сохранено в налоговую`,
    kpValidUntilPrompt: 'Действителен до:',
    avrContractNumberPrompt: 'Номер договора (необязательно):',
    avrContractDatePrompt: 'Дата договора:',
    templateNamePrompt: 'Название шаблона:',
    templateSavedAlert: 'Шаблон сохранён!',
    saveAsTemplateLabel: 'Сохранить как шаблон',
    remindPaymentButtonLabel: '🔔 Напомнить об оплате',
    recurringEnabledLabel: 'Повторение включено',
    recurringMonthlyLabel: 'Повторять ежемесячно',
    recurringUntilPrompt: 'Повторять до (ДД.ММ.ГГГГ):',
    recurringDisabledAlert: 'Повторение отключено',
    invalidDateFormatAlert: 'Неверный формат даты',
    clientNoEmailAlert: 'У клиента нет email!',
    recurringEnabledUntilMessage: (until: string) => `Повторение включено до ${until}`,
    cancelInvoiceButtonLabel: '← Отозвать / Аннулировать',
    cancelInvoiceConfirm: 'Аннулировать счёт?',
    upgradeNeededTitle: 'Необходим апгрейд',
    goToPlansButton: '🚀 Перейти к тарифам',
    sendInvoiceEmailModalTitle: 'Отправить счёт на email',
    changeEmailIfNeededSubtitle: 'Измените адрес если нужно',
    recipientEmailLabel: 'Email получателя',
    sendingButtonLabel: 'Отправляем...',
    sendButtonLabel: '📧 Отправить',
    documentFormatModalTitle: 'Формат документа',
    chooseDownloadVariantSubtitle: 'Выберите вариант для скачивания',
    withSignatureButtonLabel: '✍️ С подписью и печатью',
    basicPlusBadge: '🔒 Базовый+',
    withoutSignatureButtonLabel: '📄 Без подписи и печати',
    pdfSignUpgradeMessage: 'PDF с подписью доступен с тарифа Базовый',
    ecpSectionLabel: 'Электронная подпись (ЭЦП)',
    ecpProUpgradeMessage: 'Подписание документов ЭЦП доступно на тарифе Про',
    linkCopiedMessage: (link: string) => `Ссылка скопирована: ${link}`,
    tokenNotFoundAlert: 'Ошибка: токен не найден',
    enterEmailAddressAlert: 'Введите email адрес',
    emailSentMessage: (email: string) => `✅ Счёт отправлен на ${email}`,
    whatsappShareMessage: (invoiceNumber: string, amount: string, link: string) =>
      `Здравствуйте! Направляю вам счёт на оплату ${invoiceNumber} на сумму ${amount} ₸.\n\nОткрыть счёт: ${link}`,
    reminderMessage: (clientName: string, invoiceNumber: string, amount: string, link: string) =>
      `Здравствуйте, ${clientName}!\n\nНапоминаем о неоплаченном счёте:\n\n📄 Счёт: ${invoiceNumber}\n💰 Сумма: ${amount} ₸\n🔗 Открыть счёт: ${link}\n\nПожалуйста, произведите оплату. Спасибо!`,

    editInvoiceHeaderTitle: 'Редактировать счёт',
    addressLabelEdit: 'Адрес',
    buyerPhonePlaceholderEdit: '+7 701 123 45 67',
    contractHeader: 'Договор',
    contractNumberLabelEdit: 'Номер договора',
    contractNumberPlaceholderEdit: '№123',
    notePlaceholder: 'Оплата в течение 3х дней...',
    paymentDueNote: (date: string) => `Принимается оплата до ${date}`,
    enterBinIinAlert: 'Введите БИН/ИИН',
    fillAllServicesAlert: 'Заполните все услуги',
    savingButtonLabel: 'Сохраняем...',
    saveChangesButton: '💾 Сохранить изменения',
  },
  kk: {
    errorPrefix: (message: string) => `Қате: ${message}`,
    genericErrorLabel: 'Қате',
    loadingLabel: 'Жүктелуде...',
    cancelButton: 'Бас тарту',
    clientDataHeader: 'Клиент деректері',
    companyNameLabel: 'Компания / ЖК атауы *',
    companyNamePlaceholder: 'ЖШС «Мысал»',
    binIinLabel: 'БСН/ЖСН *',
    binIinPlaceholder: '123456789012',
    emailLabel: 'Email',
    emailPlaceholder: 'client@mail.kz',
    buyerPhoneLabel: 'Сатып алушының телефоны',
    addressPlaceholder: 'Алматы қ., Абай көш. 1',
    contractDateLabel: 'Шарт күні',
    contractDatePlaceholder: '01.01.2026',
    dueDateLabel: 'Төлеу мерзімі',
    servicesHeader: 'Қызметтер / Тауарлар',
    addButton: '+ Қосу',
    serviceToggleLabel: '📋 Қызмет',
    productToggleLabel: '📦 Тауар',
    serviceNamePlaceholder: 'Қызмет / тауар атауы',
    codeLabel: 'Код',
    codePlaceholder: '001',
    qtyLabel: 'Саны',
    qtyPlaceholder: '0',
    unitLabel: 'Өлш.',
    priceLabel: 'Бағасы ₸',
    pricePlaceholder: '0',
    perLineTotal: (amount: string) => `Барлығы: ${amount} ₸`,
    amountWithoutVatLabel: 'ҚҚС-сыз сома',
    vat16Label: 'ҚҚС 16%',
    vat0Label: 'ҚҚС 0%',
    vat0Amount: '0 ₸',
    noVatLabel: 'ҚҚС жоқ',
    noVatDash: '—',
    amountDueLabel: 'Төленуге тиіс',
    noteHeader: 'Ескертпе',
    enterClientNameAlert: 'Клиент атауын енгізіңіз',
    previewFromLabel: 'Кімнен',
    previewToLabel: 'Кімге',

    newInvoiceTitle: 'Жаңа шот',
    newInvoiceSubtitle: 'Шотты 1 минутта жасаңыз',
    statsInvoicesLabel: 'Шоттар',
    statsPaidLabel: 'Төленді',
    statsIncomeLabel: 'Табыс ₸',
    freePlanTitle: 'Тегін тариф',
    freePlanSubtitle: 'Шексіз шоттар үшін ақылы тарифке өтіңіз',
    ratesButton: 'Тарифтер',
    trialPlanTitle: '🎉 Сынақ мерзімі',
    trialDaysLeftLabel: (days: number, invoicesLeft: number) => `${days} күн қалды · ${invoicesLeft} шот қалды`,
    buyButton: 'Сатып алу',
    expiringPlanTitle: '⚠️ Тариф мерзімі аяқталады',
    daysLeftLabel: (days: number) => `${days} күн қалды`,
    extendButton: 'Ұзарту',
    onboardingTitle: '🚀 Жұмысты бастау',
    onboardingStep1Title: 'Деректемелерді толтырыңыз',
    onboardingStep1Desc: 'Компания атауы, БСН, мекенжай',
    onboardingStep1Btn: 'Толтыру',
    onboardingStep2Title: 'Банк шотын қосыңыз',
    onboardingStep2Desc: 'ЖСК, БСК — төлем деректемелері үшін',
    onboardingStep2Btn: 'Қосу',
    onboardingStep3Title: 'Қолтаңба жүктеңіз',
    onboardingStep3Desc: 'PDF үшін қолтаңба салыңыз',
    onboardingStep3Btn: 'Жүктеу',
    onboardingStep4Title: 'Алғашқы шотты жасаңыз',
    onboardingStep4Desc: 'Клиент деректерін толтырыңыз',
    quickClientPickLabel: 'Клиентті жылдам таңдау',
    binLabel: (bin: string) => `БСН: ${bin}`,
    knpLabel: 'КНП (Төлем мақсатының коды)',
    knpOptions: [
      { value: '710', label: '710 — Тауар үшін төлем' },
      { value: '849', label: '849 — Қызметтер үшін төлем' },
      { value: '119', label: '119 — Басқа да қызметтер' },
    ],
    addressLabelDashboard: 'Мекенжай (міндетті емес)',
    buyerPhonePlaceholderDashboard: '+7 776 355 5177',
    contractNumberLabelDashboard: '№ шарт',
    contractNumberPlaceholderDashboard: '123',
    fromDirectoryButton: 'Анықтамалықтан',
    servicePickerTitle: 'Қызметті таңдаңыз',
    fillCompanyDetailsFirstAlert: 'Алдымен Профильде компания деректемелерін толтырыңыз',
    draftKeptNote: 'Бастаған шот сақталды — оралғанда сол жерден жалғастырасыз.',
    signInAlert: 'Жүйеге кіріңіз',
    bankDetailsNeededConfirm: 'Банк деректемелері толтырылмаған — олар PDF үшін қажет. Қазір толтырасыз ба?',
    enterClientBinAlert: 'Клиенттің БСН/ЖСН нөмірін енгізіңіз',
    addAtLeastOneServiceAlert: 'Кемінде бір қызмет қосыңыз',
    specifyPriceForAllServicesAlert: 'Барлық қызметтер үшін бағасын көрсетіңіз',
    recentInvoiceConfirm: 'Сіз жақында шот жасадыңыз. Тағы бір жасайсыз ба?',
    planLimitFreeMessage: (limit: number) => `Тегін тарифте айына ең көбі ${limit} шот жасауға болады. Ақылы тарифке өтіңіз.`,
    planLimitTrialMessage: (limit: number) => `Сынақ мерзімінде ең көбі ${limit} шот жасауға болады. Жалғастыру үшін жазылым сатып алыңыз.`,
    planLimitBasicMessage: (limit: number) => `Базалық тарифте айына ең көбі ${limit} шот жасауға болады. Про тарифіне өтіңіз.`,
    creatingButton: 'Жасалуда...',
    createButton: '✈ Жасау және PDF жүктеу',
    saveClientModalTitle: 'Клиентті сақтау керек пе?',
    saveClientPrompt: (name: string) => `${name} анықтамалыққа қосылады`,
    skipButton: 'Өткізіп жіберу',
    saveButtonLabel: 'Сақтау',
    bankPickerTitle: 'Шотты таңдаңыз',
    mainBankBadge: '★ Негізгі',
    addBankAccountLabel: '+ Шот қосу',
    vatHintAriaLabel: 'ҚҚС 16% дегеніміз не',
    vatHintText: 'ҚҚС мөлшерлемесі профиль баптауларында беріледі және барлық жаңа шоттарға қолданылады.',
    vatHintLink: 'Баптауларда өзгерту →',
    kaspiCashierHintText: 'Төлем шоттың нақты сомасымен келіп, «Төленді» белгісі автоматты түрде қойылғанын қалайсыз ба? Kaspi Cashier API қосыңыз.',
    kaspiCashierHintLink: 'Қосу →',
    noContractLabel: 'Шартсыз',
    noContractValue: 'Шартсыз',

    statusLabelPaid: 'Төленді',
    statusLabelSent: 'Жіберілді',
    statusLabelOverdue: 'Мерзімі өтті',
    statusLabelDraft: 'Жоба',
    statusLabelViewed: 'Қаралды',
    statusChangeOptions: [
      { status: 'draft', label: '📝 Жоба' },
      { status: 'sent', label: '📤 Жіберілді' },
      { status: 'viewed', label: '👁 Клиент қарады' },
      { status: 'paid', label: '✅ Төленді' },
      { status: 'overdue', label: '⏰ Мерзімі өтті' },
    ],
    invoiceNotFoundLabel: 'Шот табылмады',
    invoiceHeaderTitle: (number: string) => `Шот ${number}`,
    noClientLabel: 'Клиентсіз',
    whatsappButtonLabel: 'WhatsApp',
    linkButtonLabel: 'Сілтеме',
    pdfButtonLabel: 'PDF',
    emailUpgradeMessage: 'Email арқылы жіберу Базалық тарифінен бастап қолжетімді',
    servicesAndGoodsHeader: 'Қызметтер мен тауарлар',
    serviceTypeBadge: (type: string) => (type === 'product' ? 'Тауар' : 'Қызмет'),
    totalLabel: 'Барлығы',
    bankDetailsHeader: 'Банк деректемелері',
    bankNameFieldLabel: 'Банк',
    iikFieldLabel: 'ЖСК',
    bikFieldLabel: 'БСК',
    kbeFieldLabel: 'КБЕ',
    historyHeader: 'Тарих',
    noEntriesLabel: 'Жазбалар жоқ',
    changeStatusHeader: 'Мәртебені өзгерту',
    editButtonLabel: '📝 Өзгерту',
    duplicateButtonLabel: '📋 Көшірмесін жасау',
    repeatInvoiceButtonLabel: 'Шотты қайталау',
    kpDocLabel: 'Коммерциялық ұсыныс',
    avrDocLabel: 'Орындалған жұмыстар актісі',
    nakladnayaDocLabel: 'Тауарды босатуға арналған жүкқұжат',
    proLockedLabel: 'Про тарифінде қолжетімді',
    proBadge: 'Про',
    basicBadge: 'Базалық',
    unavailableLabel: 'Қолжетімсіз',
    noServicesInInvoiceLabel: 'Шотта қызметтер жоқ',
    noProductsInInvoiceLabel: 'Шотта тауарлар жоқ',
    savedToTaxLabel: (count: number) => `${count} құжат салық үшін сақталды`,
    kpValidUntilPrompt: 'Жарамдылық мерзімі:',
    avrContractNumberPrompt: 'Шарт нөмірі (міндетті емес):',
    avrContractDatePrompt: 'Шарт күні:',
    templateNamePrompt: 'Үлгі атауы:',
    templateSavedAlert: 'Үлгі сақталды!',
    saveAsTemplateLabel: 'Үлгі ретінде сақтау',
    remindPaymentButtonLabel: '🔔 Төлем туралы еске салу',
    recurringEnabledLabel: 'Қайталау қосылған',
    recurringMonthlyLabel: 'Ай сайын қайталау',
    recurringUntilPrompt: 'Қайталау мерзімі (КК.АА.ЖЖЖЖ):',
    recurringDisabledAlert: 'Қайталау өшірілді',
    invalidDateFormatAlert: 'Күн форматы қате',
    clientNoEmailAlert: 'Клиенттің email мекенжайы жоқ!',
    recurringEnabledUntilMessage: (until: string) => `Қайталау ${until} дейін қосылды`,
    cancelInvoiceButtonLabel: '← Кері қайтару / Жою',
    cancelInvoiceConfirm: 'Шотты жоясыз ба?',
    upgradeNeededTitle: 'Жаңарту қажет',
    goToPlansButton: '🚀 Тарифтерге өту',
    sendInvoiceEmailModalTitle: 'Шотты email арқылы жіберу',
    changeEmailIfNeededSubtitle: 'Қажет болса, мекенжайды өзгертіңіз',
    recipientEmailLabel: 'Алушының email мекенжайы',
    sendingButtonLabel: 'Жіберілуде...',
    sendButtonLabel: '📧 Жіберу',
    documentFormatModalTitle: 'Құжат форматы',
    chooseDownloadVariantSubtitle: 'Жүктеу нұсқасын таңдаңыз',
    withSignatureButtonLabel: '✍️ Қолтаңба мен мөрмен',
    basicPlusBadge: '🔒 Базалық+',
    withoutSignatureButtonLabel: '📄 Қолтаңба мен мөрсіз',
    pdfSignUpgradeMessage: 'Қолтаңбасы бар PDF Базалық тарифінен бастап қолжетімді',
    ecpSectionLabel: 'Электрондық қолтаңба (ЭЦҚ)',
    ecpProUpgradeMessage: 'Құжаттарға ЭЦҚ қою Про тарифінде қолжетімді',
    linkCopiedMessage: (link: string) => `Сілтеме көшірілді: ${link}`,
    tokenNotFoundAlert: 'Қате: токен табылмады',
    enterEmailAddressAlert: 'Email мекенжайын енгізіңіз',
    emailSentMessage: (email: string) => `✅ Шот ${email} мекенжайына жіберілді`,
    whatsappShareMessage: (invoiceNumber: string, amount: string, link: string) =>
      `Сәлеметсіз бе! Сізге төлеуге арналған ${invoiceNumber} шотын жібердім, сомасы ${amount} ₸.\n\nШотты ашу: ${link}`,
    reminderMessage: (clientName: string, invoiceNumber: string, amount: string, link: string) =>
      `Сәлеметсіз бе, ${clientName}!\n\nТөленбеген шот туралы еске саламыз:\n\n📄 Шот: ${invoiceNumber}\n💰 Сомасы: ${amount} ₸\n🔗 Шотты ашу: ${link}\n\nӨтінеміз, төлемді жүзеге асырыңыз. Рақмет!`,

    editInvoiceHeaderTitle: 'Шотты өзгерту',
    addressLabelEdit: 'Мекенжай',
    buyerPhonePlaceholderEdit: '+7 701 123 45 67',
    contractHeader: 'Шарт',
    contractNumberLabelEdit: 'Шарт нөмірі',
    contractNumberPlaceholderEdit: '№123',
    notePlaceholder: 'Төлем 3 күн ішінде...',
    paymentDueNote: (date: string) => `Төлем ${date} дейін қабылданады`,
    enterBinIinAlert: 'БСН/ЖСН енгізіңіз',
    fillAllServicesAlert: 'Барлық қызметтерді толтырыңыз',
    savingButtonLabel: 'Сақталуда...',
    saveChangesButton: '💾 Өзгерістерді сақтау',
  },
  en: {
    errorPrefix: (message: string) => `Error: ${message}`,
    genericErrorLabel: 'Error',
    loadingLabel: 'Loading...',
    cancelButton: 'Cancel',
    clientDataHeader: 'Client details',
    companyNameLabel: 'Company / Sole proprietor name *',
    companyNamePlaceholder: 'LLP "Example"',
    binIinLabel: 'BIN/IIN *',
    binIinPlaceholder: '123456789012',
    emailLabel: 'Email',
    emailPlaceholder: 'client@mail.kz',
    buyerPhoneLabel: "Buyer's phone",
    addressPlaceholder: 'Almaty, Abay St. 1',
    contractDateLabel: 'Contract date',
    contractDatePlaceholder: '01.01.2026',
    dueDateLabel: 'Due date',
    servicesHeader: 'Services / Goods',
    addButton: '+ Add',
    serviceToggleLabel: '📋 Service',
    productToggleLabel: '📦 Product',
    serviceNamePlaceholder: 'Service / product name',
    codeLabel: 'Code',
    codePlaceholder: '001',
    qtyLabel: 'Qty',
    qtyPlaceholder: '0',
    unitLabel: 'Unit',
    priceLabel: 'Price ₸',
    pricePlaceholder: '0',
    perLineTotal: (amount: string) => `Total: ${amount} ₸`,
    amountWithoutVatLabel: 'Amount excluding VAT',
    vat16Label: 'VAT 16%',
    vat0Label: 'VAT 0%',
    vat0Amount: '0 ₸',
    noVatLabel: 'No VAT',
    noVatDash: '—',
    amountDueLabel: 'Amount due',
    noteHeader: 'Note',
    enterClientNameAlert: 'Enter the client name',
    previewFromLabel: 'From',
    previewToLabel: 'To',

    newInvoiceTitle: 'New invoice',
    newInvoiceSubtitle: 'Create an invoice in 1 minute',
    statsInvoicesLabel: 'Invoices',
    statsPaidLabel: 'Paid',
    statsIncomeLabel: 'Income ₸',
    freePlanTitle: 'Free plan',
    freePlanSubtitle: 'Upgrade to a paid plan for unlimited invoices',
    ratesButton: 'Pricing',
    trialPlanTitle: '🎉 Trial period',
    trialDaysLeftLabel: (days: number, invoicesLeft: number) => `${days} days left · ${invoicesLeft} invoices left`,
    buyButton: 'Buy',
    expiringPlanTitle: '⚠️ Plan expiring',
    daysLeftLabel: (days: number) => `${days} days left`,
    extendButton: 'Renew',
    onboardingTitle: '🚀 Getting started',
    onboardingStep1Title: 'Fill in your details',
    onboardingStep1Desc: 'Company name, BIN, address',
    onboardingStep1Btn: 'Fill in',
    onboardingStep2Title: 'Add a bank account',
    onboardingStep2Desc: 'IIK, BIK — for payment details',
    onboardingStep2Btn: 'Add',
    onboardingStep3Title: 'Upload your signature',
    onboardingStep3Desc: 'Draw a signature for your PDF',
    onboardingStep3Btn: 'Upload',
    onboardingStep4Title: 'Create your first invoice',
    onboardingStep4Desc: 'Fill in the client details',
    quickClientPickLabel: 'Quick client selection',
    binLabel: (bin: string) => `BIN: ${bin}`,
    knpLabel: 'KNP (Payment purpose code)',
    knpOptions: [
      { value: '710', label: '710 — Payment for goods' },
      { value: '849', label: '849 — Payment for services' },
      { value: '119', label: '119 — Other services' },
    ],
    addressLabelDashboard: 'Address (optional)',
    buyerPhonePlaceholderDashboard: '+7 776 355 5177',
    contractNumberLabelDashboard: 'Contract No.',
    contractNumberPlaceholderDashboard: '123',
    fromDirectoryButton: 'From directory',
    servicePickerTitle: 'Choose a service',
    fillCompanyDetailsFirstAlert: 'First fill in your company details in Profile',
    draftKeptNote: 'Your unfinished invoice is saved — you will pick up where you left off.',
    signInAlert: 'Please sign in',
    bankDetailsNeededConfirm: 'Bank details are not filled in — they are required for the PDF. Fill them in now?',
    enterClientBinAlert: "Enter the client's BIN/IIN",
    addAtLeastOneServiceAlert: 'Add at least one service',
    specifyPriceForAllServicesAlert: 'Specify a price for all services',
    recentInvoiceConfirm: 'You already created an invoice recently. Create another one?',
    planLimitFreeMessage: (limit: number) => `On the free plan you can create up to ${limit} invoices per month. Upgrade to a paid plan.`,
    planLimitTrialMessage: (limit: number) => `On the trial period you can create up to ${limit} invoices. Buy a subscription to continue.`,
    planLimitBasicMessage: (limit: number) => `On the Basic plan you can create up to ${limit} invoices per month. Upgrade to Pro.`,
    creatingButton: 'Creating...',
    createButton: '✈ Create and download PDF',
    saveClientModalTitle: 'Save this client?',
    saveClientPrompt: (name: string) => `${name} will be added to your directory`,
    skipButton: 'Skip',
    saveButtonLabel: 'Save',
    bankPickerTitle: 'Choose an account',
    mainBankBadge: '★ Main',
    addBankAccountLabel: '+ Add account',
    vatHintAriaLabel: 'What is 16% VAT',
    vatHintText: 'The VAT rate is set in your profile settings and applies to all new invoices.',
    vatHintLink: 'Change in settings →',
    kaspiCashierHintText: 'Want payments to arrive with the invoice\'s exact amount and an automatic "Paid" mark? Connect Kaspi Cashier API.',
    kaspiCashierHintLink: 'Connect →',
    noContractLabel: 'No contract',
    noContractValue: 'No contract',

    statusLabelPaid: 'Paid',
    statusLabelSent: 'Sent',
    statusLabelOverdue: 'Overdue',
    statusLabelDraft: 'Draft',
    statusLabelViewed: 'Viewed',
    statusChangeOptions: [
      { status: 'draft', label: '📝 Draft' },
      { status: 'sent', label: '📤 Sent' },
      { status: 'viewed', label: '👁 Viewed by client' },
      { status: 'paid', label: '✅ Paid' },
      { status: 'overdue', label: '⏰ Overdue' },
    ],
    invoiceNotFoundLabel: 'Invoice not found',
    invoiceHeaderTitle: (number: string) => `Invoice ${number}`,
    noClientLabel: 'No client',
    whatsappButtonLabel: 'WhatsApp',
    linkButtonLabel: 'Link',
    pdfButtonLabel: 'PDF',
    emailUpgradeMessage: 'Sending via email is available from the Basic plan',
    servicesAndGoodsHeader: 'Services and goods',
    serviceTypeBadge: (type: string) => (type === 'product' ? 'Product' : 'Service'),
    totalLabel: 'Total',
    bankDetailsHeader: 'Bank details',
    bankNameFieldLabel: 'Bank',
    iikFieldLabel: 'IIK',
    bikFieldLabel: 'BIK',
    kbeFieldLabel: 'KBe',
    historyHeader: 'History',
    noEntriesLabel: 'No entries',
    changeStatusHeader: 'Change status',
    editButtonLabel: '📝 Edit',
    duplicateButtonLabel: '📋 Duplicate',
    repeatInvoiceButtonLabel: 'Repeat invoice',
    kpDocLabel: 'Commercial proposal',
    avrDocLabel: 'Act of completed works',
    nakladnayaDocLabel: 'Goods delivery note',
    proLockedLabel: 'Available on the Pro plan',
    proBadge: 'Pro',
    basicBadge: 'Basic',
    unavailableLabel: 'Unavailable',
    noServicesInInvoiceLabel: 'No services on this invoice',
    noProductsInInvoiceLabel: 'No products on this invoice',
    savedToTaxLabel: (count: number) => `${count} document${count === 1 ? '' : 's'} saved for tax records`,
    kpValidUntilPrompt: 'Valid until:',
    avrContractNumberPrompt: 'Contract number (optional):',
    avrContractDatePrompt: 'Contract date:',
    templateNamePrompt: 'Template name:',
    templateSavedAlert: 'Template saved!',
    saveAsTemplateLabel: 'Save as template',
    remindPaymentButtonLabel: '🔔 Send payment reminder',
    recurringEnabledLabel: 'Recurring enabled',
    recurringMonthlyLabel: 'Repeat monthly',
    recurringUntilPrompt: 'Repeat until (DD.MM.YYYY):',
    recurringDisabledAlert: 'Recurring disabled',
    invalidDateFormatAlert: 'Invalid date format',
    clientNoEmailAlert: 'The client has no email address!',
    recurringEnabledUntilMessage: (until: string) => `Recurring enabled until ${until}`,
    cancelInvoiceButtonLabel: '← Withdraw / Cancel',
    cancelInvoiceConfirm: 'Cancel this invoice?',
    upgradeNeededTitle: 'Upgrade required',
    goToPlansButton: '🚀 View plans',
    sendInvoiceEmailModalTitle: 'Send invoice by email',
    changeEmailIfNeededSubtitle: 'Change the address if needed',
    recipientEmailLabel: "Recipient's email",
    sendingButtonLabel: 'Sending...',
    sendButtonLabel: '📧 Send',
    documentFormatModalTitle: 'Document format',
    chooseDownloadVariantSubtitle: 'Choose a download option',
    withSignatureButtonLabel: '✍️ With signature and stamp',
    basicPlusBadge: '🔒 Basic+',
    withoutSignatureButtonLabel: '📄 Without signature and stamp',
    pdfSignUpgradeMessage: 'A signed PDF is available from the Basic plan',
    ecpSectionLabel: 'Electronic signature (ЭЦП)',
    ecpProUpgradeMessage: 'Signing documents with ЭЦП is available on the Pro plan',
    linkCopiedMessage: (link: string) => `Link copied: ${link}`,
    tokenNotFoundAlert: 'Error: token not found',
    enterEmailAddressAlert: 'Enter an email address',
    emailSentMessage: (email: string) => `✅ Invoice sent to ${email}`,
    whatsappShareMessage: (invoiceNumber: string, amount: string, link: string) =>
      `Hello! I'm sending you invoice ${invoiceNumber} for ${amount} ₸.\n\nOpen invoice: ${link}`,
    reminderMessage: (clientName: string, invoiceNumber: string, amount: string, link: string) =>
      `Hello, ${clientName}!\n\nJust a reminder about your unpaid invoice:\n\n📄 Invoice: ${invoiceNumber}\n💰 Amount: ${amount} ₸\n🔗 Open invoice: ${link}\n\nPlease make the payment. Thank you!`,

    editInvoiceHeaderTitle: 'Edit invoice',
    addressLabelEdit: 'Address',
    buyerPhonePlaceholderEdit: '+7 701 123 45 67',
    contractHeader: 'Contract',
    contractNumberLabelEdit: 'Contract number',
    contractNumberPlaceholderEdit: 'No. 123',
    notePlaceholder: 'Payment within 3 days...',
    paymentDueNote: (date: string) => `Payment accepted until ${date}`,
    enterBinIinAlert: 'Enter the BIN/IIN',
    fillAllServicesAlert: 'Fill in all services',
    savingButtonLabel: 'Saving...',
    saveChangesButton: '💾 Save changes',
  },
}
