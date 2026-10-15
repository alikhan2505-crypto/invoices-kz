import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/nakladnaya на трёх языках: и <head> (seo), и интерфейс.
// Русский — дословно прежний текст страницы (metadata из старого layout.tsx),
// чтобы не сбить уже набранную выдачу. Сам бланк накладной (generateNakladnaya)
// остаётся русским на всех языках — см. docs/tools-i18n-pattern.md.
// Суммы приходят сюда уже отформатированными (formatTenge).

export interface NakladnayaFaqItem {
  q: string
  a: string
}

export interface NakladnayaDict {
  seo: ToolSeoCopy
  h1: string
  intro: (limit: number) => string
  /** Одна строка о том, что бланк выходит на русском. На ru — пусто. */
  docLangNote: string
  supplierTitle: string
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
  recipientTitle: string
  clientNameLabel: string
  clientBinLabel: string
  docTitle: string
  numberLabel: string
  dateLabel: string
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
  waybillsLink: string
  faqTitle: string
  faq: NakladnayaFaqItem[]
}

export const nakladnayaDict: Record<ToolLang, NakladnayaDict> = {
  ru: {
    seo: {
      title: 'Накладная онлайн — накладная на отпуск запасов бесплатно',
      description:
        'Создайте накладную на отпуск запасов на сторону (З-2) для ИП или ТОО Казахстана онлайн: стороны, товары, сумма прописью. Готовый PDF за минуту, без регистрации — 3 накладные в день бесплатно.',
      keywords:
        'накладная на отпуск запасов образец, накладная з-2 казахстан, накладная скачать бесплатно, расходная накладная ип, накладная на товар казахстан',
      ogTitle: 'Накладная онлайн — за минуту, бесплатно',
      ogDescription: 'Накладная на отпуск запасов (З-2): стороны, товары, сумма прописью. PDF без регистрации.',
      ogImageAlt: 'Накладная онлайн — invoices.kz',
    },
    h1: 'Накладная на отпуск запасов — онлайн, бесплатно',
    intro: n =>
      `Заполните стороны и товары — получите накладную по привычной форме З-2 с суммой прописью. Без регистрации, ${n} накладные в день.`,
    docLangNote: '',
    supplierTitle: 'Поставщик — вы',
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
    recipientTitle: 'Получатель',
    clientNameLabel: 'Название получателя *',
    clientBinLabel: 'БИН / ИИН получателя',
    docTitle: 'Накладная',
    numberLabel: 'Номер *',
    dateLabel: 'Дата *',
    vatLabel: 'НДС',
    vatOptions: { no_vat: 'Без НДС', vat_16: 'С НДС 16%', vat_0: 'НДС 0%' },
    itemPlaceholder: n => `Товар ${n}`,
    qtyPlaceholder: 'Кол-во',
    pricePlaceholder: 'Цена, ₸',
    itemAria: n => `Наименование товара ${n}`,
    qtyAria: n => `Количество, строка ${n}`,
    priceAria: n => `Цена, строка ${n}`,
    removeRow: n => `Удалить строку ${n}`,
    addRow: '+ Добавить товар / услугу',
    total: s => `Итого: ${s}`,
    vatIncluded: s => `в т. ч. НДС 16%: ${s}`,
    errors: {
      company: 'Укажите название вашего ИП или ТОО (поставщик)',
      bin: 'БИН/ИИН поставщика — 12 цифр',
      client: 'Укажите получателя',
      clientBin: 'БИН/ИИН получателя — 12 цифр (или оставьте пустым)',
      noRows: 'Добавьте хотя бы один товар',
      rowName: n => `Укажите наименование товара в строке ${n}`,
      rowQty: name => `Укажите количество для «${name}»`,
      rowPrice: name => `Укажите цену для «${name}»`,
      zero: 'Сумма накладной должна быть больше нуля',
      popup: 'Браузер заблокировал окно с накладной — разрешите всплывающие окна для invoices.kz и нажмите ещё раз. Попытка не списана.',
    },
    limitTitle: n => `${n} бесплатные накладные на сегодня созданы`,
    limitBody:
      'В кабинете invoices.kz накладная создаётся из счёта в один клик: реквизиты и товары уже заполнены, номера считаются сами, подпись и печать — внутри PDF. Регистрация бесплатная.',
    limitButton: 'Зарегистрироваться бесплатно',
    generate: 'Создать накладную — откроется для печати и скачивания',
    remaining: (left, n) => `Осталось ${left} из ${n} бесплатных накладных сегодня`,
    waybillsLink: 'Накладные Kaspi одним PDF →',
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Когда нужна накладная на отпуск запасов?',
        a: 'Когда вы передаёте товар покупателю. Накладная по форме З-2 — первичный документ, который подтверждает, что товар отпущен и получен: её подписывают обе стороны, по ней покупатель приходует товар, а вы списываете его со склада.',
      },
      {
        q: 'Если я выписываю ЭСФ, накладная всё равно нужна?',
        a: 'Да, это разные документы. ЭСФ — налоговый документ в системе ИС ЭСФ, а накладная — первичный документ о самой передаче товара с подписью получателя. Для услуг вместо накладной оформляют акт выполненных работ (АВР).',
      },
      {
        q: 'Как считается НДС 16%?',
        a: 'Цены вводятся уже с НДС. Сумма НДС выделяется из итога: итог × 16 / 116 — так же, как в самой накладной. Ставка 16% действует с 1 января 2026 года.',
      },
      {
        q: 'Куда сохраняются мои данные?',
        a: 'Только в ваш браузер: черновик хранится на этом устройстве, чтобы не заполнять реквизиты заново. На наш сервер данные накладной не отправляются — уходит только БИН/ИИН, если нажать «Найти», и ваш email — если вы его указали и оставили галочку согласия на рассылку (советы и новости invoices.kz, отписаться можно в любом письме).',
      },
    ],
  },

  kk: {
    seo: {
      title: 'Жүкқұжат онлайн — қорларды жағына босатуға арналған жүкқұжат тегін',
      description:
        'Қазақстандағы ЖК немесе ЖШС үшін қорларды жағына босатуға арналған жүкқұжатты (З-2 нысаны) онлайн жасаңыз: тараптар, тауарлар, сомасы жазбаша. Тіркелусіз бір минутта дайын PDF — күніне 3 жүкқұжат тегін.',
      keywords:
        'жүкқұжат үлгісі, жүкқұжат з-2, қорларды жағына босатуға арналған жүкқұжат, жүкқұжат онлайн, жүкқұжат жасау тегін, жк жүкқұжат, тауарға жүкқұжат, жүкқұжат pdf жүктеу',
      ogTitle: 'Жүкқұжат онлайн — бір минутта, тегін',
      ogDescription: 'Қорларды жағына босатуға арналған жүкқұжат (З-2): тараптар, тауарлар, сомасы жазбаша. Тіркелусіз PDF.',
      ogImageAlt: 'Жүкқұжат онлайн — invoices.kz',
    },
    h1: 'Қорларды жағына босатуға арналған жүкқұжат — онлайн, тегін',
    intro: n =>
      `Тараптар мен тауарларды толтырыңыз — таныс З-2 нысанындағы, сомасы жазбаша көрсетілген жүкқұжат аласыз. Тіркелусіз, күніне ${n} жүкқұжат.`,
    docLangNote: 'Жүкқұжат бланкісі орыс тілінде шығады — бухгалтерия қабылдайтын үйреншікті нысан.',
    supplierTitle: 'Жеткізуші — сіз',
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
    recipientTitle: 'Алушы',
    clientNameLabel: 'Алушының атауы *',
    clientBinLabel: 'Алушының БСН / ЖСН',
    docTitle: 'Жүкқұжат',
    numberLabel: 'Нөмірі *',
    dateLabel: 'Күні *',
    vatLabel: 'ҚҚС',
    vatOptions: { no_vat: 'ҚҚС-сыз', vat_16: 'ҚҚС 16% қоса алғанда', vat_0: 'ҚҚС 0%' },
    itemPlaceholder: n => `Тауар ${n}`,
    qtyPlaceholder: 'Саны',
    pricePlaceholder: 'Бағасы, ₸',
    itemAria: n => `${n}-тауардың атауы`,
    qtyAria: n => `${n}-жолдағы саны`,
    priceAria: n => `${n}-жолдағы бағасы`,
    removeRow: n => `${n}-жолды өшіру`,
    addRow: '+ Тауар / қызмет қосу',
    total: s => `Барлығы: ${s}`,
    vatIncluded: s => `оның ішінде ҚҚС 16%: ${s}`,
    errors: {
      company: 'ЖК немесе ЖШС атауын көрсетіңіз (жеткізуші)',
      bin: 'Жеткізушінің БСН/ЖСН-і — 12 цифр',
      client: 'Алушыны көрсетіңіз',
      clientBin: 'Алушының БСН/ЖСН-і — 12 цифр (немесе бос қалдырыңыз)',
      noRows: 'Кемінде бір тауар қосыңыз',
      rowName: n => `${n}-жолдағы тауардың атауын көрсетіңіз`,
      rowQty: name => `«${name}» тауарының санын көрсетіңіз`,
      rowPrice: name => `«${name}» тауарының бағасын көрсетіңіз`,
      zero: 'Жүкқұжат сомасы нөлден көп болуы керек',
      popup: 'Браузер жүкқұжат терезесін бұғаттап тастады — invoices.kz үшін қалқымалы терезелерге рұқсат беріп, қайта басыңыз. Бұл әрекет есепке алынбады.',
    },
    limitTitle: n => `Бүгінгі ${n} тегін жүкқұжат жасалды`,
    limitBody:
      'invoices.kz кабинетінде жүкқұжат шоттан бір басумен жасалады: деректемелер мен тауарлар толтырылып тұрады, нөмірлер өздігінен қойылады, қолтаңба мен мөр PDF ішінде. Тіркелу тегін.',
    limitButton: 'Тегін тіркелу',
    generate: 'Жүкқұжат жасау — басып шығаруға және жүктеуге ашылады',
    remaining: (left, n) => `Бүгін тағы ${left} тегін жүкқұжат қалды (күніне ${n})`,
    waybillsLink: 'Kaspi жүкқұжаттары бір PDF-те →',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: 'Қорларды босатуға арналған жүкқұжат қашан керек?',
        a: 'Тауарды сатып алушыға бергенде. З-2 нысанындағы жүкқұжат — тауардың босатылғанын және қабылданғанын растайтын бастапқы құжат: оған екі тарап қол қояды, сатып алушы тауарды соның негізінде кіріске алады, ал сіз оны қоймадан есептен шығарасыз.',
      },
      {
        q: 'ЭШФ жазсам да, жүкқұжат керек пе?',
        a: 'Иә, бұлар — әртүрлі құжаттар. ЭШФ — ЭШФ ақпараттық жүйесіндегі салық құжаты, ал жүкқұжат — тауарды берудің өзін алушының қолымен растайтын бастапқы құжат. Қызметтер үшін жүкқұжаттың орнына Орындалған жұмыстар актісі (ОЖА) рәсімделеді.',
      },
      {
        q: 'ҚҚС 16% қалай есептеледі?',
        a: 'Бағалар ҚҚС-ты қоса алғанда енгізіледі. ҚҚС сомасы жалпы сомадан бөлініп шығарылады: сома × 16 / 116 — жүкқұжаттың өзіндегідей. 16% мөлшерлеме 2026 жылғы 1 қаңтардан бастап қолданылады.',
      },
      {
        q: 'Деректерім қайда сақталады?',
        a: 'Тек сіздің браузеріңізде: деректемелерді қайта толтырмау үшін нобай осы құрылғыда сақталады. Жүкқұжат деректері біздің серверге жіберілмейді — «Табу» батырмасын басқанда ғана БСН/ЖСН жіберіледі, сондай-ақ сіздің email — егер оны көрсетіп, таратылымға келісім белгісін қалдырсаңыз (invoices.kz кеңестері мен жаңалықтары, кез келген хаттан бас тартуға болады).',
      },
    ],
  },

  en: {
    seo: {
      title: 'Kazakhstan Delivery Note (Form Z-2) Generator — Free PDF',
      description:
        'Create a Kazakhstan goods delivery note — the standard form Z-2 for issuing inventory to third parties — online for a sole proprietor (IE) or LLP: parties, goods, total in words. Ready PDF in a minute, no sign-up, 3 notes a day free.',
      keywords:
        'kazakhstan delivery note template, delivery note generator kazakhstan, waybill kazakhstan, z-2 form kazakhstan, goods issue note kazakhstan, nakladnaya kazakhstan, kazakhstan delivery note pdf free',
      ogTitle: 'Kazakhstan delivery note (Z-2) — free, in a minute',
      ogDescription: 'The standard Kazakhstan Z-2 goods delivery note: parties, goods, total in words. PDF without sign-up.',
      ogImageAlt: 'Kazakhstan delivery note generator — invoices.kz',
    },
    h1: 'Kazakhstan delivery note (form Z-2) — online, free',
    intro: n =>
      `Fill in the parties and goods to get a delivery note on the standard Kazakhstan form Z-2, with the total written out in words. No sign-up, ${n} notes per day.`,
    docLangNote: 'The note is generated in Russian — the standard form that accountants and counterparties in Kazakhstan accept.',
    supplierTitle: 'Supplier — you',
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
    recipientTitle: 'Recipient',
    clientNameLabel: 'Recipient name *',
    clientBinLabel: 'Recipient BIN / IIN',
    docTitle: 'Delivery note',
    numberLabel: 'Number *',
    dateLabel: 'Date *',
    vatLabel: 'VAT',
    vatOptions: { no_vat: 'No VAT', vat_16: 'VAT 16% included', vat_0: 'VAT 0%' },
    itemPlaceholder: n => `Item ${n}`,
    qtyPlaceholder: 'Qty',
    pricePlaceholder: 'Price, ₸',
    itemAria: n => `Item ${n} name`,
    qtyAria: n => `Quantity, row ${n}`,
    priceAria: n => `Price, row ${n}`,
    removeRow: n => `Remove row ${n}`,
    addRow: '+ Add product / service',
    total: s => `Total: ${s}`,
    vatIncluded: s => `incl. VAT 16%: ${s}`,
    errors: {
      company: 'Enter the name of your sole proprietorship or LLP (supplier)',
      bin: 'Supplier BIN/IIN must be 12 digits',
      client: 'Enter the recipient',
      clientBin: 'Recipient BIN/IIN must be 12 digits (or leave it empty)',
      noRows: 'Add at least one item',
      rowName: n => `Enter the item name in row ${n}`,
      rowQty: name => `Enter a quantity for “${name}”`,
      rowPrice: name => `Enter a price for “${name}”`,
      zero: 'The delivery note total must be greater than zero',
      popup: 'Your browser blocked the delivery note window — allow pop-ups for invoices.kz and click again. This attempt was not counted.',
    },
    limitTitle: n => `All ${n} free notes for today are used`,
    limitBody:
      'In an invoices.kz account a delivery note is created from an invoice in one click: requisites and goods are already filled in, numbering is automatic, and the signature and stamp are inside the PDF. Sign-up is free.',
    limitButton: 'Sign up for free',
    generate: 'Create the delivery note — opens for printing and download',
    remaining: (left, n) => `${left} of ${n} free notes left today`,
    waybillsLink: 'All Kaspi waybills in one PDF →',
    faqTitle: 'FAQ',
    faq: [
      {
        q: 'When do I need a delivery note (form Z-2)?',
        a: 'Whenever you hand goods over to a buyer in Kazakhstan. Form Z-2 (issue of inventory to third parties) is the primary accounting document proving the goods were released and received: both parties sign it, the buyer books the goods in, and you write them off your stock.',
      },
      {
        q: 'I already issue an e-invoice (ESF). Do I still need a delivery note?',
        a: 'Yes — they are different documents. The ESF is a tax document in the state e-invoicing system, while the delivery note is the primary record of the handover itself, signed by the recipient. For services, a certificate of completed works (AVR) is used instead.',
      },
      {
        q: 'How is 16% VAT calculated?',
        a: 'Prices are entered VAT-inclusive. VAT is extracted from the total as total × 16 / 116 — exactly as in the delivery note itself. The 16% rate applies from 1 January 2026.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Only in your browser: the draft stays on this device so you don’t have to retype your details. Delivery note data is never sent to our server — only the BIN/IIN when you click “Find”, plus your email if you entered it and left the newsletter consent box ticked (invoices.kz tips and news; unsubscribe from any email).',
      },
    ],
  },
}
