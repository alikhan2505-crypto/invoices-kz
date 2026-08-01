export interface KaspiPayContent {
  headerLabel: string
  introText: string
  proBadge: string
  proLockedHint: string
  goToPlansButton: string
  loadingLabel: string
  phoneLabel: string
  phonePlaceholder: string
  sendCodeButton: string
  sendingCodeLabel: string
  otpLabel: string
  otpPlaceholder: string
  verifyButton: string
  verifyingLabel: string
  connectedMessage: string
  connectionErrorHint: string
  tokenShownOnceWarning: string
  copyTokenButton: string
  disconnectButton: string
  disconnectingLabel: string
  errorGeneric: string
  errorInvalidOtp: string
  errorNotPro: string
  docsLinkLabel: string
}

export const kaspiPayDict: Record<'ru' | 'kk' | 'en', KaspiPayContent> = {
  ru: {
    headerLabel: 'Приём платежей через Kaspi',
    introText: 'Подключите роль «Кассир» из вашего приложения Kaspi Pay, чтобы автоматически получать ссылки на оплату для своих счетов и принимать платежи на своём сайте или в приложении через наш API.',
    proBadge: 'Про',
    proLockedHint: 'Доступно на тарифе Про',
    goToPlansButton: 'Перейти к тарифам',
    loadingLabel: 'Загрузка...',
    phoneLabel: 'Номер телефона кассира',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Отправить код',
    sendingCodeLabel: 'Отправляем...',
    otpLabel: 'Код из SMS',
    otpPlaceholder: '1234',
    verifyButton: 'Подтвердить',
    verifyingLabel: 'Проверяем...',
    connectedMessage: 'Кассир успешно подключён.',
    connectionErrorHint: 'Подключение к Kaspi больше не действует — отключите кассира и подключите его заново.',
    tokenShownOnceWarning: 'Сохраните этот токен сейчас — он показывается только один раз и понадобится для вызова API.',
    copyTokenButton: 'Скопировать',
    disconnectButton: 'Отключить',
    disconnectingLabel: 'Отключаем...',
    errorGeneric: 'Сервис Kaspi временно недоступен. Попробуйте позже.',
    errorInvalidOtp: 'Неверный код из SMS. Попробуйте ещё раз.',
    errorNotPro: 'Приём платежей через Kaspi доступен только на тарифе Про.',
    docsLinkLabel: 'Документация по API',
  },
  kk: {
    headerLabel: 'Kaspi арқылы төлемдерді қабылдау',
    introText: 'Шоттарыңыз үшін автоматты түрде төлем сілтемелерін алу және өз сайтыңызда немесе қосымшаңызда біздің API арқылы төлемдерді қабылдау үшін Kaspi Pay қосымшасындағы «Кассир» рөлін қосыңыз.',
    proBadge: 'Про',
    proLockedHint: 'Про тарифінде қолжетімді',
    goToPlansButton: 'Тарифтерге өту',
    loadingLabel: 'Жүктелуде...',
    phoneLabel: 'Кассирдің телефон нөмірі',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Кодты жіберу',
    sendingCodeLabel: 'Жіберілуде...',
    otpLabel: 'SMS кодын',
    otpPlaceholder: '1234',
    verifyButton: 'Растау',
    verifyingLabel: 'Тексерілуде...',
    connectedMessage: 'Кассир сәтті қосылды.',
    connectionErrorHint: 'Kaspi-ге қосылу енді жарамсыз — кассирді ажыратып, қайта қосыңыз.',
    tokenShownOnceWarning: 'Бұл токенді қазір сақтаңыз — ол тек бір рет көрсетіледі және API шақыру үшін қажет болады.',
    copyTokenButton: 'Көшіру',
    disconnectButton: 'Ажырату',
    disconnectingLabel: 'Ажыратылуда...',
    errorGeneric: 'Kaspi қызметі уақытша қолжетімсіз. Кейінірек көріңіз.',
    errorInvalidOtp: 'SMS коды дұрыс емес. Қайталап көріңіз.',
    errorNotPro: 'Kaspi арқылы төлемдерді қабылдау тек Про тарифінде қолжетімді.',
    docsLinkLabel: 'API құжаттамасы',
  },
  en: {
    headerLabel: 'Accept payments via Kaspi',
    introText: 'Connect the "Cashier" role from your Kaspi Pay app to automatically get payment links for your invoices and accept payments on your own site or app through our API.',
    proBadge: 'Pro',
    proLockedHint: 'Available on the Pro plan',
    goToPlansButton: 'View plans',
    loadingLabel: 'Loading...',
    phoneLabel: 'Cashier phone number',
    phonePlaceholder: '+7 707 123 45 67',
    sendCodeButton: 'Send code',
    sendingCodeLabel: 'Sending...',
    otpLabel: 'SMS code',
    otpPlaceholder: '1234',
    verifyButton: 'Verify',
    verifyingLabel: 'Verifying...',
    connectedMessage: 'Cashier connected successfully.',
    connectionErrorHint: 'The Kaspi connection is no longer valid — disconnect the cashier and connect it again.',
    tokenShownOnceWarning: 'Save this token now — it is shown only once and is needed to call the API.',
    copyTokenButton: 'Copy',
    disconnectButton: 'Disconnect',
    disconnectingLabel: 'Disconnecting...',
    errorGeneric: 'The Kaspi service is temporarily unavailable. Try again later.',
    errorInvalidOtp: 'Invalid SMS code. Please try again.',
    errorNotPro: 'Accepting payments via Kaspi is available on the Pro plan only.',
    docsLinkLabel: 'API documentation',
  },
}
