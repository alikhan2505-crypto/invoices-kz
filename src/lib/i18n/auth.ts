type AccountType = 'ИП' | 'ТОО' | 'Физлицо'

export interface AuthContent {
  // login/page.tsx
  loginSubtitle: string
  googleSignInButton: string
  orEmailDivider: string
  emailLabel: string
  emailPlaceholder: string
  emailRequiredError: string
  invalidEmailError: string
  invalidEmailMessage: string
  errorPrefix: (message: string) => string
  sendingButton: string
  sendLinkButton: string
  checkEmailTitle: string
  linkSentPrefix: string
  changeEmailButton: string

  // onboarding/page.tsx
  companyNameRequiredError: string
  binRequiredError: string
  onboardingSubtitle: string
  stepCompanyLabel: string
  stepBankLabel: string
  stepSignatureLabel: string
  step1Title: string
  step1Subtitle: string
  referralBonusNotice: string
  promoCodeNoticePrefix: string
  promoCodeNoticeSuffix: string
  accountTypeLabel: string
  accountTypeName: (type: AccountType) => string
  companyNameFieldLabel: (type: AccountType) => string
  companyNamePlaceholder: (type: AccountType) => string
  binIinLabel: string
  binIinPlaceholder: string
  notificationEmailLabel: string
  notificationEmailPlaceholder: string
  savingButton: string
  nextButton: string
  step2Title: string
  step2Subtitle: string
  bankNameLabel: string
  bankNamePlaceholder: string
  iikLabel: string
  iikPlaceholder: string
  bikLabel: string
  bikPlaceholder: string
  kbeLabel: string
  kbePlaceholder: string
  skipButton: string
  step3Title: string
  step3Subtitle: string
  signatureItemTitle: string
  signatureItemDesc: string
  stampItemTitle: string
  stampItemDesc: string
  trialActivatedMessage: string
  proFeaturesUnlockedMessage: string
  addSignatureButton: string
  skipToAppButton: string

  // auth/callback/page.tsx
  loggingInMessage: string
}

export const authDict: Record<'ru' | 'kk' | 'en', AuthContent> = {
  ru: {
    loginSubtitle: 'Создавайте счета за 1 минуту',
    googleSignInButton: 'Войти через Google',
    orEmailDivider: 'или через email',
    emailLabel: 'Email',
    emailPlaceholder: 'example@mail.kz',
    emailRequiredError: 'Введите email адрес',
    invalidEmailError: 'Введите корректный email адрес',
    invalidEmailMessage: 'Некорректный email',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    sendingButton: 'Отправка...',
    sendLinkButton: 'Получить ссылку для входа',
    checkEmailTitle: 'Проверьте почту!',
    linkSentPrefix: 'Мы отправили ссылку для входа на',
    changeEmailButton: 'Изменить email',

    companyNameRequiredError: 'Введите название',
    binRequiredError: 'Введите БИН/ИИН',
    onboardingSubtitle: 'Настройка займёт 2 минуты',
    stepCompanyLabel: 'Компания',
    stepBankLabel: 'Банк',
    stepSignatureLabel: 'Подпись',
    step1Title: 'Данные компании',
    step1Subtitle: 'Они появятся на всех ваших счетах',
    referralBonusNotice: '🎁 Реферальный бонус будет начислен',
    promoCodeNoticePrefix: '🎁 Промокод',
    promoCodeNoticeSuffix: 'будет применён',
    accountTypeLabel: 'Тип аккаунта',
    accountTypeName: (type: AccountType) => type,
    companyNameFieldLabel: (type: AccountType) =>
      type === 'ТОО' ? 'Название ТОО' : type === 'ИП' ? 'Название ИП' : 'ФИО',
    companyNamePlaceholder: (type: AccountType) =>
      type === 'ТОО' ? 'ТОО «Пример»' : type === 'ИП' ? 'ИП Смагулов А.К.' : 'Смагулов Алихан',
    binIinLabel: 'БИН / ИИН',
    binIinPlaceholder: '123456789012',
    notificationEmailLabel: 'Email для уведомлений',
    notificationEmailPlaceholder: 'email@example.kz',
    savingButton: 'Сохраняем...',
    nextButton: 'Далее →',
    step2Title: 'Банковские реквизиты',
    step2Subtitle: 'Нужны для PDF счетов. Можно добавить позже.',
    bankNameLabel: 'Название банка',
    bankNamePlaceholder: 'АО "Kaspi Bank"',
    iikLabel: 'ИИК (номер счёта)',
    iikPlaceholder: 'KZ...',
    bikLabel: 'БИК',
    bikPlaceholder: 'CASPKZKA',
    kbeLabel: 'КБе',
    kbePlaceholder: '19',
    skipButton: 'Пропустить',
    step3Title: 'Подпись и печать',
    step3Subtitle: 'Появятся на всех документах автоматически',
    signatureItemTitle: 'Подпись',
    signatureItemDesc: 'Нарисуйте или загрузите фото подписи',
    stampItemTitle: 'Печать',
    stampItemDesc: 'Загрузите фото печати компании',
    trialActivatedMessage: '7 дней бесплатно активированы!',
    proFeaturesUnlockedMessage: 'Все функции Pro открыты',
    addSignatureButton: '✍️ Добавить подпись',
    skipToAppButton: 'Пропустить — перейти в приложение',

    loggingInMessage: 'Входим в систему...',
  },
  kk: {
    loginSubtitle: 'Шоттарды 1 минутта жасаңыз',
    googleSignInButton: 'Google арқылы кіру',
    orEmailDivider: 'немесе email арқылы',
    emailLabel: 'Email',
    emailPlaceholder: 'example@mail.kz',
    emailRequiredError: 'Email мекенжайын енгізіңіз',
    invalidEmailError: 'Дұрыс email мекенжайын енгізіңіз',
    invalidEmailMessage: 'Email мекенжайы дұрыс емес',
    errorPrefix: (message: string) => `Қате: ${message}`,
    sendingButton: 'Жіберілуде...',
    sendLinkButton: 'Кіру сілтемесін алу',
    checkEmailTitle: 'Поштаңызды тексеріңіз!',
    linkSentPrefix: 'Кіру сілтемесін мына поштаға жібердік:',
    changeEmailButton: 'Email-ды өзгерту',

    companyNameRequiredError: 'Атауын енгізіңіз',
    binRequiredError: 'БСН/ЖСН енгізіңіз',
    onboardingSubtitle: 'Баптау 2 минут алады',
    stepCompanyLabel: 'Компания',
    stepBankLabel: 'Банк',
    stepSignatureLabel: 'Қолтаңба',
    step1Title: 'Компания деректері',
    step1Subtitle: 'Олар барлық шоттарыңызда көрсетіледі',
    referralBonusNotice: '🎁 Реферал бонусы есептеледі',
    promoCodeNoticePrefix: '🎁',
    promoCodeNoticeSuffix: 'промокоды қолданылады',
    accountTypeLabel: 'Аккаунт түрі',
    accountTypeName: (type: AccountType) =>
      type === 'ИП' ? 'ЖК' : type === 'ТОО' ? 'ЖШС' : 'Жеке тұлға',
    companyNameFieldLabel: (type: AccountType) =>
      type === 'ТОО' ? 'ЖШС атауы' : type === 'ИП' ? 'ЖК атауы' : 'Аты-жөні',
    companyNamePlaceholder: (type: AccountType) =>
      type === 'ТОО' ? 'ЖШС «Мысал»' : type === 'ИП' ? 'ЖК Смағұлов А.Қ.' : 'Смағұлов Алихан',
    binIinLabel: 'БСН / ЖСН',
    binIinPlaceholder: '123456789012',
    notificationEmailLabel: 'Хабарламалар үшін email',
    notificationEmailPlaceholder: 'email@example.kz',
    savingButton: 'Сақталуда...',
    nextButton: 'Келесі →',
    step2Title: 'Банк деректемелері',
    step2Subtitle: 'PDF шоттар үшін қажет. Кейінірек қосуға болады.',
    bankNameLabel: 'Банк атауы',
    bankNamePlaceholder: 'АО "Kaspi Bank"',
    iikLabel: 'ЖСК (шот нөмірі)',
    iikPlaceholder: 'KZ...',
    bikLabel: 'БСК',
    bikPlaceholder: 'CASPKZKA',
    kbeLabel: 'КБЕ',
    kbePlaceholder: '19',
    skipButton: 'Өткізіп жіберу',
    step3Title: 'Қолтаңба мен мөр',
    step3Subtitle: 'Барлық құжаттарда автоматты түрде пайда болады',
    signatureItemTitle: 'Қолтаңба',
    signatureItemDesc: 'Қолтаңбаның суретін салыңыз немесе жүктеңіз',
    stampItemTitle: 'Мөр',
    stampItemDesc: 'Компания мөрінің фотосын жүктеңіз',
    trialActivatedMessage: '7 күн тегін кезең іске қосылды!',
    proFeaturesUnlockedMessage: 'Pro нұсқасының барлық мүмкіндіктері ашық',
    addSignatureButton: '✍️ Қолтаңба қосу',
    skipToAppButton: 'Өткізіп жіберу — қосымшаға өту',

    loggingInMessage: 'Жүйеге кіру...',
  },
  en: {
    loginSubtitle: 'Create invoices in 1 minute',
    googleSignInButton: 'Sign in with Google',
    orEmailDivider: 'or with email',
    emailLabel: 'Email',
    emailPlaceholder: 'example@mail.kz',
    emailRequiredError: 'Enter your email address',
    invalidEmailError: 'Enter a valid email address',
    invalidEmailMessage: 'Invalid email',
    errorPrefix: (message: string) => `Error: ${message}`,
    sendingButton: 'Sending...',
    sendLinkButton: 'Get sign-in link',
    checkEmailTitle: 'Check your inbox!',
    linkSentPrefix: 'We sent a sign-in link to:',
    changeEmailButton: 'Change email',

    companyNameRequiredError: 'Enter a name',
    binRequiredError: 'Enter your BIN/IIN',
    onboardingSubtitle: 'Setup takes 2 minutes',
    stepCompanyLabel: 'Company',
    stepBankLabel: 'Bank',
    stepSignatureLabel: 'Signature',
    step1Title: 'Company details',
    step1Subtitle: 'These will appear on all your invoices',
    referralBonusNotice: '🎁 A referral bonus will be credited',
    promoCodeNoticePrefix: '🎁 Promo code',
    promoCodeNoticeSuffix: 'will be applied',
    accountTypeLabel: 'Account type',
    accountTypeName: (type: AccountType) =>
      type === 'ИП' ? 'Sole proprietor' : type === 'ТОО' ? 'LLP' : 'Individual',
    companyNameFieldLabel: (type: AccountType) =>
      type === 'ТОО' ? 'LLP name' : type === 'ИП' ? 'Sole proprietor name' : 'Full name',
    companyNamePlaceholder: (type: AccountType) =>
      type === 'ТОО' ? 'LLP "Example"' : type === 'ИП' ? 'Sole Proprietor Smagulov A.K.' : 'Smagulov Alikhan',
    binIinLabel: 'BIN / IIN',
    binIinPlaceholder: '123456789012',
    notificationEmailLabel: 'Notification email',
    notificationEmailPlaceholder: 'email@example.kz',
    savingButton: 'Saving...',
    nextButton: 'Next →',
    step2Title: 'Bank details',
    step2Subtitle: 'Needed for PDF invoices. You can add these later.',
    bankNameLabel: 'Bank name',
    bankNamePlaceholder: 'JSC "Kaspi Bank"',
    iikLabel: 'IIK (account number)',
    iikPlaceholder: 'KZ...',
    bikLabel: 'BIK',
    bikPlaceholder: 'CASPKZKA',
    kbeLabel: 'KBe',
    kbePlaceholder: '19',
    skipButton: 'Skip',
    step3Title: 'Signature and stamp',
    step3Subtitle: 'These will appear automatically on all documents',
    signatureItemTitle: 'Signature',
    signatureItemDesc: 'Draw or upload a photo of your signature',
    stampItemTitle: 'Stamp',
    stampItemDesc: 'Upload a photo of your company stamp',
    trialActivatedMessage: '7 days free trial activated!',
    proFeaturesUnlockedMessage: 'All Pro features unlocked',
    addSignatureButton: '✍️ Add signature',
    skipToAppButton: 'Skip — go to the app',

    loggingInMessage: 'Signing in...',
  },
}
