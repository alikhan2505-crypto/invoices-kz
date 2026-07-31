export interface AcquiringContent {
  headerLabel: string
  introText: string
  proBadge: string
  proLockedHint: string
  goToPlansButton: string
  loadingLabel: string
  chooseFileButton: string
  fileChosenLabel: (name: string) => string
  processingLabel: string
  noOpenInvoicesHint: string
  matchesFoundLabel: (count: number) => string
  noMatchesFoundHint: string
  unmatchedRowsLabel: (count: number) => string
  invoiceLabel: (number: string) => string
  clientLabel: string
  amountLabel: string
  statementDateLabel: string
  descriptionLabel: string
  confirmPaymentButton: string
  confirmingLabel: string
  errorPrefix: (message: string) => string
  parseErrorMessages: Record<'not_excel' | 'too_large' | 'no_sheet' | 'unreadable' | 'unknown_structure', string>
  multipleMatchesHint: string
  bccSectionTitle: string
  bccConnectButton: string
  bccConnectingLabel: string
  bccDisconnectButton: string
  bccDisconnectingLabel: string
  bccConnectedIbanLabel: string
  bccLastCheckedLabel: string
  bccPendingMatchesLabel: (count: number) => string
  bccConnectedMessage: string
  bccErrorMessage: string
  bccErrorNoBin: string
  bccErrorNotPro: string
  bccErrorGeneric: string
  bccConnectionErrorHint: string
  bccConfirmDeleteError: string
  bccBinLabel: string
  bccBinMissing: string
  bccEditBinLink: string
}

export const acquiringDict: Record<'ru' | 'kk' | 'en', AcquiringContent> = {
  ru: {
    headerLabel: 'Эквайринг',
    introText: 'Загрузите выписку по счёту (Excel-экспорт из приложения Kaspi Pay) — мы сопоставим операции с вашими открытыми счетами по БИН плательщика и сумме. Файл обрабатывается только в браузере и никуда не отправляется.',
    proBadge: 'Про',
    proLockedHint: 'Доступно на тарифе Про',
    goToPlansButton: 'Перейти к тарифам',
    loadingLabel: 'Загрузка...',
    chooseFileButton: 'Выбрать файл выписки (.xlsx)',
    fileChosenLabel: (name: string) => `Файл: ${name}`,
    processingLabel: 'Обрабатываем файл...',
    noOpenInvoicesHint: 'Нет открытых счетов с указанным БИН клиента для сопоставления.',
    matchesFoundLabel: (count: number) => `Найдено совпадений: ${count}`,
    noMatchesFoundHint: 'Совпадений не найдено — ни одна операция не подошла по БИН и сумме к открытым счетам.',
    unmatchedRowsLabel: (count: number) => `Операций без совпадения: ${count}`,
    invoiceLabel: (number: string) => `Счёт №${number}`,
    clientLabel: 'Клиент',
    amountLabel: 'Сумма',
    statementDateLabel: 'Дата операции',
    descriptionLabel: 'Назначение',
    confirmPaymentButton: 'Подтвердить оплату',
    confirmingLabel: 'Подтверждаем...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    parseErrorMessages: {
      not_excel: 'Поддерживаются только файлы .xlsx или .xls',
      too_large: 'Файл слишком большой (максимум 5 МБ)',
      no_sheet: 'В файле нет ни одного листа',
      unreadable: 'Не удалось прочитать файл — убедитесь, что это корректный Excel-файл',
      unknown_structure: 'Не удалось распознать структуру файла — попробуйте другой формат экспорта',
    },
    multipleMatchesHint: 'Эта операция подходит к нескольким счетам — выберите один',
    bccSectionTitle: 'Автоматическая проверка через BCC',
    bccConnectButton: 'Подключить счёт BCC',
    bccConnectingLabel: 'Подключаем...',
    bccDisconnectButton: 'Отключить',
    bccDisconnectingLabel: 'Отключаем...',
    bccConnectedIbanLabel: 'Счёт',
    bccLastCheckedLabel: 'Последняя проверка',
    bccPendingMatchesLabel: (count: number) => `Найдено оплат по BCC: ${count}`,
    bccConnectedMessage: 'Счёт BCC успешно подключён.',
    bccErrorMessage: 'Не удалось подключить BCC. Попробуйте ещё раз.',
    bccErrorNoBin: 'Укажите БИН/ИИН в реквизитах перед подключением BCC.',
    bccErrorNotPro: 'Подключение счёта BCC доступно только на тарифе Про.',
    bccErrorGeneric: 'Сервис BCC временно недоступен. Попробуйте позже.',
    bccConnectionErrorHint: 'Подключение к BCC больше не действует — отключите счёт и подключите его заново.',
    bccConfirmDeleteError: 'Счёт отмечен оплаченным, но операцию не удалось убрать из списка. Обновите страницу.',
    bccBinLabel: 'БИН/ИИН для подключения',
    bccBinMissing: 'не указан',
    bccEditBinLink: 'Изменить',
  },
  kk: {
    headerLabel: 'Эквайринг',
    introText: 'Шот бойынша үзінді көшірмені (Kaspi Pay қосымшасынан Excel-экспорт) жүктеңіз — біз операцияларды сіздің ашық шоттарыңызбен төлеуші БИН-і мен сомасы бойынша салыстырамыз. Файл тек браузерде өңделеді және ешқайда жіберілмейді.',
    proBadge: 'Про',
    proLockedHint: 'Про тарифінде қолжетімді',
    goToPlansButton: 'Тарифтерге өту',
    loadingLabel: 'Жүктелуде...',
    chooseFileButton: 'Үзінді көшірме файлын таңдау (.xlsx)',
    fileChosenLabel: (name: string) => `Файл: ${name}`,
    processingLabel: 'Файл өңделуде...',
    noOpenInvoicesHint: 'Салыстыру үшін клиенттің БИН-і көрсетілген ашық шоттар жоқ.',
    matchesFoundLabel: (count: number) => `Табылған сәйкестіктер: ${count}`,
    noMatchesFoundHint: 'Сәйкестік табылмады — БИН мен сома бойынша ашық шоттарға сәйкес келетін операция жоқ.',
    unmatchedRowsLabel: (count: number) => `Сәйкессіз операциялар: ${count}`,
    invoiceLabel: (number: string) => `Шот №${number}`,
    clientLabel: 'Клиент',
    amountLabel: 'Сома',
    statementDateLabel: 'Операция күні',
    descriptionLabel: 'Мақсаты',
    confirmPaymentButton: 'Төлемді растау',
    confirmingLabel: 'Растауда...',
    errorPrefix: (message: string) => `Қате: ${message}`,
    parseErrorMessages: {
      not_excel: 'Тек .xlsx немесе .xls файлдары қолдау көрсетіледі',
      too_large: 'Файл тым үлкен (максимум 5 МБ)',
      no_sheet: 'Файлда бірде-бір парақ жоқ',
      unreadable: 'Файлды оқу мүмкін болмады — бұл дұрыс Excel файлы екеніне көз жеткізіңіз',
      unknown_structure: 'Файл құрылымын тану мүмкін болмады — экспорттың басқа форматын байқап көріңіз',
    },
    multipleMatchesHint: 'Бұл операция бірнеше шотқа сәйкес келеді — біреуін таңдаңыз',
    bccSectionTitle: 'BCC арқылы автоматты тексеру',
    bccConnectButton: 'BCC шотын қосу',
    bccConnectingLabel: 'Қосылуда...',
    bccDisconnectButton: 'Ажырату',
    bccDisconnectingLabel: 'Ажыратылуда...',
    bccConnectedIbanLabel: 'Шот',
    bccLastCheckedLabel: 'Соңғы тексеру',
    bccPendingMatchesLabel: (count: number) => `BCC бойынша табылған төлемдер: ${count}`,
    bccConnectedMessage: 'BCC шоты сәтті қосылды.',
    bccErrorMessage: 'BCC қосу мүмкін болмады. Қайталап көріңіз.',
    bccErrorNoBin: 'BCC қосу алдында деректемелерде БИН/ИИН көрсетіңіз.',
    bccErrorNotPro: 'BCC шотын қосу тек Про тарифінде қолжетімді.',
    bccErrorGeneric: 'BCC қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
    bccConnectionErrorHint: 'BCC-ке қосылу енді жарамсыз — шотты ажыратып, қайта қосыңыз.',
    bccConfirmDeleteError: 'Шот төленген деп белгіленді, бірақ операцияны тізімнен алып тастау мүмкін болмады. Бетті жаңартыңыз.',
    bccBinLabel: 'Қосу үшін БИН/ИИН',
    bccBinMissing: 'көрсетілмеген',
    bccEditBinLink: 'Өзгерту',
  },
  en: {
    headerLabel: 'Acquiring',
    introText: 'Upload your account statement (Excel export from the Kaspi Pay app) — we\'ll match transactions to your open invoices by payer BIN and amount. The file is processed only in your browser and never sent anywhere.',
    proBadge: 'Pro',
    proLockedHint: 'Available on the Pro plan',
    goToPlansButton: 'View plans',
    loadingLabel: 'Loading...',
    chooseFileButton: 'Choose statement file (.xlsx)',
    fileChosenLabel: (name: string) => `File: ${name}`,
    processingLabel: 'Processing file...',
    noOpenInvoicesHint: 'No open invoices with a client BIN to match against.',
    matchesFoundLabel: (count: number) => `Matches found: ${count}`,
    noMatchesFoundHint: 'No matches found — no transaction matched an open invoice by BIN and amount.',
    unmatchedRowsLabel: (count: number) => `Unmatched transactions: ${count}`,
    invoiceLabel: (number: string) => `Invoice №${number}`,
    clientLabel: 'Client',
    amountLabel: 'Amount',
    statementDateLabel: 'Transaction date',
    descriptionLabel: 'Description',
    confirmPaymentButton: 'Confirm payment',
    confirmingLabel: 'Confirming...',
    errorPrefix: (message: string) => `Error: ${message}`,
    parseErrorMessages: {
      not_excel: 'Only .xlsx or .xls files are supported',
      too_large: 'File is too large (5 MB maximum)',
      no_sheet: 'The file has no sheets',
      unreadable: 'Could not read the file — make sure it\'s a valid Excel file',
      unknown_structure: 'Could not recognize the file structure — try a different export format',
    },
    multipleMatchesHint: 'This transaction matches several invoices — choose one',
    bccSectionTitle: 'Automatic checking via BCC',
    bccConnectButton: 'Connect BCC account',
    bccConnectingLabel: 'Connecting...',
    bccDisconnectButton: 'Disconnect',
    bccDisconnectingLabel: 'Disconnecting...',
    bccConnectedIbanLabel: 'Account',
    bccLastCheckedLabel: 'Last checked',
    bccPendingMatchesLabel: (count: number) => `Payments found via BCC: ${count}`,
    bccConnectedMessage: 'BCC account connected successfully.',
    bccErrorMessage: 'Could not connect BCC. Please try again.',
    bccErrorNoBin: 'Add your BIN/IIN in your requisites before connecting BCC.',
    bccErrorNotPro: 'Connecting a BCC account is available on the Pro plan only.',
    bccErrorGeneric: 'The BCC service is temporarily unavailable. Try again later.',
    bccConnectionErrorHint: 'The BCC connection is no longer valid — disconnect the account and connect it again.',
    bccConfirmDeleteError: 'The invoice was marked paid, but the transaction could not be removed from the list. Please refresh the page.',
    bccBinLabel: 'BIN/IIN to connect with',
    bccBinMissing: 'not set',
    bccEditBinLink: 'Edit',
  },
}
