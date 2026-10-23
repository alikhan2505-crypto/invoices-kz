import { quarterStartLabel, type ToolLang, type ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/avr на трёх языках: и <head> (seo), и интерфейс.
// Русский — дословно прежний текст страницы (metadata из старого layout.tsx),
// чтобы не сбить уже набранную выдачу. Сам бланк акта (generateAVR, форма Р-1)
// остаётся русским на всех языках — см. docs/tools-i18n-pattern.md.
// Суммы приходят сюда уже отформатированными (formatTenge).

export interface AvrFaqItem {
  q: string
  a: string
}

export interface AvrDict {
  seo: ToolSeoCopy
  h1: string
  intro: (limit: number) => string
  /** Одна строка о том, что бланк выходит на русском. На ru — пусто. */
  docLangNote: string
  executorTitle: string
  companyLabel: string
  companyPlaceholder: string
  binLabel: string
  binPlaceholder: string
  directorLabel: string
  directorPlaceholder: string
  addressLabel: string
  /** Email продавца для рассылки — в документ НЕ печатается (только /api/tools/lead). */
  emailLabel: string
  marketingConsent: string
  privacyLink: string
  phoneLabel: string
  customerTitle: string
  clientNameLabel: string
  clientBinLabel: string
  clientAddressLabel: string
  docTitle: string
  numberLabel: string
  dateLabel: string
  contractNumberLabel: string
  contractDateLabel: string
  vatLabel: string
  vatOptions: { no_vat: string; vat_16: string; vat_0: string }
  itemPlaceholder: (n: number) => string
  qtyPlaceholder: string
  pricePlaceholder: string
  itemAria: (n: number) => string
  qtyAria: (n: number) => string
  priceAria: (n: number) => string
  removeRow: (n: number) => string
  addRow: string
  total: (amount: string) => string
  vatIncluded: (amount: string, rate: number) => string
  errors: {
    company: string
    bin: string
    client: string
    clientBin: string
    noRows: string
    rowName: (n: number) => string
    rowQty: (name: string) => string
    rowPrice: (name: string) => string
    zero: string
    popup: string
    /** Сервер лимита недоступен — документ не создан и не засчитан. */
    unavailable: string
    failed: string
  }
  limitTitle: (limit: number) => string
  /** Когда откроются новые бесплатные документы: начало следующего квартала словами. */
  limitReset: (iso: string) => string
  limitBody: string
  limitButton: string
  /** Тот же блок для вошедшего (с 15.10.2026): вместо фразы о регистрации — «продолжите в кабинете». */
  limitBodySignedIn: string
  generate: string
  remaining: (left: number, limit: number) => string
  /** Ссылка на гайд «документы ИП»; на en гайд русский — это помечено в тексте. */
  guideLink: string
  faqTitle: string
  faq: AvrFaqItem[]
}

export const avrDict: Record<ToolLang, AvrDict> = {
  ru: {
    seo: {
      title: 'Акт выполненных работ — образец, АВР онлайн',
      description:
        'Образец акта выполненных работ (АВР) для ИП и ТОО: заполните стороны и договор, скачайте PDF за минуту. НДС, сумма прописью. 3 акта в квартал бесплатно.',
      keywords:
        'авр образец казахстан, акт выполненных работ скачать, акт оказанных услуг ип, авр онлайн бесплатно, акт выполненных работ тоо, р-1 акт казахстан',
      ogTitle: 'АВР онлайн — акт выполненных работ за минуту',
      ogDescription: 'Реквизиты сторон, договор, НДС, сумма прописью. PDF без регистрации.',
      ogImageAlt: 'АВР онлайн — invoices.kz',
    },
    h1: 'Акт выполненных работ — онлайн, бесплатно',
    intro: n =>
      `Заполните стороны и работы — получите готовый АВР по привычной казахстанской форме, с суммой прописью и НДС, если нужен. Без регистрации, ${n} акта в квартал.`,
    docLangNote: '',
    executorTitle: 'Исполнитель — вы',
    companyLabel: 'Название ИП / ТОО *',
    companyPlaceholder: 'ИП Иванов / ТОО «Ромашка»',
    binLabel: 'БИН / ИИН *',
    binPlaceholder: '12 цифр',
    directorLabel: 'Руководитель',
    directorPlaceholder: 'для строки подписи',
    addressLabel: 'Адрес',
    emailLabel: 'Ваш email (необязательно)',
    marketingConsent: 'Присылать мне советы и новости invoices.kz на этот email (отписаться можно в любом письме).',
    privacyLink: 'Политика конфиденциальности',
    phoneLabel: 'Телефон',
    customerTitle: 'Заказчик',
    clientNameLabel: 'Название заказчика *',
    clientBinLabel: 'БИН / ИИН заказчика',
    clientAddressLabel: 'Адрес заказчика',
    docTitle: 'Акт',
    numberLabel: 'Номер *',
    dateLabel: 'Дата *',
    contractNumberLabel: 'Договор №',
    contractDateLabel: 'Дата договора',
    vatLabel: 'НДС',
    vatOptions: { no_vat: 'Без НДС', vat_16: 'С НДС 16%', vat_0: 'НДС 0%' },
    itemPlaceholder: n => `Работа или услуга ${n}`,
    qtyPlaceholder: 'Кол-во',
    pricePlaceholder: 'Цена, ₸',
    itemAria: n => `Наименование работы или услуги ${n}`,
    qtyAria: n => `Количество, строка ${n}`,
    priceAria: n => `Цена, строка ${n}`,
    removeRow: n => `Удалить строку ${n}`,
    addRow: '+ Добавить работу / услугу',
    total: s => `Итого: ${s}`,
    vatIncluded: (s, rate) => `в т.ч. НДС ${rate}%: ${s}`,
    errors: {
      company: 'Укажите название вашего ИП или ТОО (исполнитель)',
      bin: 'БИН/ИИН исполнителя — 12 цифр',
      client: 'Укажите название заказчика',
      clientBin: 'БИН/ИИН заказчика — 12 цифр (или оставьте пустым)',
      noRows: 'Добавьте хотя бы одну работу или услугу',
      rowName: n => `Укажите наименование работы или услуги в строке ${n}`,
      rowQty: name => `Укажите количество для «${name}»`,
      rowPrice: name => `Укажите цену для «${name}»`,
      zero: 'Сумма акта должна быть больше нуля',
      popup: 'Браузер заблокировал окно с актом — разрешите всплывающие окна для invoices.kz и нажмите ещё раз. Попытка не списана.',
      unavailable: 'Сервис временно недоступен — попробуйте через минуту. Акт не создан и не засчитан.',
      failed: 'Не удалось сформировать акт — попробуйте ещё раз.',
    },
    limitTitle: n => `Все ${n} бесплатных акта в этом квартале уже созданы`,
    limitReset: iso => `Новые бесплатные акты откроются ${quarterStartLabel('ru', iso)}.`,
    limitBody:
      'В кабинете invoices.kz на тарифе Про АВР создаётся из счёта в один клик: реквизиты и работы уже заполнены, номера считаются сами, подпись и печать — внутри PDF, подписание ЭЦП. Регистрация бесплатная.',
    limitButton: 'Зарегистрироваться бесплатно',
    limitBodySignedIn:
      'В кабинете invoices.kz на тарифе Про АВР создаётся из счёта в один клик: реквизиты и работы уже заполнены, номера считаются сами, подпись и печать — внутри PDF, подписание ЭЦП. Продолжите в кабинете invoices.kz.',
    generate: 'Создать АВР — откроется для печати и скачивания',
    remaining: (left, n) => `Осталось ${left} из ${n} бесплатных актов в этом квартале`,
    guideLink: 'Чем АВР отличается от счёта и накладной →',
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Когда нужен акт выполненных работ?',
        a: 'Когда вы выполнили работы или оказали услуги. АВР — первичный документ, которым заказчик подтверждает, что работа принята в полном объёме и претензий нет. Его подписывают обе стороны: заказчик по нему признаёт расход, а вы — доход. Для товаров вместо акта оформляют накладную.',
      },
      {
        q: 'Что такое форма Р-1?',
        a: 'Р-1 — форма акта выполненных работ (оказанных услуг), утверждённая Минфином РК. Генератор собирает акт именно по ней: стороны, договор, перечень работ, сумма прописью, подписи.',
      },
      {
        q: 'Если я выписываю ЭСФ, АВР всё равно нужен?',
        a: 'Да, это разные документы. ЭСФ — налоговый документ в системе ИС ЭСФ, а АВР — первичный документ о приёмке работ с подписью заказчика.',
      },
      {
        q: 'Как считается НДС 16%?',
        a: 'Цены вводятся уже с НДС. Сумма НДС выделяется из итога: итог × 16 / 116 — так же, как в самом акте. Ставка 16% действует с 1 января 2026 года.',
      },
      {
        q: 'Куда сохраняются мои данные?',
        a: 'Только в ваш браузер: черновик хранится на этом устройстве, чтобы не заполнять реквизиты заново. На наш сервер данные акта не отправляются — из введённого уходит только БИН/ИИН, если нажать «Найти», и ваш email — если вы его указали и оставили галочку согласия на рассылку (советы и новости invoices.kz, отписаться можно в любом письме). Лимит — 3 акта в квартал с одного подключения (IP-адреса) — считает сервер: адрес в открытом виде не хранится — только его хэш. Счётчик обнуляется 1 января, 1 апреля, 1 июля и 1 октября.',
      },
    ],
  },

  kk: {
    seo: {
      title: 'Орындалған жұмыстар актісінің үлгісі — онлайн',
      description:
        'ЖК және ЖШС үшін орындалған жұмыстар актісінің (ОЖА) үлгісі: тараптар мен шартты толтырып, бір минутта PDF жүктеңіз — тоқсанына 3 акт тегін.',
      keywords:
        'орындалған жұмыстар актісі, орындалған жұмыстар актісі үлгісі, көрсетілген қызметтер актісі, ожа онлайн, р-1 нысаны акт, жк орындалған жұмыстар актісі, жшс акт үлгісі, орындалған жұмыстар актісі pdf жүктеу',
      ogTitle: 'Орындалған жұмыстар актісі — бір минутта, тегін',
      ogDescription: 'Тараптар, шарт, ҚҚС, сомасы жазбаша. Тіркелусіз PDF.',
      ogImageAlt: 'Орындалған жұмыстар актісі онлайн — invoices.kz',
    },
    h1: 'Орындалған жұмыстар актісі — онлайн, тегін',
    intro: n =>
      `Тараптар мен жұмыстарды толтырыңыз — таныс қазақстандық нысандағы дайын актіні аласыз: сомасы жазбаша, қажет болса ҚҚС-пен. Тіркелусіз, тоқсанына ${n} акт.`,
    docLangNote: 'Акт бланкісі (Р-1 нысаны) орыс тілінде шығады — бухгалтерия қабылдайтын үйреншікті нысан.',
    executorTitle: 'Орындаушы — сіз',
    companyLabel: 'ЖК / ЖШС атауы *',
    companyPlaceholder: 'ЖК Сейітов / «Жұлдыз» ЖШС',
    binLabel: 'БСН / ЖСН *',
    binPlaceholder: '12 цифр',
    directorLabel: 'Басшы',
    directorPlaceholder: 'қол қою жолы үшін',
    addressLabel: 'Мекенжай',
    emailLabel: 'Сіздің email (міндетті емес)',
    marketingConsent: 'Осы email-ге invoices.kz кеңестері мен жаңалықтарын жіберіп тұрыңыз (кез келген хаттан бас тартуға болады).',
    privacyLink: 'Құпиялылық саясаты',
    phoneLabel: 'Телефон',
    customerTitle: 'Тапсырыс беруші',
    clientNameLabel: 'Тапсырыс берушінің атауы *',
    clientBinLabel: 'Тапсырыс берушінің БСН / ЖСН',
    clientAddressLabel: 'Тапсырыс берушінің мекенжайы',
    docTitle: 'Акт',
    numberLabel: 'Нөмірі *',
    dateLabel: 'Күні *',
    contractNumberLabel: 'Шарт №',
    contractDateLabel: 'Шарт күні',
    vatLabel: 'ҚҚС',
    vatOptions: { no_vat: 'ҚҚС-сыз', vat_16: 'ҚҚС 16% қоса алғанда', vat_0: 'ҚҚС 0%' },
    itemPlaceholder: n => `Жұмыс немесе қызмет ${n}`,
    qtyPlaceholder: 'Саны',
    pricePlaceholder: 'Бағасы, ₸',
    itemAria: n => `${n}-жұмыстың немесе қызметтің атауы`,
    qtyAria: n => `${n}-жолдағы саны`,
    priceAria: n => `${n}-жолдағы бағасы`,
    removeRow: n => `${n}-жолды өшіру`,
    addRow: '+ Жұмыс / қызмет қосу',
    total: s => `Барлығы: ${s}`,
    vatIncluded: (s, rate) => `оның ішінде ҚҚС ${rate}%: ${s}`,
    errors: {
      company: 'ЖК немесе ЖШС атауын көрсетіңіз (орындаушы)',
      bin: 'Орындаушының БСН/ЖСН-і — 12 цифр',
      client: 'Тапсырыс берушінің атауын көрсетіңіз',
      clientBin: 'Тапсырыс берушінің БСН/ЖСН-і — 12 цифр (немесе бос қалдырыңыз)',
      noRows: 'Кемінде бір жұмыс немесе қызмет қосыңыз',
      rowName: n => `${n}-жолдағы жұмыстың немесе қызметтің атауын көрсетіңіз`,
      rowQty: name => `«${name}» үшін санын көрсетіңіз`,
      rowPrice: name => `«${name}» үшін бағасын көрсетіңіз`,
      zero: 'Акт сомасы нөлден көп болуы керек',
      popup: 'Браузер акт терезесін бұғаттап тастады — invoices.kz үшін қалқымалы терезелерге рұқсат беріп, қайта басыңыз. Бұл әрекет есепке алынбады.',
      unavailable: 'Сервис уақытша қолжетімсіз — бір минуттан соң қайталап көріңіз. Акт жасалған жоқ және есепке алынбады.',
      failed: 'Актіні жасау мүмкін болмады — қайталап көріңіз.',
    },
    limitTitle: n => `Осы тоқсандағы ${n} тегін актінің бәрі жасалып қойды`,
    limitReset: iso => `Жаңа тегін актілер ${quarterStartLabel('kk', iso)} ашылады.`,
    limitBody:
      'invoices.kz кабинетінде Про тарифінде акт шоттан бір басумен жасалады: деректемелер мен жұмыстар толтырылып тұрады, нөмірлер өздігінен қойылады, қолтаңба мен мөр PDF ішінде, ЭЦҚ-мен қол қоюға болады. Тіркелу тегін.',
    limitButton: 'Тегін тіркелу',
    limitBodySignedIn:
      'invoices.kz кабинетінде Про тарифінде акт шоттан бір басумен жасалады: деректемелер мен жұмыстар толтырылып тұрады, нөмірлер өздігінен қойылады, қолтаңба мен мөр PDF ішінде, ЭЦҚ-мен қол қоюға болады. Жұмысты invoices.kz кабинетінде жалғастырыңыз.',
    generate: 'Акт жасау — басып шығаруға және жүктеуге ашылады',
    remaining: (left, n) => `Осы тоқсанда қалған тегін акт: ${left} / ${n}`,
    guideLink: 'ОЖА төлем шоты мен жүкқұжаттан немен ерекшеленеді →',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: 'Орындалған жұмыстар актісі қашан керек?',
        a: 'Жұмысты орындап немесе қызметті көрсетіп болғанда. ОЖА — тапсырыс берушінің жұмысты толық көлемде қабылдағанын және ешқандай наразылығы жоқ екенін растайтын бастапқы құжат. Оған екі тарап қол қояды: тапсырыс беруші соның негізінде шығысты таниды, ал сіз — кірісті. Тауар үшін актінің орнына жүкқұжат рәсімделеді.',
      },
      {
        q: 'Р-1 нысаны дегеніміз не?',
        a: 'Р-1 — ҚР Қаржы министрлігі бекіткен Орындалған жұмыстар (көрсетілген қызметтер) актісінің нысаны. Генератор актіні дәл осы нысан бойынша жасайды: тараптар, шарт, жұмыстар тізбесі, сомасы жазбаша, қолтаңбалар.',
      },
      {
        q: 'ЭШФ жазсам да, акт керек пе?',
        a: 'Иә, бұлар — әртүрлі құжаттар. ЭШФ — ЭШФ ақпараттық жүйесіндегі салық құжаты, ал ОЖА — жұмыстың қабылданғанын тапсырыс берушінің қолымен растайтын бастапқы құжат.',
      },
      {
        q: 'ҚҚС 16% қалай есептеледі?',
        a: 'Бағалар ҚҚС-ты қоса алғанда енгізіледі. ҚҚС сомасы жалпы сомадан бөлініп шығарылады: сома × 16 / 116 — актінің өзіндегідей. 16% мөлшерлеме 2026 жылғы 1 қаңтардан бастап қолданылады.',
      },
      {
        q: 'Деректерім қайда сақталады?',
        a: 'Тек сіздің браузеріңізде: деректемелерді қайта толтырмау үшін нобай осы құрылғыда сақталады. Акт деректері біздің серверге жіберілмейді — енгізген деректеріңізден «Табу» батырмасын басқанда ғана БСН/ЖСН жіберіледі, сондай-ақ сіздің email — егер оны көрсетіп, таратылымға келісім белгісін қалдырсаңыз (invoices.kz кеңестері мен жаңалықтары, кез келген хаттан бас тартуға болады). Шектеуді — бір қосылымнан (IP-мекенжайдан) тоқсанына 3 акт — сервер санайды: мекенжай ашық түрде сақталмайды — оның орнына хэші сақталады. Есептегіш 1 қаңтарда, 1 сәуірде, 1 шілдеде және 1 қазанда нөлденеді.',
      },
    ],
  },

  en: {
    seo: {
      title: 'Completed Works Certificate (AVR) Template — PDF',
      description:
        'Completed works certificate (AVR, form R-1) template for Kazakhstan: fill in the parties and contract, get a PDF in a minute. 3 free per quarter.',
      keywords:
        'kazakhstan certificate of completed works, avr kazakhstan, act of completed works kazakhstan template, acceptance certificate kazakhstan, services rendered act kazakhstan, r-1 form kazakhstan, kazakhstan avr pdf free',
      ogTitle: 'Kazakhstan certificate of completed works (AVR) — free, in a minute',
      ogDescription: 'The standard Kazakhstan AVR (form R-1): parties, contract, VAT, total in words. PDF without sign-up.',
      ogImageAlt: 'Kazakhstan AVR generator — invoices.kz',
    },
    h1: 'Kazakhstan certificate of completed works (AVR) — online, free',
    intro: n =>
      `Fill in the parties and the work done to get a ready AVR — the act of completed works (services rendered) on the familiar Kazakhstan form, with the total in words and VAT if needed. You will need your 12-digit BIN or IIN (business / individual identification number). No sign-up, ${n} certificates per quarter.`,
    docLangNote: 'The certificate is generated in Russian (form R-1) — the standard form that accountants and counterparties in Kazakhstan accept.',
    executorTitle: 'Contractor — you',
    companyLabel: 'Sole proprietor (IE) / LLP name *',
    companyPlaceholder: 'IE Ivanov / Romashka LLP',
    binLabel: 'BIN / IIN *',
    binPlaceholder: '12 digits',
    directorLabel: 'Director',
    directorPlaceholder: 'for the signature line',
    addressLabel: 'Address',
    emailLabel: 'Your email (optional)',
    marketingConsent: 'Send me invoices.kz tips and news at this email (unsubscribe from any email).',
    privacyLink: 'Privacy policy',
    phoneLabel: 'Phone',
    customerTitle: 'Customer',
    clientNameLabel: 'Customer name *',
    clientBinLabel: 'Customer BIN / IIN',
    clientAddressLabel: 'Customer address',
    docTitle: 'Certificate',
    numberLabel: 'Number *',
    dateLabel: 'Date *',
    contractNumberLabel: 'Contract No.',
    contractDateLabel: 'Contract date',
    vatLabel: 'VAT',
    vatOptions: { no_vat: 'No VAT', vat_16: 'VAT 16% included', vat_0: 'VAT 0%' },
    itemPlaceholder: n => `Work or service ${n}`,
    qtyPlaceholder: 'Qty',
    pricePlaceholder: 'Price, ₸',
    itemAria: n => `Work or service ${n} name`,
    qtyAria: n => `Quantity, row ${n}`,
    priceAria: n => `Price, row ${n}`,
    removeRow: n => `Remove row ${n}`,
    addRow: '+ Add work / service',
    total: s => `Total: ${s}`,
    vatIncluded: (s, rate) => `incl. VAT ${rate}%: ${s}`,
    errors: {
      company: 'Enter the name of your sole proprietorship or LLP (contractor)',
      bin: 'Contractor BIN/IIN must be 12 digits',
      client: 'Enter the customer name',
      clientBin: 'Customer BIN/IIN must be 12 digits (or leave it empty)',
      noRows: 'Add at least one work item or service',
      rowName: n => `Enter the work or service name in row ${n}`,
      rowQty: name => `Enter a quantity for “${name}”`,
      rowPrice: name => `Enter a price for “${name}”`,
      zero: 'The certificate total must be greater than zero',
      popup: 'Your browser blocked the certificate window — allow pop-ups for invoices.kz and click again. This attempt was not counted.',
      unavailable: 'The service is temporarily unavailable — try again in a minute. No certificate was created or counted.',
      failed: 'Could not build the certificate — please try again.',
    },
    limitTitle: n => `You've used all ${n} free certificates for this quarter`,
    limitReset: iso => `New free certificates unlock on ${quarterStartLabel('en', iso)}.`,
    limitBody:
      'On the Pro plan in an invoices.kz account an AVR is created from an invoice in one click: your details and services are already filled in, numbering is automatic, the signature and stamp are inside the PDF, and it can be signed with a digital signature (EDS). Sign-up is free.',
    limitButton: 'Sign up for free',
    limitBodySignedIn:
      'On the Pro plan in your invoices.kz account an AVR is created from an invoice in one click: your details and services are already filled in, numbering is automatic, the signature and stamp are inside the PDF, and it can be signed with a digital signature (EDS). Continue in your invoices.kz account.',
    generate: 'Create the AVR — opens for printing and download',
    remaining: (left, n) => `${left} of ${n} free certificates left this quarter`,
    guideLink: 'AVR vs invoice vs delivery note (in Russian) →',
    faqTitle: 'FAQ',
    faq: [
      {
        q: 'When do I need a certificate of completed works (AVR)?',
        a: 'Whenever you have performed work or rendered services in Kazakhstan. The AVR is the primary accounting document in which the customer confirms the work was accepted in full with no claims. Both parties sign it: the customer books the expense on it, and you book the income. For goods, a delivery note is used instead.',
      },
      {
        q: 'What is form R-1?',
        a: 'R-1 is the form of the certificate of completed works (services rendered) approved by the Ministry of Finance of Kazakhstan. The generator builds the certificate on exactly this form: parties, contract, list of works, total in words, signatures.',
      },
      {
        q: 'I already issue an e-invoice (ESF). Do I still need an AVR?',
        a: 'Yes — they are different documents. The ESF is a tax document in the state e-invoicing system, while the AVR is the primary record that the work was accepted, signed by the customer.',
      },
      {
        q: 'How is 16% VAT calculated?',
        a: 'Prices are entered VAT-inclusive. VAT is extracted from the total as total × 16 / 116 — exactly as in the certificate itself. The 16% rate applies from 1 January 2026.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Only in your browser: the draft stays on this device so you don’t have to retype your details. Certificate data is never sent to our server — of what you type, only the BIN/IIN when you click “Find”, plus your email if you entered it and left the newsletter consent box ticked (invoices.kz tips and news; unsubscribe from any email). The limit — 3 certificates per quarter per connection (IP address) — is counted on our server: the address is not stored in plain form, only a hash of it. The counter resets on 1 January, 1 April, 1 July and 1 October.',
      },
    ],
  },
}
