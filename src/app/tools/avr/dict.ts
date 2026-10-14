import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'

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
  vatIncluded: (amount: string) => string
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
  }
  limitTitle: (limit: number) => string
  limitBody: string
  limitButton: string
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
      title: 'АВР онлайн — акт выполненных работ бесплатно за минуту',
      description:
        'Создайте акт выполненных работ (оказанных услуг) для ИП или ТОО Казахстана онлайн: реквизиты сторон, договор, НДС, сумма прописью. Готовый PDF за минуту, без регистрации — 3 акта в день бесплатно.',
      keywords:
        'авр образец казахстан, акт выполненных работ скачать, акт оказанных услуг ип, авр онлайн бесплатно, акт выполненных работ тоо, р-1 акт казахстан',
      ogTitle: 'АВР онлайн — акт выполненных работ за минуту',
      ogDescription: 'Реквизиты сторон, договор, НДС, сумма прописью. PDF без регистрации.',
      ogImageAlt: 'АВР онлайн — invoices.kz',
    },
    h1: 'Акт выполненных работ — онлайн, бесплатно',
    intro: n =>
      `Заполните стороны и работы — получите готовый АВР по привычной казахстанской форме, с суммой прописью и НДС, если нужен. Без регистрации, ${n} акта в день.`,
    docLangNote: '',
    executorTitle: 'Исполнитель — вы',
    companyLabel: 'Название ИП / ТОО *',
    companyPlaceholder: 'ИП Иванов / ТОО «Ромашка»',
    binLabel: 'БИН / ИИН *',
    binPlaceholder: '12 цифр',
    directorLabel: 'Руководитель',
    directorPlaceholder: 'для строки подписи',
    addressLabel: 'Адрес',
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
    addRow: '+ Добавить строку',
    total: s => `Итого: ${s}`,
    vatIncluded: s => `в т. ч. НДС 16%: ${s}`,
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
    },
    limitTitle: n => `${n} бесплатных акта на сегодня созданы`,
    limitBody:
      'В кабинете invoices.kz АВР создаётся из счёта в один клик: реквизиты и работы уже заполнены, номера считаются сами, подпись и печать — внутри PDF, подписание ЭЦП. Регистрация бесплатная.',
    limitButton: 'Зарегистрироваться бесплатно',
    generate: 'Создать АВР — откроется для печати и скачивания',
    remaining: (left, n) => `Осталось ${left} из ${n} бесплатных актов сегодня`,
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
        a: 'Только в ваш браузер: черновик хранится на этом устройстве, чтобы не заполнять реквизиты заново. На наш сервер данные акта не отправляются.',
      },
    ],
  },

  kk: {
    seo: {
      title: 'Орындалған жұмыстар актісі (ОЖА) онлайн — тегін, бір минутта',
      description:
        'Қазақстандағы ЖК немесе ЖШС үшін Орындалған жұмыстар (көрсетілген қызметтер) актісін онлайн жасаңыз: тараптардың деректемелері, шарт, ҚҚС, сомасы жазбаша. Тіркелусіз бір минутта дайын PDF — күніне 3 акт тегін.',
      keywords:
        'орындалған жұмыстар актісі, орындалған жұмыстар актісі үлгісі, көрсетілген қызметтер актісі, ожа онлайн, р-1 нысаны акт, жк орындалған жұмыстар актісі, жшс акт үлгісі, орындалған жұмыстар актісі pdf жүктеу',
      ogTitle: 'Орындалған жұмыстар актісі — бір минутта, тегін',
      ogDescription: 'Тараптар, шарт, ҚҚС, сомасы жазбаша. Тіркелусіз PDF.',
      ogImageAlt: 'Орындалған жұмыстар актісі онлайн — invoices.kz',
    },
    h1: 'Орындалған жұмыстар актісі — онлайн, тегін',
    intro: n =>
      `Тараптар мен жұмыстарды толтырыңыз — таныс қазақстандық нысандағы дайын актіні аласыз: сомасы жазбаша, қажет болса ҚҚС-пен. Тіркелусіз, күніне ${n} акт.`,
    docLangNote: 'Акт бланкісі (Р-1 нысаны) орыс тілінде шығады — бухгалтерия қабылдайтын үйреншікті нысан.',
    executorTitle: 'Орындаушы — сіз',
    companyLabel: 'ЖК / ЖШС атауы *',
    companyPlaceholder: 'ЖК Сейітов / «Жұлдыз» ЖШС',
    binLabel: 'БСН / ЖСН *',
    binPlaceholder: '12 цифр',
    directorLabel: 'Басшы',
    directorPlaceholder: 'қол қою жолы үшін',
    addressLabel: 'Мекенжай',
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
    addRow: '+ Жол қосу',
    total: s => `Барлығы: ${s}`,
    vatIncluded: s => `оның ішінде ҚҚС 16%: ${s}`,
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
    },
    limitTitle: n => `Бүгінгі ${n} тегін актінің бәрі пайдаланылды`,
    limitBody:
      'invoices.kz кабинетінде акт шоттан бір басумен жасалады: деректемелер мен жұмыстар толтырылып тұрады, нөмірлер өздігінен қойылады, қолтаңба мен мөр PDF ішінде, ЭЦҚ-мен қол қоюға болады. Тіркелу тегін.',
    limitButton: 'Тегін тіркелу',
    generate: 'Акт жасау — басып шығаруға және жүктеуге ашылады',
    remaining: (left, n) => `Бүгін тағы ${left} тегін акт қалды (күніне ${n})`,
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
        a: 'Тек сіздің браузеріңізде: деректемелерді қайта толтырмау үшін нобай осы құрылғыда сақталады. Акт деректері біздің серверге жіберілмейді.',
      },
    ],
  },

  en: {
    seo: {
      title: 'Kazakhstan Certificate of Completed Works (AVR) Generator — Free PDF',
      description:
        'Create a Kazakhstan certificate of completed works or services rendered (AVR, form R-1) online for a sole proprietor (IE) or LLP: party details, contract, VAT, total in words. Ready PDF in a minute, no sign-up, 3 certificates a day free.',
      keywords:
        'kazakhstan certificate of completed works, avr kazakhstan, act of completed works kazakhstan template, acceptance certificate kazakhstan, services rendered act kazakhstan, r-1 form kazakhstan, kazakhstan avr pdf free',
      ogTitle: 'Kazakhstan certificate of completed works (AVR) — free, in a minute',
      ogDescription: 'The standard Kazakhstan AVR (form R-1): parties, contract, VAT, total in words. PDF without sign-up.',
      ogImageAlt: 'Kazakhstan AVR generator — invoices.kz',
    },
    h1: 'Kazakhstan certificate of completed works (AVR) — online, free',
    intro: n =>
      `Fill in the parties and the work done to get a ready AVR — the act of completed works (services rendered) on the familiar Kazakhstan form, with the total in words and VAT if needed. You will need your 12-digit BIN or IIN (business / individual identification number). No sign-up, ${n} certificates per day.`,
    docLangNote: 'The certificate is generated in Russian (form R-1) — the standard form that accountants and counterparties in Kazakhstan accept.',
    executorTitle: 'Contractor — you',
    companyLabel: 'Sole proprietor (IE) / LLP name *',
    companyPlaceholder: 'IE Ivanov / Romashka LLP',
    binLabel: 'BIN / IIN *',
    binPlaceholder: '12 digits',
    directorLabel: 'Director',
    directorPlaceholder: 'for the signature line',
    addressLabel: 'Address',
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
    addRow: '+ Add row',
    total: s => `Total: ${s}`,
    vatIncluded: s => `incl. VAT 16%: ${s}`,
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
    },
    limitTitle: n => `All ${n} free certificates for today are used`,
    limitBody:
      'In an invoices.kz account an AVR is created from an invoice in one click: your details and services are already filled in, numbering is automatic, the signature and stamp are inside the PDF, and it can be signed with a digital signature (EDS). Sign-up is free.',
    limitButton: 'Sign up for free',
    generate: 'Create the AVR — opens for printing and download',
    remaining: (left, n) => `${left} of ${n} free certificates left today`,
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
        a: 'Only in your browser: the draft stays on this device so you don’t have to retype your details. Certificate data is never sent to our server.',
      },
    ],
  },
}
