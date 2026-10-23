export interface ProfileMiscContent {
  // shared
  loadingLabel: string
  errorPrefix: (message: string) => string
  cancelButton: string

  // referral page (referral/page.tsx)
  referralHeaderLabel: string
  referralBannerTitle: string
  referralBannerDescBefore: string
  referralBannerBonusBold: string
  referralBannerDescAfter: string
  referralCapNote: string
  invitedFriendsLabel: string
  bonusDaysLabel: string
  yourReferralLinkLabel: string
  copyLinkButton: string
  copiedLabel: string
  shareWhatsAppButton: string
  whatsAppShareMessage: (link: string) => string
  howItWorksLabel: string
  referralStep1: string
  referralStep2: string
  referralStep3: string
  referralStep4: string

  // services page (services/page.tsx)
  servicesHeaderLabel: string
  openAddFormButton: string
  searchServicesPlaceholder: string
  editItemHeading: string
  newItemHeading: string
  serviceTypeToggleLabel: string
  productTypeToggleLabel: string
  itemNameFieldLabel: string
  serviceNamePlaceholder: string
  productNamePlaceholder: string
  itemCodeFieldLabel: string
  itemCodePlaceholder: string
  itemPriceFieldLabel: string
  itemPricePlaceholder: string
  itemUnitFieldLabel: string
  unitLabel: (unit: string) => string
  formSubmitLabel: (saving: boolean, editing: boolean) => string
  servicesLoadingLabel: string
  itemsEmptyStateLabel: (hasSearch: boolean) => string
  servicesSectionLabel: (count: number) => string
  productsSectionLabel: (count: number) => string
  addItemButton: string
  fillNameAndPriceAlert: string
  deleteItemConfirm: string

  // templates page (templates/page.tsx)
  templatesHeaderLabel: string
  templatesLoadingLabel: string
  proOnlyTitle: string
  proOnlyDesc: string
  upgradeToProButton: string
  noTemplatesLabel: string
  noTemplatesHint: string
  templateClientLabel: (name: string) => string
  useTemplateButton: string
  deleteTemplateConfirm: string

  // documents page (documents/page.tsx)
  documentsHeaderLabel: string
  documentsLockedTitle: string
  documentsLockedDesc: string
  goToPlansButton: string
  documentsInfoBannerTitle: string
  documentsInfoBannerBody: string
  kpTabLabel: string
  avrTabLabel: string
  nakladnayaTabLabel: string
  noDocumentsLabel: string
  createDocsHint: (tab: 'kp' | 'avr' | 'nakladnaya') => string
  docNumberLabel: (number: string) => string
  docContractNumberLabel: (number: string) => string
  docValidUntilLabel: (date: string) => string
  openNakladnayaAriaLabel: string
  openTitleLabel: string
  deleteDocumentAriaLabel: string
  deleteTitleLabel: string
  deleteDocumentConfirm: string
  totalDocumentsLabel: (count: number) => string

  // «О сервисе» — блок на support/page.tsx (бывшая about/page.tsx)
  appTaglineLabel: string
  versionLabel: (date: string) => string
  websiteLabel: string
  privacyPolicyLabel: string
  termsOfUseLabel: string
  dataDeletionLabel: string
  madeInKazakhstanLabel: string
  copyrightLabel: string

  // help page (support/page.tsx)
  supportHeaderLabel: string
  supportHoursText: string
  telegramContactLabel: string
  telegramResponseTimeLabel: string
  emailContactLabel: string
  emailResponseTimeLabel: string
  faqHeaderLabel: string
  faqItems: { q: string; a: string }[]
}

const RU_UNIT_LABELS: Record<string, string> = {
  'шт': 'шт', 'кг': 'кг', 'л': 'л', 'м': 'м', 'м²': 'м²', 'м³': 'м³',
  'час': 'час', 'день': 'день', 'месяц': 'месяц', 'услуга': 'услуга', 'работа': 'работа',
}
const KK_UNIT_LABELS: Record<string, string> = {
  'шт': 'дана', 'кг': 'кг', 'л': 'л', 'м': 'м', 'м²': 'м²', 'м³': 'м³',
  'час': 'сағат', 'день': 'күн', 'месяц': 'ай', 'услуга': 'қызмет', 'работа': 'жұмыс',
}
const EN_UNIT_LABELS: Record<string, string> = {
  'шт': 'pcs', 'кг': 'kg', 'л': 'l', 'м': 'm', 'м²': 'm²', 'м³': 'm³',
  'час': 'hour', 'день': 'day', 'месяц': 'month', 'услуга': 'service', 'работа': 'work',
}

export const profileContentDict: Record<'ru' | 'kk' | 'en', ProfileMiscContent> = {
  ru: {
    loadingLabel: 'Загрузка...',
    errorPrefix: (message: string) => `Ошибка: ${message}`,
    cancelButton: 'Отмена',

    referralHeaderLabel: 'Пригласить друзей',
    referralBannerTitle: 'Приглашай — получай бонусы',
    referralBannerDescBefore: 'За каждого приглашённого друга вы оба получаете',
    referralBannerBonusBold: '+7 дней',
    referralBannerDescAfter: 'Базового тарифа бесплатно',
    referralCapNote: 'Бонусные дни суммируются — максимум 90 дней одновременно.',
    invitedFriendsLabel: 'Приглашено друзей',
    bonusDaysLabel: 'Бонусных дней осталось',
    yourReferralLinkLabel: 'Ваша реферальная ссылка',
    copyLinkButton: 'Копировать',
    copiedLabel: '✓ Скопировано',
    shareWhatsAppButton: 'Поделиться в WhatsApp',
    whatsAppShareMessage: (link: string) => `Привет! Попробуй INVOICES.KZ — создавай счета за 1 минуту. Регистрируйся по моей ссылке и получи бонус: ${link}`,
    howItWorksLabel: 'Как это работает',
    referralStep1: 'Поделитесь своей ссылкой с другом',
    referralStep2: 'Друг входит по ней — через почту или Google',
    referralStep3: 'Сразу после регистрации вы оба получаете +7 дней Базового тарифа',
    referralStep4: 'Бонус — один раз на каждый новый аккаунт',

    servicesHeaderLabel: 'Товары и услуги',
    openAddFormButton: 'Добавить',
    searchServicesPlaceholder: 'Поиск по названию или коду...',
    editItemHeading: 'Редактировать позицию',
    newItemHeading: 'Новая позиция',
    serviceTypeToggleLabel: '📋 Услуга / Работа',
    productTypeToggleLabel: '📦 Товар',
    itemNameFieldLabel: 'Название *',
    serviceNamePlaceholder: 'Услуги дизайна',
    productNamePlaceholder: 'Кирпич силикатный',
    itemCodeFieldLabel: 'Код',
    itemCodePlaceholder: '001',
    itemPriceFieldLabel: 'Цена ₸ *',
    itemPricePlaceholder: '15000',
    itemUnitFieldLabel: 'Единица',
    unitLabel: (unit: string) => RU_UNIT_LABELS[unit] ?? unit,
    formSubmitLabel: (saving: boolean, editing: boolean) => saving ? 'Сохраняем...' : editing ? 'Сохранить' : 'Добавить',
    servicesLoadingLabel: 'Загрузка...',
    itemsEmptyStateLabel: (hasSearch: boolean) => hasSearch ? 'Не найдено' : 'Нет позиций',
    servicesSectionLabel: (count: number) => `📋 Услуги и работы (${count})`,
    productsSectionLabel: (count: number) => `📦 Товары (${count})`,
    addItemButton: 'Добавить товар / услугу',
    fillNameAndPriceAlert: 'Заполните название и цену',
    deleteItemConfirm: 'Удалить позицию?',

    templatesHeaderLabel: 'Шаблоны счетов',
    templatesLoadingLabel: 'Загрузка...',
    proOnlyTitle: 'Только для Про',
    proOnlyDesc: 'Сохраняйте шаблоны и создавайте счета в один клик',
    upgradeToProButton: 'Перейти на Про — 5 990 ₸/мес',
    noTemplatesLabel: 'Нет шаблонов',
    noTemplatesHint: 'Создайте счёт и нажмите "Сохранить как шаблон"',
    templateClientLabel: (name: string) => `Клиент: ${name}`,
    useTemplateButton: 'Использовать',
    deleteTemplateConfirm: 'Удалить шаблон?',

    documentsHeaderLabel: 'КП, АВР и накладные',
    documentsLockedTitle: 'Доступно на тарифе Про',
    documentsLockedDesc: 'КП, АВР и Накладные для налоговой отчётности доступны только на тарифе Про',
    goToPlansButton: '🚀 Перейти к тарифам',
    documentsInfoBannerTitle: '📁 Архив документов',
    documentsInfoBannerBody: 'Все КП, АВР и накладные, созданные из ваших счетов. Откройте любой — его можно распечатать или скачать заново.',
    kpTabLabel: '📋 КП',
    avrTabLabel: '📄 АВР',
    nakladnayaTabLabel: '📦 Накладные',
    noDocumentsLabel: 'Нет документов',
    createDocsHint: (tab: 'kp' | 'avr' | 'nakladnaya') => `Создавайте ${tab === 'kp' ? 'КП' : tab === 'avr' ? 'АВР' : 'Накладные'} на странице счёта`,
    docNumberLabel: (number: string) => `№${number}`,
    docContractNumberLabel: (number: string) => `Договор №${number}`,
    docValidUntilLabel: (date: string) => `Действителен до: ${date}`,
    openNakladnayaAriaLabel: 'Открыть накладную',
    openTitleLabel: 'Открыть',
    deleteDocumentAriaLabel: 'Удалить документ',
    deleteTitleLabel: 'Удалить',
    deleteDocumentConfirm: 'Удалить документ?',
    totalDocumentsLabel: (count: number) => `Итого: ${count} документов`,
    appTaglineLabel: 'Сервисы для бизнеса в Казахстане',
    versionLabel: d => `Обновлено ${d}`,
    websiteLabel: 'Сайт',
    privacyPolicyLabel: 'Политика конфиденциальности',
    termsOfUseLabel: 'Условия использования',
    dataDeletionLabel: 'Удаление аккаунта и данных',
    madeInKazakhstanLabel: 'Сделано в Казахстане с ❤️',
    copyrightLabel: '© 2026 INVOICES.KZ. Все права защищены.',

    supportHeaderLabel: 'Помощь и о сервисе',
    supportHoursText: 'Служба поддержки работает ежедневно с 09:00 до 20:00 (Астанинское время).',
    telegramContactLabel: 'Написать в Telegram',
    telegramResponseTimeLabel: 'Обычно отвечаем в течение 12 часов',
    emailContactLabel: 'Email',
    emailResponseTimeLabel: 'support@invoices.kz · ответ в течение 3 рабочих дней',
    faqHeaderLabel: 'Частые вопросы',
    faqItems: [
      { q: 'Как создать счёт?', a: 'Нажмите «+» на главной странице, заполните данные клиента и услуги, нажмите «Создать и скачать PDF».' },
      { q: 'Как отправить счёт клиенту?', a: 'Откройте счёт в Истории и нажмите кнопку «WhatsApp» или «Email» — клиент получит ссылку на счёт.' },
      { q: 'Как скачать PDF?', a: 'На странице счёта нажмите кнопку «PDF» и выберите вариант с подписью или без.' },
      { q: 'Как изменить реквизиты?', a: 'Профиль → Реквизиты → заполните данные компании и нажмите «Сохранить».' },
      { q: 'Что входит в пробный период?', a: '7 дней бесплатного доступа с возможностями тарифа Базовый (до 10 счетов).' },
      { q: 'Как продлить подписку?', a: 'Профиль → карточка тарифа → выберите тариф и следуйте инструкциям оплаты.' },
      { q: 'Принимают ли банки такие счета?', a: 'Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.' },
    ],
  },
  kk: {
    loadingLabel: 'Жүктелуде...',
    errorPrefix: (message: string) => `Қате: ${message}`,
    cancelButton: 'Бас тарту',

    referralHeaderLabel: 'Достарды шақыру',
    referralBannerTitle: 'Шақырыңыз — бонус алыңыз',
    referralBannerDescBefore: 'Шақырылған әрбір дос үшін екеуіңіз де',
    referralBannerBonusBold: '+7 күн',
    referralBannerDescAfter: 'тегін Негізгі тарифін аласыздар',
    referralCapNote: 'Бонустық күндер жинақталады — бір уақытта ең көбі 90 күн.',
    invitedFriendsLabel: 'Шақырылған достар',
    bonusDaysLabel: 'Қалған бонустық күндер',
    yourReferralLinkLabel: 'Сіздің реферал сілтемеңіз',
    copyLinkButton: 'Көшіру',
    copiedLabel: '✓ Көшірілді',
    shareWhatsAppButton: 'WhatsApp арқылы бөлісу',
    whatsAppShareMessage: (link: string) => `Сәлеметсіз бе! INVOICES.KZ қолданбасын байқап көріңіз — шоттарды 1 минутта жасаңыз. Менің сілтемем арқылы тіркеліп, бонус алыңыз: ${link}`,
    howItWorksLabel: 'Бұл қалай жұмыс істейді',
    referralStep1: 'Сілтемеңізбен досыңызбен бөлісіңіз',
    referralStep2: 'Досыңыз сол арқылы кіреді — пошта немесе Google арқылы',
    referralStep3: 'Тіркелгеннен кейін бірден екеуіңіз де +7 күн Негізгі тарифін аласыздар',
    referralStep4: 'Бонус әр жаңа аккаунт үшін бір рет беріледі',

    servicesHeaderLabel: 'Тауарлар мен қызметтер',
    openAddFormButton: 'Қосу',
    searchServicesPlaceholder: 'Атауы немесе коды бойынша іздеу...',
    editItemHeading: 'Позицияны өзгерту',
    newItemHeading: 'Жаңа позиция',
    serviceTypeToggleLabel: '📋 Қызмет / Жұмыс',
    productTypeToggleLabel: '📦 Тауар',
    itemNameFieldLabel: 'Атауы *',
    serviceNamePlaceholder: 'Дизайн қызметтері',
    productNamePlaceholder: 'Силикат кірпіші',
    itemCodeFieldLabel: 'Код',
    itemCodePlaceholder: '001',
    itemPriceFieldLabel: 'Бағасы ₸ *',
    itemPricePlaceholder: '15000',
    itemUnitFieldLabel: 'Өлшем бірлігі',
    unitLabel: (unit: string) => KK_UNIT_LABELS[unit] ?? unit,
    formSubmitLabel: (saving: boolean, editing: boolean) => saving ? 'Сақталуда...' : editing ? 'Сақтау' : 'Қосу',
    servicesLoadingLabel: 'Жүктелуде...',
    itemsEmptyStateLabel: (hasSearch: boolean) => hasSearch ? 'Табылмады' : 'Позициялар жоқ',
    servicesSectionLabel: (count: number) => `📋 Қызметтер мен жұмыстар (${count})`,
    productsSectionLabel: (count: number) => `📦 Тауарлар (${count})`,
    addItemButton: 'Тауар / қызмет қосу',
    fillNameAndPriceAlert: 'Атауы мен бағасын толтырыңыз',
    deleteItemConfirm: 'Позицияны жоясыз ба?',

    templatesHeaderLabel: 'Шот үлгілері',
    templatesLoadingLabel: 'Жүктелуде...',
    proOnlyTitle: 'Тек Про үшін',
    proOnlyDesc: 'Үлгілерді сақтаңыз және шоттарды бір басумен жасаңыз',
    upgradeToProButton: 'Про тарифіне өту — 5 990 ₸/ай',
    noTemplatesLabel: 'Үлгілер жоқ',
    noTemplatesHint: 'Шот жасап, "Үлгі ретінде сақтау" батырмасын басыңыз',
    templateClientLabel: (name: string) => `Клиент: ${name}`,
    useTemplateButton: 'Пайдалану',
    deleteTemplateConfirm: 'Үлгіні жоясыз ба?',

    documentsHeaderLabel: 'Ұсыныстар, актілер және жүкқұжаттар',
    documentsLockedTitle: 'Про тарифінде қолжетімді',
    documentsLockedDesc: 'Салық есептілігі үшін КҰ, ОЖА және Жүкқұжаттар тек Про тарифінде қолжетімді',
    goToPlansButton: '🚀 Тарифтерге өту',
    documentsInfoBannerTitle: '📁 Құжаттар мұрағаты',
    documentsInfoBannerBody: 'Шоттарыңыздан жасалған барлық КҰ, ОЖА және жүкқұжаттар. Кез келгенін ашып, қайта басып шығаруға немесе жүктеп алуға болады.',
    kpTabLabel: '📋 КҰ',
    avrTabLabel: '📄 ОЖА',
    nakladnayaTabLabel: '📦 Жүкқұжаттар',
    noDocumentsLabel: 'Құжаттар жоқ',
    createDocsHint: (tab: 'kp' | 'avr' | 'nakladnaya') => `Шот бетінде ${tab === 'kp' ? 'КҰ' : tab === 'avr' ? 'ОЖА' : 'Жүкқұжаттар'} жасаңыз`,
    docNumberLabel: (number: string) => `№${number}`,
    docContractNumberLabel: (number: string) => `Шарт №${number}`,
    docValidUntilLabel: (date: string) => `Жарамдылық мерзімі: ${date}`,
    openNakladnayaAriaLabel: 'Жүкқұжатты ашу',
    openTitleLabel: 'Ашу',
    deleteDocumentAriaLabel: 'Құжатты жою',
    deleteTitleLabel: 'Жою',
    deleteDocumentConfirm: 'Құжатты жоясыз ба?',
    totalDocumentsLabel: (count: number) => `Барлығы: ${count} құжат`,
    appTaglineLabel: 'Қазақстандағы бизнеске арналған сервистер',
    versionLabel: d => `Жаңартылды: ${d}`,
    websiteLabel: 'Сайт',
    privacyPolicyLabel: 'Құпиялылық саясаты',
    termsOfUseLabel: 'Пайдалану шарттары',
    dataDeletionLabel: 'Аккаунт пен деректерді жою',
    madeInKazakhstanLabel: 'Қазақстанда ❤️-пен жасалған',
    copyrightLabel: '© 2026 INVOICES.KZ. Барлық құқықтар қорғалған.',

    supportHeaderLabel: 'Көмек және сервис туралы',
    supportHoursText: 'Қолдау қызметі күн сайын 09:00-ден 20:00-ге дейін жұмыс істейді (Астана уақыты бойынша).',
    telegramContactLabel: 'Telegram-ға жазу',
    telegramResponseTimeLabel: 'Әдетте 12 сағат ішінде жауап береміз',
    emailContactLabel: 'Email',
    emailResponseTimeLabel: 'support@invoices.kz · 3 жұмыс күні ішінде жауап',
    faqHeaderLabel: 'Жиі қойылатын сұрақтар',
    faqItems: [
      { q: 'Шотты қалай жасауға болады?', a: 'Басты бетте «+» батырмасын басып, клиент деректері мен қызметтерді толтырыңыз, «Жасау және PDF жүктеу» батырмасын басыңыз.' },
      { q: 'Клиентке шотты қалай жіберуге болады?', a: 'Тарихтан шотты ашып, «WhatsApp» немесе «Email» батырмасын басыңыз — клиент шотқа сілтеме алады.' },
      { q: 'PDF-ті қалай жүктеп алуға болады?', a: 'Шот бетінде «PDF» батырмасын басып, қолтаңбамен немесе қолтаңбасыз нұсқасын таңдаңыз.' },
      { q: 'Деректемелерді қалай өзгертуге болады?', a: 'Профиль → Деректемелер → компания деректерін толтырып, «Сақтау» батырмасын басыңыз.' },
      { q: 'Сынақ мерзіміне не кіреді?', a: 'Негізгі тариф мүмкіндіктерімен 7 күн тегін қолжетімділік (10 шотқа дейін).' },
      { q: 'Жазылымды қалай ұзартуға болады?', a: 'Профиль → тариф картасы → тарифті таңдап, төлем нұсқауларын орындаңыз.' },
      { q: 'Банктер мұндай шоттарды қабылдай ма?', a: 'Иә. PDF құжаты ҚР стандарттарына сәйкес келеді — БСН, ЖСК, БСК, КБЕ және барлық қажетті деректемелерден тұрады.' },
    ],
  },
  en: {
    loadingLabel: 'Loading...',
    errorPrefix: (message: string) => `Error: ${message}`,
    cancelButton: 'Cancel',

    referralHeaderLabel: 'Invite friends',
    referralBannerTitle: 'Invite — earn bonuses',
    referralBannerDescBefore: 'For every friend you invite, you both get',
    referralBannerBonusBold: '+7 days',
    referralBannerDescAfter: 'of the Basic plan for free',
    referralCapNote: 'Bonus days add up — up to 90 days at a time.',
    invitedFriendsLabel: 'Friends invited',
    bonusDaysLabel: 'Bonus days left',
    yourReferralLinkLabel: 'Your referral link',
    copyLinkButton: 'Copy',
    copiedLabel: '✓ Copied',
    shareWhatsAppButton: 'Share on WhatsApp',
    whatsAppShareMessage: (link: string) => `Hi! Try INVOICES.KZ — create invoices in 1 minute. Sign up with my link and get a bonus: ${link}`,
    howItWorksLabel: 'How it works',
    referralStep1: 'Share your link with a friend',
    referralStep2: 'Your friend signs in with it — by email or Google',
    referralStep3: 'Right after they sign up, you both get +7 days of the Basic plan',
    referralStep4: 'One bonus per new account',

    servicesHeaderLabel: 'Products and services',
    openAddFormButton: 'Add',
    searchServicesPlaceholder: 'Search by name or code...',
    editItemHeading: 'Edit item',
    newItemHeading: 'New item',
    serviceTypeToggleLabel: '📋 Service / Work',
    productTypeToggleLabel: '📦 Product',
    itemNameFieldLabel: 'Name *',
    serviceNamePlaceholder: 'Design services',
    productNamePlaceholder: 'Silicate brick',
    itemCodeFieldLabel: 'Code',
    itemCodePlaceholder: '001',
    itemPriceFieldLabel: 'Price ₸ *',
    itemPricePlaceholder: '15000',
    itemUnitFieldLabel: 'Unit',
    unitLabel: (unit: string) => EN_UNIT_LABELS[unit] ?? unit,
    formSubmitLabel: (saving: boolean, editing: boolean) => saving ? 'Saving...' : editing ? 'Save' : 'Add',
    servicesLoadingLabel: 'Loading...',
    itemsEmptyStateLabel: (hasSearch: boolean) => hasSearch ? 'Not found' : 'No items',
    servicesSectionLabel: (count: number) => `📋 Services and work (${count})`,
    productsSectionLabel: (count: number) => `📦 Products (${count})`,
    addItemButton: 'Add product / service',
    fillNameAndPriceAlert: 'Fill in the name and price',
    deleteItemConfirm: 'Delete this item?',

    templatesHeaderLabel: 'Invoice templates',
    templatesLoadingLabel: 'Loading...',
    proOnlyTitle: 'Pro only',
    proOnlyDesc: 'Save templates and create invoices in one click',
    upgradeToProButton: 'Upgrade to Pro — ₸5,990/mo',
    noTemplatesLabel: 'No templates',
    noTemplatesHint: 'Create an invoice and click "Save as template"',
    templateClientLabel: (name: string) => `Client: ${name}`,
    useTemplateButton: 'Use',
    deleteTemplateConfirm: 'Delete this template?',

    documentsHeaderLabel: 'Quotes, acts and waybills',
    documentsLockedTitle: 'Available on the Pro plan',
    documentsLockedDesc: 'Quotes, acts, and delivery notes for tax reporting are only available on the Pro plan',
    goToPlansButton: '🚀 View plans',
    documentsInfoBannerTitle: '📁 Document archive',
    documentsInfoBannerBody: 'All quotes, acts and delivery notes created from your invoices. Open any of them to print or download it again.',
    kpTabLabel: '📋 Quotes',
    avrTabLabel: '📄 Acts',
    nakladnayaTabLabel: '📦 Delivery notes',
    noDocumentsLabel: 'No documents',
    createDocsHint: (tab: 'kp' | 'avr' | 'nakladnaya') => `Create ${tab === 'kp' ? 'quotes' : tab === 'avr' ? 'acts' : 'delivery notes'} on the invoice page`,
    docNumberLabel: (number: string) => `No. ${number}`,
    docContractNumberLabel: (number: string) => `Contract No. ${number}`,
    docValidUntilLabel: (date: string) => `Valid until: ${date}`,
    openNakladnayaAriaLabel: 'Open delivery note',
    openTitleLabel: 'Open',
    deleteDocumentAriaLabel: 'Delete document',
    deleteTitleLabel: 'Delete',
    deleteDocumentConfirm: 'Delete this document?',
    totalDocumentsLabel: (count: number) => `Total: ${count} documents`,
    appTaglineLabel: 'Services for business in Kazakhstan',
    versionLabel: d => `Updated ${d}`,
    websiteLabel: 'Website',
    privacyPolicyLabel: 'Privacy Policy',
    termsOfUseLabel: 'Terms of Use',
    dataDeletionLabel: 'Account and data deletion',
    madeInKazakhstanLabel: 'Made in Kazakhstan with ❤️',
    copyrightLabel: '© 2026 INVOICES.KZ. All rights reserved.',

    supportHeaderLabel: 'Help and about',
    supportHoursText: 'Support is available daily from 9:00 AM to 8:00 PM (Astana time).',
    telegramContactLabel: 'Message us on Telegram',
    telegramResponseTimeLabel: 'We usually reply within 12 hours',
    emailContactLabel: 'Email',
    emailResponseTimeLabel: 'support@invoices.kz · reply within 3 business days',
    faqHeaderLabel: 'Frequently asked questions',
    faqItems: [
      { q: 'How do I create an invoice?', a: 'Tap "+" on the home page, fill in the client details and services, then tap "Create and download PDF".' },
      { q: 'How do I send an invoice to a client?', a: 'Open the invoice in History and tap the "WhatsApp" or "Email" button — the client will receive a link to the invoice.' },
      { q: 'How do I download the PDF?', a: 'On the invoice page, tap the "PDF" button and choose the signed or unsigned version.' },
      { q: 'How do I change my company details?', a: 'Profile → Company details → fill in your company information and tap "Save".' },
      { q: 'What does the trial period include?', a: '7 days of free access with Basic plan features (up to 10 invoices).' },
      { q: 'How do I renew my subscription?', a: 'Profile → plan card → choose a plan and follow the payment instructions.' },
      { q: 'Do banks accept these invoices?', a: 'Yes. The PDF document meets KZ standards — it includes BIN, IIK, BIK, KBe and all required details.' },
    ],
  },
}
