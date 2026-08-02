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
  kaspiSectionTitle: string
  kaspiIntroText: string
  kaspiPhoneLabel: string
  kaspiPhonePlaceholder: string
  kaspiSendCodeButton: string
  kaspiSendingCodeLabel: string
  kaspiOtpLabel: string
  kaspiOtpPlaceholder: string
  kaspiVerifyButton: string
  kaspiVerifyingLabel: string
  kaspiConnectedMessage: string
  kaspiConnectionErrorHint: string
  kaspiTokenShownOnceWarning: string
  kaspiCopyTokenButton: string
  kaspiDisconnectButton: string
  kaspiDisconnectingLabel: string
  kaspiErrorGeneric: string
  kaspiErrorInvalidOtp: string
  kaspiDocsLinkLabel: string
  kaspiWalletBalanceLabel: string
  kaspiTopupPresetsLabel: string
  kaspiTopupCustomPlaceholder: string
  kaspiTopupButton: string
  kaspiTopupStartingLabel: string
  kaspiTopupPendingHint: string
  kaspiTopupPayLinkLabel: string
  kaspiInsufficientBalanceHint: string
  kaspiCommissionHint: string
  kaspiPlatformConnectionNote: string
  kaspiHistoryTitle: string
  kaspiHistoryEmptyLabel: string
  kaspiSyncButton: string
  kaspiSyncingLabel: string
  kaspiSyncErrorHint: string
  kaspiLastSyncedLabel: (date: string) => string
  kaspiNeverSyncedLabel: string
  kaspiStatsTodayLabel: string
  kaspiStatsMonthLabel: string
  kaspiStatsAllTimeLabel: string
  kaspiStatusPaid: string
  kaspiStatusPending: string
  kaspiStatusExpired: string
  kaspiStatusFailed: string
  kaspiSourceInvoice: string
  kaspiSourceApi: string
  kaspiTopupExpiredError: string
  kaspiTopupHistoryTitle: string
  kaspiPendingMatchesTitle: string
  kaspiPendingMatchCandidate: string
  kaspiConfirmMatchButton: string
  kaspiFilterAll: string
  kaspiFilterIn: string
  kaspiFilterOut: string
  kaspiFilterPlatform: string
  kaspiFilterOther: string
  kaspiColDate: string
  kaspiColAmount: string
  kaspiColDirection: string
  kaspiColInvoice: string
  kaspiColCategory: string
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
    kaspiSectionTitle: 'Приём платежей через Kaspi',
    kaspiIntroText: 'Подключите роль «Кассир» из вашего приложения Kaspi Pay, чтобы автоматически получать ссылки на оплату для своих счетов и принимать платежи на своём сайте или в приложении через наш API.',
    kaspiPhoneLabel: 'Номер телефона кассира',
    kaspiPhonePlaceholder: '+7 707 123 45 67',
    kaspiSendCodeButton: 'Отправить код',
    kaspiSendingCodeLabel: 'Отправляем...',
    kaspiOtpLabel: 'Код из SMS',
    kaspiOtpPlaceholder: '1234',
    kaspiVerifyButton: 'Подтвердить',
    kaspiVerifyingLabel: 'Проверяем...',
    kaspiConnectedMessage: 'Кассир успешно подключён.',
    kaspiConnectionErrorHint: 'Подключение к Kaspi больше не действует — отключите кассира и подключите его заново.',
    kaspiTokenShownOnceWarning: 'Сохраните этот токен сейчас — он показывается только один раз и понадобится для вызова API.',
    kaspiCopyTokenButton: 'Скопировать',
    kaspiDisconnectButton: 'Отключить',
    kaspiDisconnectingLabel: 'Отключаем...',
    kaspiErrorGeneric: 'Сервис Kaspi временно недоступен. Попробуйте позже.',
    kaspiErrorInvalidOtp: 'Неверный код из SMS. Попробуйте ещё раз.',
    kaspiDocsLinkLabel: 'Документация по API',
    kaspiWalletBalanceLabel: 'Баланс кошелька',
    kaspiTopupPresetsLabel: 'Пополнить на сумму',
    kaspiTopupCustomPlaceholder: 'Своя сумма, ₸',
    kaspiTopupButton: 'Пополнить',
    kaspiTopupStartingLabel: 'Готовим оплату...',
    kaspiTopupPendingHint: 'Ссылка на пополнение готова — оплатите через Kaspi, баланс обновится автоматически.',
    kaspiTopupPayLinkLabel: 'Перейти к оплате',
    kaspiInsufficientBalanceHint: 'Баланс кошелька слишком низкий — при нехватке средств новые ссылки на оплату через Kaspi для ваших счетов создаваться не будут. Пополните баланс.',
    kaspiCommissionHint: 'Подключение и приём платежей через Kaspi — бесплатно. С каждого успешного платежа списывается комиссия 5% с баланса кошелька (пополняется заранее).',
    kaspiPlatformConnectionNote: 'Это подключение также используется для приёма оплаты тарифов и пополнений баланса от других пользователей invoices.kz — как административное подключение платформы.',
    kaspiHistoryTitle: 'Выписка Kaspi',
    kaspiHistoryEmptyLabel: 'Операций пока нет — нажмите «Обновить», чтобы загрузить выписку',
    kaspiSyncButton: 'Обновить',
    kaspiSyncingLabel: 'Обновляем...',
    kaspiSyncErrorHint: 'Не удалось обновить выписку. Попробуйте ещё раз.',
    kaspiLastSyncedLabel: (date: string) => `Обновлено: ${date}`,
    kaspiNeverSyncedLabel: 'Ещё не обновлялось',
    kaspiStatsTodayLabel: 'За 24 часа',
    kaspiStatsMonthLabel: 'За 30 дней',
    kaspiStatsAllTimeLabel: 'Всего',
    kaspiStatusPaid: 'Оплачен',
    kaspiStatusPending: 'Ожидает',
    kaspiStatusExpired: 'Истёк',
    kaspiStatusFailed: 'Не удался',
    kaspiSourceInvoice: 'счёт',
    kaspiSourceApi: 'API',
    kaspiTopupExpiredError: 'Ссылка на оплату истекла (действует несколько минут, как любой QR Kaspi) — попробуйте пополнить ещё раз.',
    kaspiTopupHistoryTitle: 'История пополнений баланса',
    kaspiPendingMatchesTitle: 'Требуют подтверждения',
    kaspiPendingMatchCandidate: 'вероятный счёт',
    kaspiConfirmMatchButton: 'Подтвердить',
    kaspiFilterAll: 'Все',
    kaspiFilterIn: 'Входящие',
    kaspiFilterOut: 'Исходящие',
    kaspiFilterPlatform: 'По счетам',
    kaspiFilterOther: 'Прочие',
    kaspiColDate: 'Дата',
    kaspiColAmount: 'Сумма',
    kaspiColDirection: 'Направление',
    kaspiColInvoice: 'Счёт / клиент',
    kaspiColCategory: 'Категория',
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
    kaspiSectionTitle: 'Kaspi арқылы төлемдерді қабылдау',
    kaspiIntroText: 'Шоттарыңыз үшін автоматты түрде төлем сілтемелерін алу және өз сайтыңызда немесе қосымшаңызда біздің API арқылы төлемдерді қабылдау үшін Kaspi Pay қосымшасындағы «Кассир» рөлін қосыңыз.',
    kaspiPhoneLabel: 'Кассирдің телефон нөмірі',
    kaspiPhonePlaceholder: '+7 707 123 45 67',
    kaspiSendCodeButton: 'Кодты жіберу',
    kaspiSendingCodeLabel: 'Жіберілуде...',
    kaspiOtpLabel: 'SMS кодын',
    kaspiOtpPlaceholder: '1234',
    kaspiVerifyButton: 'Растау',
    kaspiVerifyingLabel: 'Тексерілуде...',
    kaspiConnectedMessage: 'Кассир сәтті қосылды.',
    kaspiConnectionErrorHint: 'Kaspi-ге қосылу енді жарамсыз — кассирді ажыратып, қайта қосыңыз.',
    kaspiTokenShownOnceWarning: 'Бұл токенді қазір сақтаңыз — ол тек бір рет көрсетіледі және API шақыру үшін қажет болады.',
    kaspiCopyTokenButton: 'Көшіру',
    kaspiDisconnectButton: 'Ажырату',
    kaspiDisconnectingLabel: 'Ажыратылуда...',
    kaspiErrorGeneric: 'Kaspi қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
    kaspiErrorInvalidOtp: 'SMS коды дұрыс емес. Қайталап көріңіз.',
    kaspiDocsLinkLabel: 'API құжаттамасы',
    kaspiWalletBalanceLabel: 'Әмиян балансы',
    kaspiTopupPresetsLabel: 'Мына сомаға толтыру',
    kaspiTopupCustomPlaceholder: 'Өз сомаңыз, ₸',
    kaspiTopupButton: 'Толтыру',
    kaspiTopupStartingLabel: 'Төлем дайындалуда...',
    kaspiTopupPendingHint: 'Толтыру сілтемесі дайын — Kaspi арқылы төлеңіз, баланс автоматты түрде жаңарады.',
    kaspiTopupPayLinkLabel: 'Төлеуге өту',
    kaspiInsufficientBalanceHint: 'Әмиян балансы тым төмен — қаражат жеткіліксіз болса, шоттарыңыз үшін Kaspi арқылы жаңа төлем сілтемелері жасалмайды. Балансты толтырыңыз.',
    kaspiCommissionHint: 'Kaspi арқылы қосылу және төлемдерді қабылдау — тегін. Әрбір сәтті төлемнен әмиян балансынан 5% комиссия алынады (алдын ала толтырылады).',
    kaspiPlatformConnectionNote: 'Бұл қосылым invoices.kz-тің басқа пайдаланушыларынан тариф пен әмиян толтыруларын қабылдау үшін де қолданылады — платформаның әкімшілік қосылымы ретінде.',
    kaspiHistoryTitle: 'Kaspi үзінді көшірмесі',
    kaspiHistoryEmptyLabel: 'Әзірге операциялар жоқ — үзінді көшірмені жүктеу үшін «Жаңарту» басыңыз',
    kaspiSyncButton: 'Жаңарту',
    kaspiSyncingLabel: 'Жаңартылуда...',
    kaspiSyncErrorHint: 'Үзінді көшірмені жаңарту мүмкін болмады. Қайталап көріңіз.',
    kaspiLastSyncedLabel: (date: string) => `Жаңартылды: ${date}`,
    kaspiNeverSyncedLabel: 'Әлі жаңартылған жоқ',
    kaspiStatsTodayLabel: '24 сағат ішінде',
    kaspiStatsMonthLabel: '30 күн ішінде',
    kaspiStatsAllTimeLabel: 'Барлығы',
    kaspiStatusPaid: 'Төленді',
    kaspiStatusPending: 'Күтілуде',
    kaspiStatusExpired: 'Мерзімі өтті',
    kaspiStatusFailed: 'Сәтсіз',
    kaspiSourceInvoice: 'шот',
    kaspiSourceApi: 'API',
    kaspiTopupExpiredError: 'Төлем сілтемесінің мерзімі өтті (бірнеше минут жарамды, кез келген Kaspi QR сияқты) — қайта толтырып көріңіз.',
    kaspiTopupHistoryTitle: 'Әмиян толтыру тарихы',
    kaspiPendingMatchesTitle: 'Растауды қажет етеді',
    kaspiPendingMatchCandidate: 'ықтимал шот',
    kaspiConfirmMatchButton: 'Растау',
    kaspiFilterAll: 'Барлығы',
    kaspiFilterIn: 'Кіріс',
    kaspiFilterOut: 'Шығыс',
    kaspiFilterPlatform: 'Шоттар бойынша',
    kaspiFilterOther: 'Басқа',
    kaspiColDate: 'Күні',
    kaspiColAmount: 'Сома',
    kaspiColDirection: 'Бағыты',
    kaspiColInvoice: 'Шот / клиент',
    kaspiColCategory: 'Санаты',
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
    kaspiSectionTitle: 'Accept payments via Kaspi',
    kaspiIntroText: 'Connect the "Cashier" role from your Kaspi Pay app to automatically get payment links for your invoices and accept payments on your own site or app through our API.',
    kaspiPhoneLabel: 'Cashier phone number',
    kaspiPhonePlaceholder: '+7 707 123 45 67',
    kaspiSendCodeButton: 'Send code',
    kaspiSendingCodeLabel: 'Sending...',
    kaspiOtpLabel: 'SMS code',
    kaspiOtpPlaceholder: '1234',
    kaspiVerifyButton: 'Verify',
    kaspiVerifyingLabel: 'Verifying...',
    kaspiConnectedMessage: 'Cashier connected successfully.',
    kaspiConnectionErrorHint: 'The Kaspi connection is no longer valid — disconnect the cashier and connect it again.',
    kaspiTokenShownOnceWarning: 'Save this token now — it is shown only once and is needed to call the API.',
    kaspiCopyTokenButton: 'Copy',
    kaspiDisconnectButton: 'Disconnect',
    kaspiDisconnectingLabel: 'Disconnecting...',
    kaspiErrorGeneric: 'The Kaspi service is temporarily unavailable. Try again later.',
    kaspiErrorInvalidOtp: 'Invalid SMS code. Please try again.',
    kaspiDocsLinkLabel: 'API documentation',
    kaspiWalletBalanceLabel: 'Wallet balance',
    kaspiTopupPresetsLabel: 'Top up by',
    kaspiTopupCustomPlaceholder: 'Custom amount, ₸',
    kaspiTopupButton: 'Top up',
    kaspiTopupStartingLabel: 'Preparing payment...',
    kaspiTopupPendingHint: 'Your top-up payment link is ready — pay via Kaspi and the balance will update automatically.',
    kaspiTopupPayLinkLabel: 'Go to payment',
    kaspiInsufficientBalanceHint: 'Your wallet balance is too low — new Kaspi payment links for your invoices won\'t be created if funds run out. Top up your balance.',
    kaspiCommissionHint: 'Connecting and accepting Kaspi payments is free. A 5% commission is charged from your wallet balance (topped up in advance) on every successful payment.',
    kaspiPlatformConnectionNote: 'This connection is also used to accept plan payments and wallet top-ups from other invoices.kz users — as the platform\'s admin connection.',
    kaspiHistoryTitle: 'Kaspi statement',
    kaspiHistoryEmptyLabel: 'No transactions yet — press "Refresh" to load your statement',
    kaspiSyncButton: 'Refresh',
    kaspiSyncingLabel: 'Refreshing...',
    kaspiSyncErrorHint: 'Could not refresh the statement. Please try again.',
    kaspiLastSyncedLabel: (date: string) => `Updated: ${date}`,
    kaspiNeverSyncedLabel: 'Never updated yet',
    kaspiStatsTodayLabel: 'Last 24h',
    kaspiStatsMonthLabel: 'Last 30 days',
    kaspiStatsAllTimeLabel: 'All time',
    kaspiStatusPaid: 'Paid',
    kaspiStatusPending: 'Pending',
    kaspiStatusExpired: 'Expired',
    kaspiStatusFailed: 'Failed',
    kaspiSourceInvoice: 'invoice',
    kaspiSourceApi: 'API',
    kaspiTopupExpiredError: 'The payment link expired (valid for a few minutes, like any Kaspi QR) — please try topping up again.',
    kaspiTopupHistoryTitle: 'Top-up history',
    kaspiPendingMatchesTitle: 'Needs confirmation',
    kaspiPendingMatchCandidate: 'likely invoice',
    kaspiConfirmMatchButton: 'Confirm',
    kaspiFilterAll: 'All',
    kaspiFilterIn: 'Incoming',
    kaspiFilterOut: 'Outgoing',
    kaspiFilterPlatform: 'Invoice payments',
    kaspiFilterOther: 'Other',
    kaspiColDate: 'Date',
    kaspiColAmount: 'Amount',
    kaspiColDirection: 'Direction',
    kaspiColInvoice: 'Invoice / client',
    kaspiColCategory: 'Category',
  },
}
