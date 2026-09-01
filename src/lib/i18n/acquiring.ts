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
  kaspiApiTokenLabel: string
  kaspiCopyTokenButton: string
  kaspiWebhookSecretLabel: string
  kaspiWebhookSecretHint: string
  kaspiDisconnectButton: string
  kaspiDisconnectingLabel: string
  kaspiRegenerateButton: string
  kaspiRegeneratingLabel: string
  kaspiRegenerateConfirm: string
  kaspiErrorGeneric: string
  kaspiErrorInvalidOtp: string
  kaspiErrorInvalidAmount: (min: number) => string
  kaspiDocsLinkLabel: string
  kaspiDocsHint: string
  kaspiWalletBalanceLabel: string
  kaspiTopupPresetsLabel: string
  kaspiTopupNoFeeHint: string
  kaspiTopupCustomPlaceholder: string
  kaspiTopupButton: string
  kaspiTopupStartingLabel: string
  kaspiTopupPendingHint: string
  kaspiTopupPayLinkLabel: string
  kaspiTopupPayLinkHint: string
  kaspiInsufficientBalanceHint: string
  kaspiCommissionHint: string
  kaspiInvoiceAutoNote: string
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
  kaspiConversionStatsTitle: string
  kaspiConversionStatsHint: string
  kaspiConversionRateLabel: string
  kaspiConversionNoDataLabel: string
  kaspiStatusPaid: string
  kaspiStatusPending: string
  kaspiStatusExpired: string
  kaspiStatusFailed: string
  kaspiSourceInvoice: string
  kaspiSourceApi: string
  kaspiTopupSecondsLeftLabel: (seconds: number) => string
  kaspiTopupScanningLabel: string
  kaspiTopupCancelButton: string
  kaspiTopupHistoryTitle: string
  kaspiPendingMatchesTitle: string
  kaspiPendingMatchCandidate: string
  kaspiPendingMatchPayerLabel: string
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
  kaspiColClient: string
  kaspiColCommission: string
  kaspiColCategory: string
  kaspiPeriodResetButton: string
  kaspiExportExcelButton: string
  kaspiExportPdfButton: string
  kaspiExportingLabel: string
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
    kaspiTokenShownOnceWarning: 'Сохраните эти данные сейчас — они показываются только один раз.',
    kaspiApiTokenLabel: 'API-токен (заголовок Authorization: Bearer)',
    kaspiCopyTokenButton: 'Скопировать',
    kaspiWebhookSecretLabel: 'Секрет для проверки вебхука (webhook secret)',
    kaspiWebhookSecretHint: 'Используйте этот ключ, чтобы проверять подпись X-Kaspi-Pay-Signature в приходящих от нас вебхуках — он свой у каждого подключения, никому больше не передаётся.',
    kaspiDisconnectButton: 'Отключить',
    kaspiDisconnectingLabel: 'Отключаем...',
    kaspiRegenerateButton: 'Перевыпустить токен и webhook-секрет',
    kaspiRegeneratingLabel: 'Перевыпускаем...',
    kaspiRegenerateConfirm: 'Старые API-токен и webhook-секрет сразу перестанут работать — все ваши интеграции, использующие их, нужно будет обновить на новые значения. Продолжить?',
    kaspiErrorGeneric: 'Сервис Kaspi временно недоступен. Попробуйте позже.',
    kaspiErrorInvalidOtp: 'Неверный код из SMS. Попробуйте ещё раз.',
    kaspiErrorInvalidAmount: (min: number) => `Минимальная сумма пополнения — ${min.toLocaleString('ru-KZ')} ₸.`,
    kaspiDocsLinkLabel: 'Документация по API',
    kaspiDocsHint: 'Есть вопросы по подключению или запросам? Ответы в документации.',
    kaspiWalletBalanceLabel: 'Баланс кошелька',
    kaspiTopupPresetsLabel: 'Пополнить на сумму',
    kaspiTopupNoFeeHint: 'Зачисляется на баланс полностью, без комиссии. Комиссия 2% списывается отдельно, позже — только когда клиент оплачивает ваш счёт, заказ или API-платёж.',
    kaspiTopupCustomPlaceholder: 'Своя сумма, ₸',
    kaspiTopupButton: 'Пополнить',
    kaspiTopupStartingLabel: 'Готовим оплату...',
    kaspiTopupPendingHint: 'QR-код готов — отсканируйте камерой телефона или нажмите кнопку ниже, чтобы оплатить через Kaspi. Баланс обновится автоматически.',
    kaspiTopupPayLinkLabel: 'Оплатить с этого телефона',
    kaspiTopupPayLinkHint: 'Нажмите эту кнопку, только если открыли страницу на том же телефоне, где установлен Kaspi.kz — она откроет приложение Kaspi для оплаты в один тап. Если платите с компьютера, отсканируйте QR-код выше камерой телефона.',
    kaspiInsufficientBalanceHint: 'Баланс кошелька слишком низкий — при нехватке средств новые ссылки на оплату через Kaspi для ваших счетов создаваться не будут. Пополните баланс.',
    kaspiCommissionHint: 'Подключение и приём платежей через Kaspi — бесплатно. С каждого успешного платежа списывается комиссия 2% с баланса кошелька (пополняется заранее).',
    kaspiInvoiceAutoNote: 'После подключения каждый счёт, который вы выставляете в разделе «Счета», автоматически получает оплату через Kaspi Pay — QR-код и ссылку на точную сумму счёта, без отдельной настройки для каждого счёта.',
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
    kaspiConversionStatsTitle: 'Статистика приёма платежей',
    kaspiConversionStatsHint: 'Процент — доля оплаченных клиентами ссылок от всех созданных за период (счета + API). Пополнения своего баланса сюда не входят.',
    kaspiConversionRateLabel: 'Конверсия',
    kaspiConversionNoDataLabel: 'Нет данных',
    kaspiStatusPaid: 'Оплачен',
    kaspiStatusPending: 'Ожидает',
    kaspiStatusExpired: 'Истёк',
    kaspiStatusFailed: 'Не удался',
    kaspiSourceInvoice: 'счёт',
    kaspiSourceApi: 'API',
    kaspiTopupSecondsLeftLabel: (seconds: number) => `QR действителен ещё ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    kaspiTopupScanningLabel: 'Клиент сканирует QR — ждём подтверждения в приложении Kaspi...',
    kaspiTopupCancelButton: 'Отменить, выбрать другую сумму',
    kaspiTopupHistoryTitle: 'История пополнений баланса',
    kaspiPendingMatchesTitle: 'Требуют подтверждения',
    kaspiPendingMatchCandidate: 'вероятный счёт',
    kaspiPendingMatchPayerLabel: 'плательщик в Kaspi',
    kaspiConfirmMatchButton: 'Подтвердить',
    kaspiFilterAll: 'Все',
    kaspiFilterIn: 'Входящие',
    kaspiFilterOut: 'Исходящие',
    kaspiFilterPlatform: 'Счета',
    kaspiFilterOther: 'Платформа',
    kaspiColDate: 'Дата',
    kaspiColAmount: 'Сумма',
    kaspiColDirection: 'Направление',
    kaspiColInvoice: 'Счёт',
    kaspiColClient: 'Клиент',
    kaspiColCommission: 'Комиссия 2%',
    kaspiPeriodResetButton: 'Сбросить период',
    kaspiExportExcelButton: 'Excel',
    kaspiExportPdfButton: 'PDF',
    kaspiExportingLabel: 'Формируем...',
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
    kaspiTokenShownOnceWarning: 'Бұл деректерді қазір сақтаңыз — олар тек бір рет көрсетіледі.',
    kaspiApiTokenLabel: 'API-токен (Authorization: Bearer тақырыбы)',
    kaspiCopyTokenButton: 'Көшіру',
    kaspiWebhookSecretLabel: 'Вебхукты тексеру құпиясы (webhook secret)',
    kaspiWebhookSecretHint: 'Бізден келетін вебхуктардағы X-Kaspi-Pay-Signature қолын тексеру үшін осы кілтті пайдаланыңыз — ол әр қосылымда бөлек, ешкімге басқа берілмейді.',
    kaspiDisconnectButton: 'Ажырату',
    kaspiDisconnectingLabel: 'Ажыратылуда...',
    kaspiRegenerateButton: 'Токен мен webhook-құпияны қайта шығару',
    kaspiRegeneratingLabel: 'Қайта шығарылуда...',
    kaspiRegenerateConfirm: 'Ескі API-токен мен webhook-құпия бірден жұмыс істемей қалады — оларды пайдаланатын интеграцияларды жаңа мәндерге жаңарту керек болады. Жалғастыру керек пе?',
    kaspiErrorGeneric: 'Kaspi қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
    kaspiErrorInvalidOtp: 'SMS коды дұрыс емес. Қайталап көріңіз.',
    kaspiErrorInvalidAmount: (min: number) => `Ең аз толтыру сомасы — ${min.toLocaleString('ru-KZ')} ₸.`,
    kaspiDocsLinkLabel: 'API құжаттамасы',
    kaspiDocsHint: 'Қосылу немесе сұраулар бойынша сұрақтарыңыз бар ма? Жауаптар құжаттамада.',
    kaspiWalletBalanceLabel: 'Әмиян балансы',
    kaspiTopupPresetsLabel: 'Мына сомаға толтыру',
    kaspiTopupNoFeeHint: 'Балансқа толығымен, комиссиясыз есептеледі. 2% комиссия бөлек, кейінірек — тек клиент шотыңызды, тапсырысыңызды немесе API-төлемді төлегенде ғана алынады.',
    kaspiTopupCustomPlaceholder: 'Өз сомаңыз, ₸',
    kaspiTopupButton: 'Толтыру',
    kaspiTopupStartingLabel: 'Төлем дайындалуда...',
    kaspiTopupPendingHint: 'QR-код дайын — телефон камерасымен сканерлеңіз немесе Kaspi арқылы төлеу үшін төмендегі батырманы басыңыз. Баланс автоматты түрде жаңарады.',
    kaspiTopupPayLinkLabel: 'Осы телефоннан төлеу',
    kaspiTopupPayLinkHint: 'Бұл түймені тек Kaspi.kz орнатылған сол телефонда ашқан болсаңыз ғана басыңыз — ол Kaspi қосымшасын бір түртумен төлеу үшін ашады. Компьютерден төлесеңіз, жоғарыдағы QR-кодты телефон камерасымен сканерлеңіз.',
    kaspiInsufficientBalanceHint: 'Әмиян балансы тым төмен — қаражат жеткіліксіз болса, шоттарыңыз үшін Kaspi арқылы жаңа төлем сілтемелері жасалмайды. Балансты толтырыңыз.',
    kaspiCommissionHint: 'Kaspi арқылы қосылу және төлемдерді қабылдау — тегін. Әрбір сәтті төлемнен әмиян балансынан 2% комиссия алынады (алдын ала толтырылады).',
    kaspiInvoiceAutoNote: 'Қосылғаннан кейін «Шоттар» бөлімінде шығарған әрбір шот автоматты түрде Kaspi Pay арқылы төлеуге болатын болады — шоттың нақты сомасына QR-код пен сілтеме, әрбір шот үшін бөлек баптаусыз.',
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
    kaspiConversionStatsTitle: 'Төлемдерді қабылдау статистикасы',
    kaspiConversionStatsHint: 'Пайыз — кезең ішінде жасалған барлық сілтемелерден (шоттар + API) клиенттер төлеген сілтемелердің үлесі. Өз балансын толтырулар мұнда кірмейді.',
    kaspiConversionRateLabel: 'Конверсия',
    kaspiConversionNoDataLabel: 'Деректер жоқ',
    kaspiStatusPaid: 'Төленді',
    kaspiStatusPending: 'Күтілуде',
    kaspiStatusExpired: 'Мерзімі өтті',
    kaspiStatusFailed: 'Сәтсіз',
    kaspiSourceInvoice: 'шот',
    kaspiSourceApi: 'API',
    kaspiTopupSecondsLeftLabel: (seconds: number) => `QR тағы ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} жарамды`,
    kaspiTopupScanningLabel: 'Клиент QR-ды сканерлеп жатыр — Kaspi қосымшасында растауды күтудеміз...',
    kaspiTopupCancelButton: 'Бас тарту, басқа соманы таңдау',
    kaspiTopupHistoryTitle: 'Әмиян толтыру тарихы',
    kaspiPendingMatchesTitle: 'Растауды қажет етеді',
    kaspiPendingMatchCandidate: 'ықтимал шот',
    kaspiPendingMatchPayerLabel: 'Kaspi-дегі төлеуші',
    kaspiConfirmMatchButton: 'Растау',
    kaspiFilterAll: 'Барлығы',
    kaspiFilterIn: 'Кіріс',
    kaspiFilterOut: 'Шығыс',
    kaspiFilterPlatform: 'Шоттар',
    kaspiFilterOther: 'Платформа',
    kaspiColDate: 'Күні',
    kaspiColAmount: 'Сома',
    kaspiColDirection: 'Бағыты',
    kaspiColInvoice: 'Шот',
    kaspiColClient: 'Клиент',
    kaspiColCommission: '2% комиссия',
    kaspiPeriodResetButton: 'Кезеңді тазалау',
    kaspiExportExcelButton: 'Excel',
    kaspiExportPdfButton: 'PDF',
    kaspiExportingLabel: 'Дайындалуда...',
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
    kaspiTokenShownOnceWarning: 'Save these now — they are shown only once.',
    kaspiApiTokenLabel: 'API token (Authorization: Bearer header)',
    kaspiCopyTokenButton: 'Copy',
    kaspiWebhookSecretLabel: 'Webhook verification secret',
    kaspiWebhookSecretHint: 'Use this key to verify the X-Kaspi-Pay-Signature header on webhooks we send you — it is unique to this connection and never shared with anyone else.',
    kaspiDisconnectButton: 'Disconnect',
    kaspiDisconnectingLabel: 'Disconnecting...',
    kaspiRegenerateButton: 'Regenerate token and webhook secret',
    kaspiRegeneratingLabel: 'Regenerating...',
    kaspiRegenerateConfirm: 'Your old API token and webhook secret will stop working immediately — any integrations using them need to be updated to the new values. Continue?',
    kaspiErrorGeneric: 'The Kaspi service is temporarily unavailable. Try again later.',
    kaspiErrorInvalidOtp: 'Invalid SMS code. Please try again.',
    kaspiErrorInvalidAmount: (min: number) => `The minimum top-up amount is ${min.toLocaleString('en-US')} ₸.`,
    kaspiDocsLinkLabel: 'API documentation',
    kaspiDocsHint: 'Questions about connecting or making requests? The documentation has the answers.',
    kaspiWalletBalanceLabel: 'Wallet balance',
    kaspiTopupPresetsLabel: 'Top up by',
    kaspiTopupNoFeeHint: 'Credited to your balance in full, no fee. The 2% commission is charged separately, later — only when a customer pays your invoice, order, or an API payment.',
    kaspiTopupCustomPlaceholder: 'Custom amount, ₸',
    kaspiTopupButton: 'Top up',
    kaspiTopupStartingLabel: 'Preparing payment...',
    kaspiTopupPendingHint: 'Your top-up payment link is ready — pay via Kaspi and the balance will update automatically.',
    kaspiTopupPayLinkLabel: 'Pay from this phone',
    kaspiTopupPayLinkHint: "Only tap this if you opened this page on the same phone that has Kaspi.kz installed — it opens the Kaspi app for a one-tap payment. Paying from a computer? Scan the QR code above with your phone's camera instead.",
    kaspiInsufficientBalanceHint: 'Your wallet balance is too low — new Kaspi payment links for your invoices won\'t be created if funds run out. Top up your balance.',
    kaspiCommissionHint: 'Connecting and accepting Kaspi payments is free. A 2% commission is charged from your wallet balance (topped up in advance) on every successful payment.',
    kaspiInvoiceAutoNote: 'Once connected, every invoice you issue in the "Invoices" section automatically gets a Kaspi Pay payment option — a QR code and link for the invoice\'s exact amount, no per-invoice setup needed.',
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
    kaspiConversionStatsTitle: 'Payment acceptance stats',
    kaspiConversionStatsHint: 'The percentage is the share of links customers actually paid, out of all links created in the period (invoices + API). Topping up your own balance isn\'t counted here.',
    kaspiConversionRateLabel: 'Conversion',
    kaspiConversionNoDataLabel: 'No data',
    kaspiStatusPaid: 'Paid',
    kaspiStatusPending: 'Pending',
    kaspiStatusExpired: 'Expired',
    kaspiStatusFailed: 'Failed',
    kaspiSourceInvoice: 'invoice',
    kaspiSourceApi: 'API',
    kaspiTopupSecondsLeftLabel: (seconds: number) => `QR valid for ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} more`,
    kaspiTopupScanningLabel: 'Customer is scanning the QR — waiting for confirmation in the Kaspi app...',
    kaspiTopupCancelButton: 'Cancel, pick a different amount',
    kaspiTopupHistoryTitle: 'Top-up history',
    kaspiPendingMatchesTitle: 'Needs confirmation',
    kaspiPendingMatchCandidate: 'likely invoice',
    kaspiPendingMatchPayerLabel: 'Kaspi payer',
    kaspiConfirmMatchButton: 'Confirm',
    kaspiFilterAll: 'All',
    kaspiFilterIn: 'Incoming',
    kaspiFilterOut: 'Outgoing',
    kaspiFilterPlatform: 'Invoices',
    kaspiFilterOther: 'Platform',
    kaspiColDate: 'Date',
    kaspiColAmount: 'Amount',
    kaspiColDirection: 'Direction',
    kaspiColInvoice: 'Invoice',
    kaspiColClient: 'Client',
    kaspiColCommission: '2% commission',
    kaspiPeriodResetButton: 'Reset period',
    kaspiExportExcelButton: 'Excel',
    kaspiExportPdfButton: 'PDF',
    kaspiExportingLabel: 'Generating...',
    kaspiColCategory: 'Category',
  },
}
