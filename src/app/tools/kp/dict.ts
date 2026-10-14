import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/kp на трёх языках: и <head> (seo), и интерфейс.
// Русский seo — дословно прежний layout.tsx, чтобы не сбить уже набранную
// выдачу. Сам документ (generateKP) печатается только по-русски — это
// юридическая форма, а не язык страницы (docs/tools-i18n-pattern.md).

export interface KpDict {
  seo: ToolSeoCopy
  h1: string
  intro: string
  /** Одна строка на kk/en: документ формируется на русском. На ru — пусто. */
  docLangNote: string
  fromTitle: string
  companyLabel: string
  companyPlaceholder: string
  binLabel: string
  binPlaceholder: string
  phoneLabel: string
  directorLabel: string
  directorPlaceholder: string
  addressLabel: string
  offerTitle: string
  clientLabel: string
  clientPlaceholder: string
  numberLabel: string
  dateLabel: string
  validLabel: string
  validHint: string
  vatLabel: string
  vatNo: string
  vat16: string
  vat0: string
  vat16Hint: string
  rowPlaceholder: (n: number) => string
  qtyPlaceholder: string
  pricePlaceholder: string
  removeRow: (n: number) => string
  addRow: string
  totalLabel: string
  vatIncluded: (amount: string) => string
  noteLabel: string
  errCompany: string
  errBin: string
  errClient: string
  errNoRows: string
  errRowName: (n: number) => string
  errRowQty: (n: number) => string
  errTotal: string
  /** Браузер не дал открыть окно с КП — попытка не списана. */
  errPopup: string
  generate: string
  remaining: (left: number, limit: number) => string
  limitTitle: (limit: number) => string
  limitBody: string
  limitButton: string
  nextStep: string
  faqTitle: string
  faq: Array<{ q: string; a: string }>
}

export const kpDict: Record<ToolLang, KpDict> = {
  ru: {
    seo: {
      title: 'Коммерческое предложение онлайн — КП бесплатно за минуту',
      description:
        'Создайте коммерческое предложение для клиента онлайн: позиции с ценами, срок действия, НДС, реквизиты. Готовый PDF за минуту, без регистрации — 3 КП в день бесплатно.',
      keywords:
        'коммерческое предложение образец казахстан, кп скачать бесплатно, коммерческое предложение ип, как составить кп, коммерческое предложение на услуги образец',
      ogTitle: 'Коммерческое предложение онлайн — за минуту',
      ogDescription: 'Позиции с ценами, срок действия, НДС, реквизиты. PDF без регистрации.',
      ogImageAlt: 'КП онлайн — invoices.kz',
    },
    h1: 'Коммерческое предложение — онлайн, бесплатно',
    intro:
      'Заполните позиции и цены — получите аккуратное КП с итоговой суммой и сроком действия. Без регистрации, 3 предложения в день.',
    docLangNote: '',
    fromTitle: 'От кого',
    companyLabel: 'Название ИП / ТОО *',
    companyPlaceholder: 'ИП Иванов / ТОО «Ромашка»',
    binLabel: 'БИН / ИИН *',
    binPlaceholder: '12 цифр',
    phoneLabel: 'Контактный телефон',
    directorLabel: 'Руководитель',
    directorPlaceholder: 'для строки подписи',
    addressLabel: 'Адрес',
    offerTitle: 'Предложение',
    clientLabel: 'Кому *',
    clientPlaceholder: 'ТОО «Клиент»',
    numberLabel: 'Номер *',
    dateLabel: 'Дата *',
    validLabel: 'Действует до',
    validHint: 'Не указали — 30 дней',
    vatLabel: 'НДС',
    vatNo: 'Без НДС',
    vat16: 'С НДС 16%',
    vat0: 'НДС 0%',
    vat16Hint: 'Цены указывайте с НДС — сумма налога выделится в итоге КП.',
    rowPlaceholder: n => `Товар или услуга ${n}`,
    qtyPlaceholder: 'Кол-во',
    pricePlaceholder: 'Цена, ₸',
    removeRow: n => `Удалить позицию ${n}`,
    addRow: '+ Добавить позицию',
    totalLabel: 'Итого',
    vatIncluded: a => `в т.ч. НДС 16%: ${a}`,
    noteLabel: 'Примечание (условия, сроки, доставка)',
    errCompany: 'Укажите название вашего ИП или ТОО',
    errBin: 'БИН/ИИН — 12 цифр',
    errClient: 'Укажите, кому адресовано предложение',
    errNoRows: 'Добавьте хотя бы одну позицию',
    errRowName: n => `Позиция ${n}: укажите название — без него она не попадёт в КП`,
    errRowQty: n => `Позиция ${n}: количество должно быть больше нуля`,
    errTotal: 'Сумма предложения должна быть больше нуля',
    errPopup: 'Браузер заблокировал окно с КП — разрешите всплывающие окна для invoices.kz и нажмите ещё раз. Эта попытка не засчитана.',
    generate: 'Создать КП — откроется для печати и скачивания',
    remaining: (left, limit) => `Осталось ${left} из ${limit} бесплатных КП сегодня`,
    limitTitle: limit => `${limit} бесплатных КП на сегодня созданы`,
    limitBody:
      'В кабинете invoices.kz КП превращается в счёт одним кликом, когда клиент согласился: реквизиты сохранены, номера считаются сами, а оплату можно принять через Kaspi. Регистрация бесплатная.',
    limitButton: 'Зарегистрироваться бесплатно',
    nextStep: 'Клиент согласился? Выставить счёт →',
    faqTitle: 'Коротко о КП',
    faq: [
      {
        q: 'Что указать в коммерческом предложении?',
        a: 'Кто предлагает (название, БИН/ИИН, контакты), кому и что именно — позиции с количеством и ценой, итоговую сумму, срок действия и условия: сроки, доставку, порядок оплаты. Этого достаточно, чтобы клиент сравнил предложения и принял решение.',
      },
      {
        q: 'КП с НДС или без?',
        a: 'Если вы плательщик НДС — выберите «С НДС 16%» и указывайте цены с налогом: сумма НДС выделится в итоге. Если нет — «Без НДС». НДС 0% — для операций, облагаемых по нулевой ставке, например экспорта товаров.',
      },
      {
        q: 'Нужны ли подпись и печать?',
        a: 'Для КП это не обязательно: это предложение, а не первичный документ. Строка для подписи руководителя в документе есть — её можно подписать после печати.',
      },
      {
        q: 'Клиент согласился — что дальше?',
        a: 'Выставить счёт на оплату, а после выполнения работ или отгрузки — оформить АВР или накладную. Счёт можно сделать здесь же, бесплатно.',
      },
    ],
  },

  kk: {
    seo: {
      title: 'Коммерциялық ұсыныс онлайн — бір минутта, тегін',
      description:
        'Клиентке коммерциялық ұсынысты онлайн жасаңыз: бағасы көрсетілген позициялар, қолданылу мерзімі, ҚҚС, деректемелер. Дайын PDF бір минутта, тіркелусіз — күніне 3 ұсыныс тегін.',
      keywords:
        'коммерциялық ұсыныс үлгісі, коммерциялық ұсыныс жазу, коммерциялық ұсыныс қазақша, коммерциялық ұсыныс тегін, ЖК коммерциялық ұсыныс, қызмет көрсетуге коммерциялық ұсыныс үлгісі, КҰ жасау онлайн',
      ogTitle: 'Коммерциялық ұсыныс онлайн — бір минутта',
      ogDescription: 'Бағасы бар позициялар, мерзімі, ҚҚС, деректемелер. Тіркелусіз PDF.',
      ogImageAlt: 'Коммерциялық ұсыныс онлайн — invoices.kz',
    },
    h1: 'Коммерциялық ұсыныс — онлайн, тегін',
    intro:
      'Позициялар мен бағаларды толтырыңыз — жалпы сомасы мен қолданылу мерзімі көрсетілген ұқыпты коммерциялық ұсыныс (КҰ) аласыз. Тіркелусіз, күніне 3 ұсыныс.',
    docLangNote: 'Ұсыныстың өзі орыс тілінде жасалады — Қазақстанда іскерлік құжаттарға кеңінен қабылданған үлгі.',
    fromTitle: 'Кімнен',
    companyLabel: 'ЖК / ЖШС атауы *',
    companyPlaceholder: 'ЖК Серіков / «Шұғыла» ЖШС',
    binLabel: 'БСН / ЖСН *',
    binPlaceholder: '12 цифр',
    phoneLabel: 'Байланыс телефоны',
    directorLabel: 'Басшы',
    directorPlaceholder: 'қол қою жолы үшін',
    addressLabel: 'Мекенжай',
    offerTitle: 'Ұсыныс',
    clientLabel: 'Кімге *',
    clientPlaceholder: '«Клиент» ЖШС',
    numberLabel: 'Нөмірі *',
    dateLabel: 'Күні *',
    validLabel: 'Қай күнге дейін жарамды',
    validHint: 'Бос қалса — 30 күн',
    vatLabel: 'ҚҚС',
    vatNo: 'ҚҚС-сыз',
    vat16: 'ҚҚС 16% қоса алғанда',
    vat0: 'ҚҚС 0%',
    vat16Hint: 'Бағаларды ҚҚС-ты қоса жазыңыз — салық сомасы КҰ қорытындысында бөлек көрсетіледі.',
    rowPlaceholder: n => `Тауар немесе қызмет ${n}`,
    qtyPlaceholder: 'Саны',
    pricePlaceholder: 'Бағасы, ₸',
    removeRow: n => `${n}-позицияны жою`,
    addRow: '+ Позиция қосу',
    totalLabel: 'Барлығы',
    vatIncluded: a => `оның ішінде ҚҚС 16%: ${a}`,
    noteLabel: 'Ескертпе (шарттар, мерзімдер, жеткізу)',
    errCompany: 'ЖК немесе ЖШС атауын көрсетіңіз',
    errBin: 'БСН/ЖСН — 12 цифр',
    errClient: 'Ұсыныс кімге арналғанын көрсетіңіз',
    errNoRows: 'Кемінде бір позиция қосыңыз',
    errRowName: n => `${n}-позиция: атауын жазыңыз — атауы жоқ позиция КҰ-ға кірмейді`,
    errRowQty: n => `${n}-позиция: саны нөлден көп болуы керек`,
    errTotal: 'Ұсыныс сомасы нөлден көп болуы керек',
    errPopup: 'Браузер КҰ терезесін бұғаттап тастады — invoices.kz үшін қалқымалы терезелерге рұқсат беріп, қайта басыңыз. Бұл әрекет есепке алынбады.',
    generate: 'КҰ жасау — басып шығаруға және жүктеп алуға ашылады',
    remaining: (left, limit) => `Бүгінге қалған тегін КҰ: ${left} / ${limit}`,
    limitTitle: limit => `Бүгінгі ${limit} тегін КҰ жасалып қойды`,
    limitBody:
      'invoices.kz кабинетінде клиент келіскен соң КҰ бір басумен шотқа айналады: деректемелер сақталады, нөмірлер өзі қойылады, ал төлемді Kaspi арқылы қабылдауға болады. Тіркелу тегін.',
    limitButton: 'Тегін тіркелу',
    nextStep: 'Клиент келісті ме? Шот жазу →',
    faqTitle: 'КҰ туралы қысқаша',
    faq: [
      {
        q: 'Коммерциялық ұсынысқа не жазу керек?',
        a: 'Кім ұсынады (атауы, БСН/ЖСН, байланыс деректері), кімге және нақты не — саны мен бағасы көрсетілген позициялар, жалпы сома, қолданылу мерзімі және шарттар: мерзімдер, жеткізу, төлеу тәртібі. Клиент ұсыныстарды салыстырып, шешім қабылдауы үшін осы жеткілікті.',
      },
      {
        q: 'КҰ ҚҚС-пен бе, әлде ҚҚС-сыз ба?',
        a: 'ҚҚС төлеушісі болсаңыз — «ҚҚС 16% қоса алғанда» дегенді таңдап, бағаларды салықпен бірге жазыңыз: ҚҚС сомасы қорытындыда бөлек шығады. Төлеуші болмасаңыз — «ҚҚС-сыз». ҚҚС 0% — нөлдік мөлшерлеме қолданылатын операциялар үшін, мысалы, тауар экспорты.',
      },
      {
        q: 'Қол мен мөр қажет пе?',
        a: 'КҰ үшін міндетті емес: бұл бастапқы құжат емес, ұсыныс қана. Құжатта басшының қолына арналған жол бар — басып шығарған соң қол қоюға болады.',
      },
      {
        q: 'Клиент келісті — әрі қарай не істеймін?',
        a: 'Төлемге шот жазыңыз, ал жұмыс орындалған немесе тауар жөнелтілген соң Орындалған жұмыстар актісін (ОЖА) не жүкқұжатты ресімдеңіз. Шотты осы жерде тегін жасауға болады.',
      },
    ],
  },

  en: {
    seo: {
      title: 'Commercial Proposal Generator for Kazakhstan — Free PDF in a Minute',
      description:
        'Create a commercial proposal (quote) for a client in Kazakhstan online: items with prices in tenge, validity date, VAT and your business details. Ready PDF in a minute, no sign-up — 3 free proposals a day.',
      keywords:
        'commercial proposal template kazakhstan, quotation template kazakhstan, free quote generator pdf, price quote kazakhstan tenge, business proposal kazakhstan, kommercheskoe predlozhenie template',
      ogTitle: 'Commercial proposal generator for Kazakhstan',
      ogDescription: 'Items with prices, validity date, VAT, business details. Free PDF, no sign-up.',
      ogImageAlt: 'Commercial proposal online — invoices.kz',
    },
    h1: 'Commercial proposal — online, free',
    intro:
      'Fill in items and prices to get a clean commercial proposal (quote) with a total and a validity date. No sign-up, 3 proposals a day.',
    docLangNote: 'The proposal itself is generated in Russian, the standard language for business paperwork in Kazakhstan.',
    fromTitle: 'From',
    companyLabel: 'Your business name *',
    companyPlaceholder: 'As registered, e.g. ИП Ivanov / ТОО «Alpha»',
    binLabel: 'BIN / IIN *',
    binPlaceholder: '12 digits',
    phoneLabel: 'Contact phone',
    directorLabel: 'Director',
    directorPlaceholder: 'for the signature line',
    addressLabel: 'Address',
    offerTitle: 'Proposal',
    clientLabel: 'To (client) *',
    clientPlaceholder: 'e.g. ТОО «Client»',
    numberLabel: 'Number *',
    dateLabel: 'Date *',
    validLabel: 'Valid until',
    validHint: 'Empty = 30 days',
    vatLabel: 'VAT',
    vatNo: 'No VAT',
    vat16: 'VAT 16% included',
    vat0: 'VAT 0%',
    vat16Hint: 'Enter prices including VAT — the tax amount is shown separately in the proposal total.',
    rowPlaceholder: n => `Item or service ${n}`,
    qtyPlaceholder: 'Qty',
    pricePlaceholder: 'Price, ₸',
    removeRow: n => `Remove item ${n}`,
    addRow: '+ Add item',
    totalLabel: 'Total',
    vatIncluded: a => `incl. VAT 16%: ${a}`,
    noteLabel: 'Note (terms, timelines, delivery)',
    errCompany: 'Enter your business name',
    errBin: 'BIN/IIN must be 12 digits',
    errClient: 'Enter who the proposal is addressed to',
    errNoRows: 'Add at least one item',
    errRowName: n => `Item ${n}: enter a name — items without one are left out of the proposal`,
    errRowQty: n => `Item ${n}: quantity must be greater than zero`,
    errTotal: 'The proposal total must be greater than zero',
    errPopup: 'Your browser blocked the proposal window — allow pop-ups for invoices.kz and click again. This attempt was not counted.',
    generate: 'Create proposal — opens for printing and download',
    remaining: (left, limit) => `${left} of ${limit} free proposals left today`,
    limitTitle: limit => `You've used all ${limit} free proposals for today`,
    limitBody:
      'In an invoices.kz account a proposal becomes an invoice in one click once the client agrees: your details are saved, numbering is automatic, and you can accept payment via Kaspi. Sign-up is free.',
    limitButton: 'Sign up for free',
    nextStep: 'Client agreed? Issue an invoice →',
    faqTitle: 'Commercial proposals in Kazakhstan: the basics',
    faq: [
      {
        q: 'What goes into a commercial proposal?',
        a: 'Who is offering (business name, BIN/IIN — the business or personal tax ID, contacts), to whom and what exactly — items with quantity and price — plus the total, how long the offer is valid and the terms: timelines, delivery, payment. That is enough for the client to compare offers and decide.',
      },
      {
        q: 'With or without VAT?',
        a: 'If you are registered for VAT, choose “VAT 16% included” and enter prices including tax — the VAT amount is shown separately in the total. If not, choose “No VAT”. VAT 0% is for zero-rated supplies such as exports of goods.',
      },
      {
        q: 'Does it need a signature and a stamp?',
        a: 'Not necessarily: a proposal is an offer, not a primary accounting document. The document has a signature line for the director that you can sign after printing.',
      },
      {
        q: 'The client agreed — what next?',
        a: 'Issue an invoice for payment, and once the work is done or the goods are shipped, a certificate of completed work (AVR) or a delivery note (form Z-2). You can create the invoice here for free.',
      },
    ],
  },
}
