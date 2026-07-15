export interface LandingContent {
  navCta: string
  heroBadge: string
  heroTitleLine1: string
  heroTitleLine2: string
  heroSubtitle: string
  heroPrimaryCta: string
  heroSecondaryCta: string
  heroNote: string
  phoneStatusPaid: string
  phoneServiceLine: string
  phoneVatLine: string
  phoneDownloadPdf: string
  stats: { val: string; label: string }[]
  featuresEyebrow: string
  featuresTitleLine1: string
  featuresTitleLine2: string
  featuresSubtitle: string
  features: { icon: string; title: string; desc: string }[]
  stepsEyebrow: string
  stepsTitleLine1: string
  stepsTitleLine2: string
  steps: { n: string; title: string; desc: string }[]
  whoEyebrow: string
  whoTitle: string
  who: { icon: string; label: string }[]
  pricingEyebrow: string
  pricingTitleLine1: string
  pricingTitleLine2: string
  pricingSubtitle: string
  plans: { badge: string | null; name: string; price: string; per: string; features: string[]; btn: 'outline' | 'solid'; btnText: string }[]
  faqEyebrow: string
  faqTitle: string
  faqs: { q: string; a: string }[]
  ctaTitle: string
  ctaSubtitle: string
  ctaButton: string
  ctaNote: string
  footerLinks: { label: string; href: string }[]
  footerBottom: string
}

export const landing: Record<'ru' | 'kk' | 'en', LandingContent> = {
  ru: {
    navCta: 'Начать →',
    heroBadge: '🇰🇿 Сделано для казахстанского бизнеса',
    heroTitleLine1: 'Счета на оплату',
    heroTitleLine2: 'за 1 минуту',
    heroSubtitle: 'Создавайте профессиональные счета с подписью и печатью. Отправляйте через WhatsApp. Принимайте оплату через Kaspi Pay.',
    heroPrimaryCta: 'Создать первый счёт →',
    heroSecondaryCta: 'Как это работает',
    heroNote: '7 дней бесплатно · Без карты',
    phoneStatusPaid: 'Оплачен',
    phoneServiceLine: 'Консалтинг × 10',
    phoneVatLine: 'НДС 12%',
    phoneDownloadPdf: '📥 Скачать PDF',
    stats: [
      { val: '1 мин', label: 'создание счёта' },
      { val: '7+', label: 'бизнесов' },
      { val: '100%', label: 'стандарты РК' },
      { val: 'Kaspi', label: 'интеграция' },
    ],
    featuresEyebrow: 'Возможности',
    featuresTitleLine1: 'Всё для вашего',
    featuresTitleLine2: 'документооборота',
    featuresSubtitle: 'Все необходимые инструменты в одном месте — без бухгалтера и сложных программ.',
    features: [
      { icon: '⚡', title: 'Счёт за 1 минуту', desc: 'Заполните данные клиента, добавьте услуги — PDF готов автоматически с вашей подписью и печатью.' },
      { icon: '💚', title: 'Оплата через Kaspi Pay', desc: 'Клиент оплачивает в один клик через Kaspi. Деньги приходят мгновенно. Интеграция уже работает.' },
      { icon: '💬', title: 'Отправка в WhatsApp', desc: 'Нажмите одну кнопку — клиент получит красивую страницу счёта прямо в мессенджере.' },
      { icon: '📋', title: 'КП, АВР, Накладная', desc: 'Все документы по стандартам РК: Форма Р-1, Приложение 50, Форма З-2. Банки принимают без вопросов.' },
      { icon: '✍️', title: 'Подпись и печать', desc: 'Загрузите один раз — автоматически появятся на всех документах. Поддержка ЭЦП НУЦ РК.' },
      { icon: '📱', title: 'Работает на телефоне', desc: 'Создавайте счета на встрече, в дороге, дома. Устанавливается как приложение на любое устройство.' },
    ],
    stepsEyebrow: 'Как работает',
    stepsTitleLine1: 'Три шага',
    stepsTitleLine2: 'до оплаты',
    steps: [
      { n: '1', title: 'Введите реквизиты', desc: 'Один раз заполните данные компании — БИН, ИИК, БИК, КБе. Они будут автоматически появляться во всех документах.' },
      { n: '2', title: 'Создайте документ', desc: 'Укажите клиента, добавьте услуги и нажмите «Создать». PDF с подписью и печатью готов за 30 секунд.' },
      { n: '3', title: 'Отправьте и получите деньги', desc: 'Отправьте ссылку через WhatsApp. Клиент видит счёт и оплачивает через Kaspi Pay мгновенно.' },
    ],
    whoEyebrow: 'Аудитория',
    whoTitle: 'Для кого',
    who: [
      { icon: '👨‍💼', label: 'ИП и фрилансеры' },
      { icon: '🏢', label: 'Малый бизнес' },
      { icon: '👩‍💻', label: 'IT компании' },
      { icon: '🎨', label: 'Дизайнеры' },
      { icon: '🔧', label: 'Подрядчики' },
      { icon: '📦', label: 'Поставщики' },
    ],
    pricingEyebrow: 'Тарифы',
    pricingTitleLine1: 'Без скрытых',
    pricingTitleLine2: 'платежей',
    pricingSubtitle: 'Выберите подходящий план. Отмена в любое время.',
    plans: [
      {
        badge: null, name: 'Бесплатно', price: '0', per: '₸',
        features: ['7 дней бесплатного периода', 'PDF генерация', 'История счетов', 'Профиль компании', 'Публичная ссылка'],
        btn: 'outline', btnText: 'Начать бесплатно',
      },
      {
        badge: 'Популярный', name: 'Базовый', price: '2 990', per: '₸/мес',
        features: ['30 счетов в месяц', 'PDF с подписью и печатью', 'Справочник клиентов', 'Kaspi Pay интеграция', 'Отправка через WhatsApp', 'Поддержка в WhatsApp'],
        btn: 'solid', btnText: 'Подключить за 2 990 ₸',
      },
      {
        badge: 'Максимум', name: 'Про', price: '5 990', per: '₸/мес',
        features: ['Безлимитные счета', 'КП, АВР, Накладная', 'Email + WhatsApp отправка', 'Аналитика и отчёты', 'ЭЦП НУЦ РК (скоро)', 'Приоритетная поддержка 24/7'],
        btn: 'solid', btnText: 'Подключить за 5 990 ₸',
      },
    ],
    faqEyebrow: 'FAQ',
    faqTitle: 'Частые вопросы',
    faqs: [
      { q: 'Нужна ли ЭЦП для работы?', a: 'Нет, ЭЦП необязательна. Вы можете загрузить рукописную подпись и печать. Интеграция с ЭЦП НУЦ РК находится в разработке.' },
      { q: 'Как клиент получает счёт?', a: 'Вы отправляете ссылку через WhatsApp. Клиент открывает страницу счёта без регистрации и оплачивает через Kaspi Pay.' },
      { q: 'Принимают ли банки такие счета?', a: 'Да. PDF документ соответствует стандартам РК — содержит БИН, ИИК, БИК, КБе и все необходимые реквизиты.' },
      { q: 'Можно ли работать с нескольких устройств?', a: 'Да. INVOICES.KZ работает в браузере на телефоне, планшете и компьютере. Все данные синхронизируются.' },
      { q: 'Как отменить подписку?', a: 'Напишите нам в WhatsApp — отменим в течение часа. Деньги за неиспользованный период возвращаем.' },
    ],
    ctaTitle: 'Готовы начать?',
    ctaSubtitle: 'Зарегистрируйтесь за 30 секунд — никакой карты не нужно',
    ctaButton: 'Создать первый счёт →',
    ctaNote: '7 дней бесплатно · Отмена в любое время',
    footerLinks: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
      { label: 'Политика', href: '/privacy' },
      { label: 'Условия', href: '/terms' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · ИП First Project · БИН 890525350143 · г. Астана',
  },
  kk: {
    navCta: 'Бастау →',
    heroBadge: '🇰🇿 Қазақстандық бизнес үшін жасалған',
    heroTitleLine1: 'Төлем шотын',
    heroTitleLine2: '1 минутта',
    heroSubtitle: 'Қолтаңба мен мөрі бар кәсіби шоттар жасаңыз. WhatsApp арқылы жіберіңіз. Kaspi Pay арқылы төлем қабылдаңыз.',
    heroPrimaryCta: 'Алғашқы шотты жасау →',
    heroSecondaryCta: 'Бұл қалай жұмыс істейді',
    heroNote: '7 күн тегін · Карта қажет емес',
    phoneStatusPaid: 'Төленді',
    phoneServiceLine: 'Кеңес беру × 10',
    phoneVatLine: 'ҚҚС 12%',
    phoneDownloadPdf: '📥 PDF жүктеу',
    stats: [
      { val: '1 мин', label: 'шот құру' },
      { val: '7+', label: 'бизнес' },
      { val: '100%', label: 'ҚР стандарттары' },
      { val: 'Kaspi', label: 'интеграция' },
    ],
    featuresEyebrow: 'Мүмкіндіктер',
    featuresTitleLine1: 'Құжат айналымыңыз',
    featuresTitleLine2: 'үшін бәрі осында',
    featuresSubtitle: 'Барлық қажетті құралдар бір жерде — бухгалтерсіз және күрделі бағдарламаларсыз.',
    features: [
      { icon: '⚡', title: '1 минутта шот', desc: 'Клиент деректерін толтырып, қызметтерді қосыңыз — PDF қолтаңба мен мөріңізбен автоматты түрде дайын болады.' },
      { icon: '💚', title: 'Kaspi Pay арқылы төлем', desc: 'Клиент Kaspi арқылы бір батырмамен төлейді. Ақша лезде түседі. Интеграция қазірдің өзінде жұмыс істейді.' },
      { icon: '💬', title: 'WhatsApp арқылы жіберу', desc: 'Бір батырманы басыңыз — клиент шоттың әдемі бетін тікелей мессенджерден алады.' },
      { icon: '📋', title: 'КҰ, ОҚА, Жүкқұжат', desc: 'Барлық құжаттар ҚР стандарттары бойынша: Р-1 нысаны, 50-қосымша, З-2 нысаны. Банктер сұраусыз қабылдайды.' },
      { icon: '✍️', title: 'Қолтаңба мен мөр', desc: 'Бір рет жүктеңіз — барлық құжаттарда автоматты түрде пайда болады. ҚР ҰКО ЭЦҚ қолдауы бар.' },
      { icon: '📱', title: 'Телефонда жұмыс істейді', desc: 'Кездесуде, жолда, үйде шот жасаңыз. Кез келген құрылғыға қосымша ретінде орнатылады.' },
    ],
    stepsEyebrow: 'Қалай жұмыс істейді',
    stepsTitleLine1: 'Төлемге дейін',
    stepsTitleLine2: 'үш қадам',
    steps: [
      { n: '1', title: 'Деректемелерді енгізіңіз', desc: 'Компания деректерін бір рет толтырыңыз — БСН, ЖСК, БСК, КБЕ. Олар барлық құжаттарда автоматты түрде көрсетіледі.' },
      { n: '2', title: 'Құжат жасаңыз', desc: 'Клиентті көрсетіп, қызметтерді қосыңыз да «Жасау» батырмасын басыңыз. Қолтаңба мен мөрі бар PDF 30 секундта дайын.' },
      { n: '3', title: 'Жіберіңіз және ақша алыңыз', desc: 'Сілтемені WhatsApp арқылы жіберіңіз. Клиент шотты көріп, Kaspi Pay арқылы лезде төлейді.' },
    ],
    whoEyebrow: 'Мақсатты топ',
    whoTitle: 'Кімге арналған',
    who: [
      { icon: '👨‍💼', label: 'ЖК және фрилансерлер' },
      { icon: '🏢', label: 'Шағын бизнес' },
      { icon: '👩‍💻', label: 'IT компаниялар' },
      { icon: '🎨', label: 'Дизайнерлер' },
      { icon: '🔧', label: 'Мердігерлер' },
      { icon: '📦', label: 'Жеткізушілер' },
    ],
    pricingEyebrow: 'Тарифтер',
    pricingTitleLine1: 'Жасырын төлемдер',
    pricingTitleLine2: 'жоқ',
    pricingSubtitle: 'Қолайлы жоспарды таңдаңыз. Кез келген уақытта бас тартуға болады.',
    plans: [
      {
        badge: null, name: 'Тегін', price: '0', per: '₸',
        features: ['7 күндік тегін кезең', 'PDF генерациясы', 'Шоттар тарихы', 'Компания профилі', 'Жария сілтеме'],
        btn: 'outline', btnText: 'Тегін бастау',
      },
      {
        badge: 'Танымал', name: 'Базалық', price: '2 990', per: '₸/ай',
        features: ['Айына 30 шот', 'Қолтаңба мен мөрі бар PDF', 'Клиенттер анықтамалығы', 'Kaspi Pay интеграциясы', 'WhatsApp арқылы жіберу', 'WhatsApp арқылы қолдау'],
        btn: 'solid', btnText: '2 990 ₸-ге қосылу',
      },
      {
        badge: 'Максимум', name: 'Про', price: '5 990', per: '₸/ай',
        features: ['Шексіз шоттар', 'КҰ, ОҚА, Жүкқұжат', 'Email + WhatsApp арқылы жіберу', 'Аналитика және есептер', 'ҚР ҰКО ЭЦҚ (жақында)', 'Басым қолдау 24/7'],
        btn: 'solid', btnText: '5 990 ₸-ге қосылу',
      },
    ],
    faqEyebrow: 'FAQ',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faqs: [
      { q: 'Жұмыс істеу үшін ЭЦҚ керек пе?', a: 'Жоқ, ЭЦҚ міндетті емес. Сіз қолжазба қолтаңба мен мөрді жүктей аласыз. ҚР ҰКО ЭЦҚ интеграциясы әзірленуде.' },
      { q: 'Клиент шотты қалай алады?', a: 'Сіз сілтемені WhatsApp арқылы жібересіз. Клиент тіркелусіз шот бетін ашып, Kaspi Pay арқылы төлейді.' },
      { q: 'Банктер мұндай шоттарды қабылдай ма?', a: 'Иә. PDF құжаты ҚР стандарттарына сәйкес келеді — БСН, ЖСК, БСК, КБЕ және барлық қажетті деректемелерден тұрады.' },
      { q: 'Бірнеше құрылғыдан жұмыс істеуге бола ма?', a: 'Иә. INVOICES.KZ телефон, планшет және компьютер браузерінде жұмыс істейді. Барлық деректер синхрондалады.' },
      { q: 'Жазылымды қалай тоқтатуға болады?', a: 'Бізге WhatsApp-қа жазыңыз — бір сағат ішінде тоқтатамыз. Пайдаланылмаған кезең үшін ақшаны қайтарамыз.' },
    ],
    ctaTitle: 'Бастауға дайынсыз ба?',
    ctaSubtitle: '30 секундта тіркеліңіз — карта қажет емес',
    ctaButton: 'Алғашқы шотты жасау →',
    ctaNote: '7 күн тегін · Кез келген уақытта бас тартуға болады',
    footerLinks: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
      { label: 'Құпиялылық', href: '/privacy' },
      { label: 'Шарттар', href: '/terms' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · «First Project» ЖК · БСН 890525350143 · Астана қ.',
  },
  en: {
    navCta: 'Get Started →',
    heroBadge: '🇰🇿 Built for Kazakhstan businesses',
    heroTitleLine1: 'Invoices',
    heroTitleLine2: 'in 1 minute',
    heroSubtitle: 'Create professional invoices with your signature and stamp. Send via WhatsApp. Accept payment via Kaspi Pay.',
    heroPrimaryCta: 'Create your first invoice →',
    heroSecondaryCta: 'How it works',
    heroNote: '7 days free · No card required',
    phoneStatusPaid: 'Paid',
    phoneServiceLine: 'Consulting × 10',
    phoneVatLine: 'VAT 12%',
    phoneDownloadPdf: '📥 Download PDF',
    stats: [
      { val: '1 min', label: 'to create an invoice' },
      { val: '7+', label: 'businesses' },
      { val: '100%', label: 'KZ compliant' },
      { val: 'Kaspi', label: 'integration' },
    ],
    featuresEyebrow: 'Features',
    featuresTitleLine1: 'Everything for your',
    featuresTitleLine2: 'document workflow',
    featuresSubtitle: 'All the tools you need in one place — no accountant, no complex software.',
    features: [
      { icon: '⚡', title: 'Invoice in 1 minute', desc: 'Fill in client details, add services — the PDF is ready automatically with your signature and stamp.' },
      { icon: '💚', title: 'Payment via Kaspi Pay', desc: 'Your client pays in one click through Kaspi. Money arrives instantly. Integration already works.' },
      { icon: '💬', title: 'Send via WhatsApp', desc: 'One tap — your client gets a beautiful invoice page right in the messenger.' },
      { icon: '📋', title: 'Quotes, Acts, Delivery notes', desc: 'All documents follow KZ standards: Form Р-1, Appendix 50, Form З-2. Banks accept them without question.' },
      { icon: '✍️', title: 'Signature and stamp', desc: 'Upload once — they appear automatically on every document. Supports NCA RK digital signature.' },
      { icon: '📱', title: 'Works on your phone', desc: 'Create invoices at a meeting, on the road, at home. Installs as an app on any device.' },
    ],
    stepsEyebrow: 'How it works',
    stepsTitleLine1: 'Three steps',
    stepsTitleLine2: 'to get paid',
    steps: [
      { n: '1', title: 'Enter your details', desc: 'Fill in your company details once — BIN, IIK, BIK, KBe. They will appear automatically on every document.' },
      { n: '2', title: 'Create a document', desc: 'Enter the client, add services, and hit "Create". A signed and stamped PDF is ready in 30 seconds.' },
      { n: '3', title: 'Send it and get paid', desc: 'Send the link via WhatsApp. Your client sees the invoice and pays instantly via Kaspi Pay.' },
    ],
    whoEyebrow: 'Audience',
    whoTitle: "Who it's for",
    who: [
      { icon: '👨‍💼', label: 'Sole proprietors & freelancers' },
      { icon: '🏢', label: 'Small business' },
      { icon: '👩‍💻', label: 'IT companies' },
      { icon: '🎨', label: 'Designers' },
      { icon: '🔧', label: 'Contractors' },
      { icon: '📦', label: 'Suppliers' },
    ],
    pricingEyebrow: 'Pricing',
    pricingTitleLine1: 'No hidden',
    pricingTitleLine2: 'fees',
    pricingSubtitle: 'Choose the plan that fits. Cancel anytime.',
    plans: [
      {
        badge: null, name: 'Free', price: '0', per: '₸',
        features: ['7-day free trial', 'PDF generation', 'Invoice history', 'Company profile', 'Public link'],
        btn: 'outline', btnText: 'Start for free',
      },
      {
        badge: 'Popular', name: 'Basic', price: '2,990', per: '₸/mo',
        features: ['30 invoices per month', 'Signed & stamped PDF', 'Client directory', 'Kaspi Pay integration', 'Send via WhatsApp', 'WhatsApp support'],
        btn: 'solid', btnText: 'Subscribe for ₸2,990',
      },
      {
        badge: 'Maximum', name: 'Pro', price: '5,990', per: '₸/mo',
        features: ['Unlimited invoices', 'Quotes, Acts, Delivery notes', 'Email + WhatsApp sending', 'Analytics & reports', 'NCA RK digital signature (soon)', 'Priority 24/7 support'],
        btn: 'solid', btnText: 'Subscribe for ₸5,990',
      },
    ],
    faqEyebrow: 'FAQ',
    faqTitle: 'Frequently asked questions',
    faqs: [
      { q: 'Do I need a digital signature?', a: 'No, a digital signature is not required. You can upload a handwritten signature and stamp. NCA RK digital signature integration is in development.' },
      { q: 'How does the client receive the invoice?', a: 'You send a link via WhatsApp. The client opens the invoice page without registering and pays via Kaspi Pay.' },
      { q: 'Do banks accept these invoices?', a: 'Yes. The PDF document meets KZ standards — it includes BIN, IIK, BIK, KBe and all required details.' },
      { q: 'Can I work from multiple devices?', a: 'Yes. INVOICES.KZ works in the browser on phone, tablet, and computer. All data syncs automatically.' },
      { q: 'How do I cancel my subscription?', a: "Message us on WhatsApp — we'll cancel within an hour and refund any unused period." },
    ],
    ctaTitle: 'Ready to get started?',
    ctaSubtitle: 'Sign up in 30 seconds — no card required',
    ctaButton: 'Create your first invoice →',
    ctaNote: '7 days free · Cancel anytime',
    footerLinks: [
      { label: 'WhatsApp', href: 'https://wa.me/77763555177' },
      { label: 'Email', href: 'mailto:support@invoices.kz' },
      { label: 'Telegram', href: 'https://t.me/invoiceskz_support' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
    footerBottom: '© 2026 INVOICES.KZ · First Project Sole Proprietorship · BIN 890525350143 · Astana, Kazakhstan',
  },
}
