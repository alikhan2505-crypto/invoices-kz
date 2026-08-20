interface FilterOption { key: string; label: string }

export interface HistoryContent {
  // shared
  loadingLabel: string
  noClientLabel: string
  errorPrefix: (message: string) => string
  statusLabels: Record<string, string>

  // history (list/archive) page
  markOverdueButtonLabel: string
  exportButtonLabel: string
  searchPlaceholder: string
  searchMinCharsHint: (min: number) => string
  repeatInvoiceLabel: string
  dateFilterOptions: FilterOption[]
  statusFilterOptions: FilterOption[]
  statsAllLabel: string
  statsPaidLabel: string
  statsUnpaidLabel: string
  statsOverdueLabel: string
  incomeForPeriodLabel: string
  noInvoicesLabel: string
  createFirstInvoiceButton: string
  createNewInvoiceButton: string
  confirmCancelInvoice: (number: string) => string
  markedOverdueMessage: (count: number) => string
  noOverdueInvoicesAlert: string
  excelColumnNumber: string
  excelColumnClient: string
  excelColumnBinIin: string
  excelColumnAmount: string
  excelColumnStatus: string
  excelColumnNote: string
  excelColumnDate: string
  excelSheetName: string
  excelFileName: (date: string) => string

  // public invoice view page
  confirmPaymentConfirm: string
  defaultServiceName: string
  invoiceNotFoundLabel: string
  invoiceForPaymentLabel: string
  dueDateLabel: string
  fromLabel: string
  toLabel: string
  binLabel: (bin: string) => string
  servicesHeaderLabel: string
  defaultUnitLabel: string
  totalDueLabel: string
  noteLabel: string
  paymentDetailsHeader: string
  bankLabel: string
  iikLabel: string
  bikLabel: string
  kbeLabel: string
  howToPayHeader: string
  step1Text: string
  step2Text: string
  step3Text: string
  payViaKaspiButton: string
  payViaHalykButton: string
  websiteLinkLabel: string
  linkFallbackLabel: string
  paymentConfirmedThanksLabel: string
  supplierNotifiedLabel: string
  openInvoicePdfButton: string
  processingButtonLabel: string
  alreadyPaidButton: string
  invoicePaidLabel: string
  openPdfLinkLabel: string
  createdViaLabel: string
}

export const historyDict: Record<'ru' | 'kk' | 'en', HistoryContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    noClientLabel: 'Без клиента',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    statusLabels: {
      paid: 'Оплачен',
      sent: 'Отправлен',
      overdue: 'Просрочен',
      draft: 'Черновик',
      viewed: 'Просмотрен',
      cancelled: 'Аннулирован',
    },

    markOverdueButtonLabel: '⏰ Обновить просрочку',
    exportButtonLabel: '📊 Экспорт',
    searchPlaceholder: 'Поиск по клиенту, сумме, примечанию...',
    searchMinCharsHint: (min: number) => `Введите минимум ${min} символа для поиска`,
    repeatInvoiceLabel: 'Повторить счёт',
    dateFilterOptions: [
      { key: 'all_time', label: 'Всё время' },
      { key: 'today', label: 'Сегодня' },
      { key: 'week', label: 'Неделя' },
      { key: 'month', label: 'Месяц' },
      { key: 'last_month', label: 'Прошлый месяц' },
    ],
    statusFilterOptions: [
      { key: 'all', label: 'Все' },
      { key: 'paid', label: 'Оплачены' },
      { key: 'sent', label: 'Отправлены' },
      { key: 'draft', label: 'Черновики' },
      { key: 'overdue', label: 'Просрочены' },
      { key: 'cancelled', label: 'Аннулированы' },
    ],
    statsAllLabel: 'Всего',
    statsPaidLabel: 'Оплачено',
    statsUnpaidLabel: 'Неоплач.',
    statsOverdueLabel: 'Просроч.',
    incomeForPeriodLabel: 'Доход за период',
    noInvoicesLabel: 'Счетов нет',
    createFirstInvoiceButton: 'Создать первый счёт',
    createNewInvoiceButton: '+ Создать новый счёт',
    confirmCancelInvoice: (number: string) => `Аннулировать счёт ${number}?`,
    markedOverdueMessage: (count: number) => `Отмечено просроченных: ${count}`,
    noOverdueInvoicesAlert: 'Просроченных счетов нет',
    excelColumnNumber: 'Номер',
    excelColumnClient: 'Клиент',
    excelColumnBinIin: 'БИН/ИИН',
    excelColumnAmount: 'Сумма',
    excelColumnStatus: 'Статус',
    excelColumnNote: 'Примечание',
    excelColumnDate: 'Дата',
    excelSheetName: 'Счета',
    excelFileName: (date: string) => `Счета_${date}.xlsx`,

    confirmPaymentConfirm: 'Подтвердить оплату?',
    defaultServiceName: 'Услуга',
    invoiceNotFoundLabel: 'Счёт не найден',
    invoiceForPaymentLabel: 'Счёт на оплату',
    dueDateLabel: 'Срок оплаты',
    fromLabel: 'От кого',
    toLabel: 'Кому',
    binLabel: (bin: string) => `БИН: ${bin}`,
    servicesHeaderLabel: 'Услуги',
    defaultUnitLabel: 'шт',
    totalDueLabel: 'Итого к оплате',
    noteLabel: 'Примечание',
    paymentDetailsHeader: 'Реквизиты для оплаты',
    bankLabel: 'Банк',
    iikLabel: 'ИИК',
    bikLabel: 'БИК',
    kbeLabel: 'КБе',
    howToPayHeader: '📋 Как оплатить',
    step1Text: 'Нажмите "Открыть счёт" — скачайте PDF или оплатите через Kaspi/Halyk кнопкой ниже',
    step2Text: 'Оплатите через свой банк по реквизитам из PDF',
    step3Text: 'Вернитесь сюда и нажмите "Я оплатил"',
    payViaKaspiButton: '🟡 Оплатить через Kaspi',
    payViaHalykButton: '🟢 Оплатить через Halyk',
    websiteLinkLabel: '🌐 Сайт',
    linkFallbackLabel: 'Ссылка',
    paymentConfirmedThanksLabel: 'Спасибо! Оплата подтверждена',
    supplierNotifiedLabel: 'Поставщик получит уведомление',
    openInvoicePdfButton: '📄 Открыть счёт (PDF)',
    processingButtonLabel: 'Обрабатываем...',
    alreadyPaidButton: '✓ Я уже оплатил этот счёт',
    invoicePaidLabel: 'Счёт оплачен',
    openPdfLinkLabel: 'Открыть PDF',
    createdViaLabel: 'Счёт создан через',
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    noClientLabel: 'Клиентсіз',
    errorPrefix: (message: string) => `Қате: ${message}`,
    statusLabels: {
      paid: 'Төленді',
      sent: 'Жіберілді',
      overdue: 'Мерзімі өтті',
      draft: 'Жоба',
      viewed: 'Қаралды',
      cancelled: 'Жойылған',
    },

    markOverdueButtonLabel: '⏰ Мерзімін жаңарту',
    exportButtonLabel: '📊 Экспорт',
    searchPlaceholder: 'Клиент, сома, ескертпе бойынша іздеу...',
    searchMinCharsHint: (min: number) => `Іздеу үшін кемінде ${min} таңба енгізіңіз`,
    repeatInvoiceLabel: 'Шотты қайталау',
    dateFilterOptions: [
      { key: 'all_time', label: 'Барлық уақыт' },
      { key: 'today', label: 'Бүгін' },
      { key: 'week', label: 'Апта' },
      { key: 'month', label: 'Ай' },
      { key: 'last_month', label: 'Өткен ай' },
    ],
    statusFilterOptions: [
      { key: 'all', label: 'Барлығы' },
      { key: 'paid', label: 'Төленген' },
      { key: 'sent', label: 'Жіберілген' },
      { key: 'draft', label: 'Жобалар' },
      { key: 'overdue', label: 'Мерзімі өткен' },
      { key: 'cancelled', label: 'Жойылған' },
    ],
    statsAllLabel: 'Барлығы',
    statsPaidLabel: 'Төленді',
    statsUnpaidLabel: 'Төленбеді',
    statsOverdueLabel: 'Мерзімі өтті',
    incomeForPeriodLabel: 'Кезең үшін табыс',
    noInvoicesLabel: 'Шоттар жоқ',
    createFirstInvoiceButton: 'Алғашқы шотты жасау',
    createNewInvoiceButton: '+ Жаңа шот жасау',
    confirmCancelInvoice: (number: string) => `${number} шотын жоясыз ба?`,
    markedOverdueMessage: (count: number) => `Мерзімі өткен деп белгіленді: ${count}`,
    noOverdueInvoicesAlert: 'Мерзімі өткен шоттар жоқ',
    excelColumnNumber: 'Нөмірі',
    excelColumnClient: 'Клиент',
    excelColumnBinIin: 'БСН/ЖСН',
    excelColumnAmount: 'Сома',
    excelColumnStatus: 'Мәртебесі',
    excelColumnNote: 'Ескертпе',
    excelColumnDate: 'Күні',
    excelSheetName: 'Шоттар',
    excelFileName: (date: string) => `Шоттар_${date}.xlsx`,

    confirmPaymentConfirm: 'Төлемді растайсыз ба?',
    defaultServiceName: 'Қызмет',
    invoiceNotFoundLabel: 'Шот табылмады',
    invoiceForPaymentLabel: 'Төлеуге арналған шот',
    dueDateLabel: 'Төлеу мерзімі',
    fromLabel: 'Кімнен',
    toLabel: 'Кімге',
    binLabel: (bin: string) => `БСН: ${bin}`,
    servicesHeaderLabel: 'Қызметтер',
    defaultUnitLabel: 'дана',
    totalDueLabel: 'Төленуге тиіс сома',
    noteLabel: 'Ескертпе',
    paymentDetailsHeader: 'Төлем деректемелері',
    bankLabel: 'Банк',
    iikLabel: 'ЖСК',
    bikLabel: 'БСК',
    kbeLabel: 'КБЕ',
    howToPayHeader: '📋 Қалай төлеу керек',
    step1Text: '«Шотты ашу» түймесін басыңыз — PDF жүктеңіз немесе төмендегі түйме арқылы Kaspi/Halyk-пен төлеңіз',
    step2Text: 'PDF-тегі деректемелер бойынша өз банкіңіз арқылы төлеңіз',
    step3Text: 'Осында қайта оралып, «Мен төледім» түймесін басыңыз',
    payViaKaspiButton: '🟡 Kaspi арқылы төлеу',
    payViaHalykButton: '🟢 Halyk арқылы төлеу',
    websiteLinkLabel: '🌐 Сайт',
    linkFallbackLabel: 'Сілтеме',
    paymentConfirmedThanksLabel: 'Рақмет! Төлем расталды',
    supplierNotifiedLabel: 'Жеткізуші хабарландыру алады',
    openInvoicePdfButton: '📄 Шотты ашу (PDF)',
    processingButtonLabel: 'Өңделуде...',
    alreadyPaidButton: '✓ Мен бұл шотты төледім',
    invoicePaidLabel: 'Шот төленді',
    openPdfLinkLabel: 'PDF ашу',
    createdViaLabel: 'Шот мына арқылы жасалды',
  },
  en: {
    loadingLabel: 'Loading...',
    noClientLabel: 'No client',
    errorPrefix: (message: string) => `Error: ${message}`,
    statusLabels: {
      paid: 'Paid',
      sent: 'Sent',
      overdue: 'Overdue',
      draft: 'Draft',
      viewed: 'Viewed',
      cancelled: 'Cancelled',
    },

    markOverdueButtonLabel: '⏰ Refresh overdue',
    exportButtonLabel: '📊 Export',
    searchPlaceholder: 'Search by client, amount, note...',
    searchMinCharsHint: (min: number) => `Type at least ${min} characters to search`,
    repeatInvoiceLabel: 'Repeat invoice',
    dateFilterOptions: [
      { key: 'all_time', label: 'All time' },
      { key: 'today', label: 'Today' },
      { key: 'week', label: 'Week' },
      { key: 'month', label: 'Month' },
      { key: 'last_month', label: 'Last month' },
    ],
    statusFilterOptions: [
      { key: 'all', label: 'All' },
      { key: 'paid', label: 'Paid' },
      { key: 'sent', label: 'Sent' },
      { key: 'draft', label: 'Drafts' },
      { key: 'overdue', label: 'Overdue' },
      { key: 'cancelled', label: 'Cancelled' },
    ],
    statsAllLabel: 'Total',
    statsPaidLabel: 'Paid',
    statsUnpaidLabel: 'Unpaid',
    statsOverdueLabel: 'Overdue',
    incomeForPeriodLabel: 'Income for period',
    noInvoicesLabel: 'No invoices',
    createFirstInvoiceButton: 'Create your first invoice',
    createNewInvoiceButton: '+ Create new invoice',
    confirmCancelInvoice: (number: string) => `Cancel invoice ${number}?`,
    markedOverdueMessage: (count: number) => `Marked as overdue: ${count}`,
    noOverdueInvoicesAlert: 'No overdue invoices',
    excelColumnNumber: 'Number',
    excelColumnClient: 'Client',
    excelColumnBinIin: 'BIN/IIN',
    excelColumnAmount: 'Amount',
    excelColumnStatus: 'Status',
    excelColumnNote: 'Note',
    excelColumnDate: 'Date',
    excelSheetName: 'Invoices',
    excelFileName: (date: string) => `Invoices_${date}.xlsx`,

    confirmPaymentConfirm: 'Confirm payment?',
    defaultServiceName: 'Service',
    invoiceNotFoundLabel: 'Invoice not found',
    invoiceForPaymentLabel: 'Invoice for payment',
    dueDateLabel: 'Due date',
    fromLabel: 'From',
    toLabel: 'To',
    binLabel: (bin: string) => `BIN: ${bin}`,
    servicesHeaderLabel: 'Services',
    defaultUnitLabel: 'pcs',
    totalDueLabel: 'Total due',
    noteLabel: 'Note',
    paymentDetailsHeader: 'Payment details',
    bankLabel: 'Bank',
    iikLabel: 'IIK',
    bikLabel: 'BIK',
    kbeLabel: 'KBe',
    howToPayHeader: '📋 How to pay',
    step1Text: 'Tap "Open invoice" — download the PDF or pay via Kaspi/Halyk using the button below',
    step2Text: 'Pay through your bank using the details from the PDF',
    step3Text: 'Come back here and tap "I have paid"',
    payViaKaspiButton: '🟡 Pay via Kaspi',
    payViaHalykButton: '🟢 Pay via Halyk',
    websiteLinkLabel: '🌐 Website',
    linkFallbackLabel: 'Link',
    paymentConfirmedThanksLabel: 'Thank you! Payment confirmed',
    supplierNotifiedLabel: 'The supplier will be notified',
    openInvoicePdfButton: '📄 Open invoice (PDF)',
    processingButtonLabel: 'Processing...',
    alreadyPaidButton: '✓ I have already paid this invoice',
    invoicePaidLabel: 'Invoice paid',
    openPdfLinkLabel: 'Open PDF',
    createdViaLabel: 'Invoice created via',
  },
}
