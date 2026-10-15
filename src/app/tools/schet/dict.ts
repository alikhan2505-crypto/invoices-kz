import { toolUrl, TOOL_LOCALE, type ToolLang, type ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/schet на трёх языках: и <head> (seo), и интерфейс.
// Русский — дословно прежний текст страницы (metadata из старого layout.tsx),
// чтобы не сбить уже набранную выдачу. Сам счёт (generateInvoicePDF) остаётся
// русским на всех языках — см. docs/tools-i18n-pattern.md.
// Суммы приходят сюда уже отформатированными (formatTenge).

export interface SchetFaqItem {
  q: string
  a: string
}

export interface SchetDict {
  seo: ToolSeoCopy
  h1: string
  intro: (limit: number) => string
  /** Одна строка о том, что бланк счёта выходит на русском. На ru — пусто. */
  docLangNote: string
  supplierTitle: string
  companyLabel: string
  companyPlaceholder: string
  binLabel: string
  binPlaceholder: string
  bankLabel: string
  bankPlaceholder: string
  otherBank: string
  otherBankNameLabel: string
  otherBankBikLabel: string
  otherBankBikPlaceholder: string
  iikLabel: string
  iikPlaceholder: string
  kbeLabel: string
  directorLabel: string
  directorPlaceholder: string
  addressLabel: string
  /** Email продавца для рассылки — в документ НЕ печатается (только /api/tools/lead). */
  emailLabel: string
  marketingConsent: string
  privacyLink: string
  clientTitle: string
  clientNameLabel: string
  clientBinLabel: string
  /** «Не уверены в контрагенте? …» + ссылка + хвост после неё. */
  checkHint: string
  checkLink: string
  checkAfter: string
  invoiceTitle: string
  numberLabel: string
  dateLabel: string
  dueDateLabel: string
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
  noteLabel: string
  errors: {
    company: string
    bin: string
    bank: string
    iik: string
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
  guideLink: string
  faqTitle: string
  faq: SchetFaqItem[]
}

export const schetDict: Record<ToolLang, SchetDict> = {
  ru: {
    seo: {
      title: 'Счёт на оплату онлайн — создать бесплатно за минуту',
      description:
        'Создайте счёт на оплату для ИП или ТОО Казахстана онлайн: реквизиты, БИН, банк и БИК из справочника, НДС 16% или без НДС, сумма прописью. Готовый PDF за минуту, без регистрации — 3 счёта в день бесплатно.',
      keywords:
        'счет на оплату образец казахстан, счет на оплату скачать, выставить счет онлайн бесплатно, счет на оплату ип образец, счет на оплату тоо, создать счет на оплату, счет с ндс 16 казахстан',
      ogTitle: 'Счёт на оплату онлайн — бесплатно за минуту',
      ogDescription: 'Реквизиты, БИН, банк из справочника, НДС 16% или без, сумма прописью. PDF без регистрации.',
      ogImageAlt: 'Счёт на оплату онлайн — invoices.kz',
    },
    h1: 'Счёт на оплату — онлайн, бесплатно',
    intro: n =>
      `Заполните реквизиты — получите готовый счёт по форме, принятой в Казахстане: с БИК из справочника банков, суммой прописью и НДС, если нужен. Без регистрации, ${n} счёта в день.`,
    docLangNote: '',
    supplierTitle: 'Поставщик — вы',
    companyLabel: 'Название ИП / ТОО *',
    companyPlaceholder: 'ИП Иванов / ТОО «Ромашка»',
    binLabel: 'БИН / ИИН *',
    binPlaceholder: '12 цифр',
    bankLabel: 'Банк *',
    bankPlaceholder: 'Выберите банк',
    otherBank: 'Другой банк…',
    otherBankNameLabel: 'Название банка *',
    otherBankBikLabel: 'БИК *',
    otherBankBikPlaceholder: '8 символов',
    iikLabel: 'ИИК (счёт KZ…) *',
    iikPlaceholder: 'KZ…',
    kbeLabel: 'КБе',
    directorLabel: 'Руководитель',
    directorPlaceholder: 'для строки подписи',
    addressLabel: 'Адрес',
    emailLabel: 'Ваш email (необязательно)',
    marketingConsent: 'Присылать мне советы и новости invoices.kz на этот email (отписаться можно в любом письме).',
    privacyLink: 'Политика конфиденциальности',
    clientTitle: 'Клиент — кому счёт',
    clientNameLabel: 'Название клиента *',
    clientBinLabel: 'БИН / ИИН клиента *',
    checkHint: 'Не уверены в контрагенте? Проверьте его бесплатно: ',
    checkLink: 'проверка по БИН',
    checkAfter: '.',
    invoiceTitle: 'Счёт',
    numberLabel: 'Номер *',
    dateLabel: 'Дата *',
    dueDateLabel: 'Оплатить до',
    vatLabel: 'НДС',
    vatOptions: { no_vat: 'Без НДС', vat_16: 'С НДС 16%', vat_0: 'НДС 0%' },
    itemPlaceholder: n => `Товар или услуга ${n}`,
    qtyPlaceholder: 'Кол-во',
    pricePlaceholder: 'Цена, ₸',
    itemAria: n => `Наименование, позиция ${n}`,
    qtyAria: n => `Количество, позиция ${n}`,
    priceAria: n => `Цена, позиция ${n}`,
    removeRow: n => `Удалить позицию ${n}`,
    addRow: '+ Добавить товар / услугу',
    total: s => `Итого: ${s}`,
    vatIncluded: s => `в т. ч. НДС 16%: ${s}`,
    noteLabel: 'Примечание (попадёт в счёт)',
    errors: {
      company: 'Укажите название вашего ИП или ТОО',
      bin: 'БИН/ИИН поставщика — 12 цифр',
      bank: 'Выберите банк (или заполните название и 8-значный БИК)',
      iik: 'ИИК — 20 символов, начинается с KZ',
      client: 'Укажите название клиента',
      clientBin: 'БИН/ИИН клиента — 12 цифр',
      noRows: 'Добавьте хотя бы одну позицию',
      rowName: n => `Укажите наименование в позиции ${n}`,
      rowQty: name => `Укажите количество для «${name}»`,
      rowPrice: name => `Укажите цену для «${name}»`,
      zero: 'Сумма счёта должна быть больше нуля',
      popup: 'Браузер заблокировал окно со счётом — разрешите всплывающие окна для invoices.kz и нажмите ещё раз. Попытка не списана.',
    },
    limitTitle: n => `${n} бесплатных счёта на сегодня созданы`,
    limitBody:
      'В кабинете invoices.kz счета без лимита и без водяного знака: реквизиты сохраняются один раз, номера считаются сами, видно, когда клиент открыл счёт, а оплату можно принять через Kaspi. Регистрация бесплатная, по ссылке на почту.',
    limitButton: 'Зарегистрироваться бесплатно',
    generate: 'Создать счёт — откроется для печати и скачивания',
    remaining: (left, n) => `Осталось ${left} из ${n} бесплатных счётов сегодня · в счёте будет строка «Создано на invoices.kz»`,
    guideLink: 'Что обязательно должно быть в счёте →',
    faqTitle: 'Частые вопросы',
    faq: [
      {
        q: 'Какие реквизиты обязательны в счёте на оплату?',
        a: 'Название и БИН/ИИН поставщика, банк, ИИК и БИК, код КБе, название и БИН/ИИН клиента, номер и дата счёта, список товаров или услуг и итоговая сумма. Ошибка в банке или БИК — и клиент просто не сможет отправить платёж, поэтому банк здесь выбирается из справочника.',
      },
      {
        q: 'Счёт на оплату и ЭСФ — это одно и то же?',
        a: 'Нет. Счёт на оплату говорит клиенту, куда и сколько платить, — в налоговую он не отправляется. ЭСФ — электронный счёт-фактура в системе ИС ЭСФ, налоговый документ. А факт выполнения работ или услуг подтверждает акт выполненных работ (АВР).',
      },
      {
        q: 'Как считается НДС 16%?',
        a: 'Цены вводятся уже с НДС. Сумма НДС выделяется из итога: итог × 16 / 116 — так же, как в самом счёте. Ставка 16% действует с 1 января 2026 года. Если вы не плательщик НДС, выберите «Без НДС».',
      },
      {
        q: 'Куда сохраняются мои данные?',
        a: 'Реквизиты и позиции хранятся только в вашем браузере — чтобы не заполнять их заново для следующего счёта. Сам счёт формируется на этом устройстве и на наш сервер не отправляется. На сервер уходит только БИН/ИИН (если нажать «Найти») и ваш email — если вы его указали и оставили галочку согласия на рассылку: тогда мы присылаем советы и новости invoices.kz, отписаться можно в любом письме.',
      },
    ],
  },

  kk: {
    seo: {
      title: 'Төлем шоты онлайн — бір минутта тегін жасау',
      description:
        'Қазақстандағы ЖК немесе ЖШС үшін төлем шотын онлайн жасаңыз: деректемелер, БСН, банк пен БСК анықтамалықтан, ҚҚС 16% немесе ҚҚС-сыз, сомасы жазбаша. Тіркелусіз бір минутта дайын PDF — күніне 3 шот тегін.',
      keywords:
        'төлем шоты үлгісі, төлемге шот үлгісі, төлем шоты онлайн, шот жазу тегін, жк төлем шоты, жшс төлем шоты, төлем шотын жасау, төлем шоты pdf жүктеу, ққс 16 шот',
      ogTitle: 'Төлем шоты онлайн — бір минутта, тегін',
      ogDescription: 'Деректемелер, БСН, банк анықтамалықтан, ҚҚС 16% немесе ҚҚС-сыз, сомасы жазбаша. Тіркелусіз PDF.',
      ogImageAlt: 'Төлем шоты онлайн — invoices.kz',
    },
    h1: 'Төлем шоты — онлайн, тегін',
    intro: n =>
      `Деректемелерді толтырыңыз — Қазақстанда қабылданған нысандағы дайын шот аласыз: БСК банктер анықтамалығынан алынады, сомасы жазбаша көрсетіледі, қажет болса ҚҚС-пен. Тіркелусіз, күніне ${n} шот.`,
    docLangNote: 'Шот бланкісі орыс тілінде шығады — бухгалтерия мен банк қабылдайтын үйреншікті нысан.',
    supplierTitle: 'Жеткізуші — сіз',
    companyLabel: 'ЖК / ЖШС атауы *',
    companyPlaceholder: 'ЖК Сейітов / «Жұлдыз» ЖШС',
    binLabel: 'БСН / ЖСН *',
    binPlaceholder: '12 цифр',
    bankLabel: 'Банк *',
    bankPlaceholder: 'Банкті таңдаңыз',
    otherBank: 'Басқа банк…',
    otherBankNameLabel: 'Банктің атауы *',
    otherBankBikLabel: 'БСК *',
    otherBankBikPlaceholder: '8 таңба',
    iikLabel: 'ЖСК (KZ… банктік шот) *',
    iikPlaceholder: 'KZ…',
    kbeLabel: 'КБе',
    directorLabel: 'Басшы',
    directorPlaceholder: 'қол қою жолы үшін',
    addressLabel: 'Мекенжай',
    emailLabel: 'Сіздің email (міндетті емес)',
    marketingConsent: 'Осы email-ге invoices.kz кеңестері мен жаңалықтарын жіберіп тұрыңыз (кез келген хаттан бас тартуға болады).',
    privacyLink: 'Құпиялылық саясаты',
    clientTitle: 'Клиент — шот кімге',
    clientNameLabel: 'Клиенттің атауы *',
    clientBinLabel: 'Клиенттің БСН / ЖСН *',
    checkHint: 'Контрагентке күмәніңіз бар ма? Оны тегін тексеріңіз: ',
    checkLink: 'БСН бойынша тексеру',
    checkAfter: '.',
    invoiceTitle: 'Шот',
    numberLabel: 'Нөмірі *',
    dateLabel: 'Күні *',
    dueDateLabel: 'Төлеу мерзімі',
    vatLabel: 'ҚҚС',
    vatOptions: { no_vat: 'ҚҚС-сыз', vat_16: 'ҚҚС 16% қоса алғанда', vat_0: 'ҚҚС 0%' },
    itemPlaceholder: n => `Тауар немесе қызмет ${n}`,
    qtyPlaceholder: 'Саны',
    pricePlaceholder: 'Бағасы, ₸',
    itemAria: n => `${n}-позицияның атауы`,
    qtyAria: n => `${n}-позицияның саны`,
    priceAria: n => `${n}-позицияның бағасы`,
    removeRow: n => `${n}-позицияны өшіру`,
    addRow: '+ Тауар / қызмет қосу',
    total: s => `Барлығы: ${s}`,
    vatIncluded: s => `оның ішінде ҚҚС 16%: ${s}`,
    noteLabel: 'Ескертпе (шотқа жазылады)',
    errors: {
      company: 'ЖК немесе ЖШС атауын көрсетіңіз',
      bin: 'Жеткізушінің БСН/ЖСН-і — 12 цифр',
      bank: 'Банкті таңдаңыз (немесе банк атауын және 8 таңбалы БСК-ны толтырыңыз)',
      iik: 'ЖСК — 20 таңба, KZ әріптерінен басталады',
      client: 'Клиенттің атауын көрсетіңіз',
      clientBin: 'Клиенттің БСН/ЖСН-і — 12 цифр',
      noRows: 'Кемінде бір позиция қосыңыз',
      rowName: n => `${n}-позицияның атауын көрсетіңіз`,
      rowQty: name => `«${name}» үшін санын көрсетіңіз`,
      rowPrice: name => `«${name}» үшін бағасын көрсетіңіз`,
      zero: 'Шот сомасы нөлден көп болуы керек',
      popup: 'Браузер шот терезесін бұғаттап тастады — invoices.kz үшін қалқымалы терезелерге рұқсат беріп, қайта басыңыз. Бұл әрекет есепке алынбады.',
    },
    limitTitle: n => `Бүгінгі ${n} тегін шоттың бәрі пайдаланылды`,
    limitBody:
      'invoices.kz кабинетінде шоттар шектеусіз және су белгісіз: деректемелер бір рет сақталады, нөмірлер өздігінен қойылады, клиенттің шотты қашан ашқаны көрінеді, ал төлемді Kaspi арқылы қабылдауға болады. Тіркелу тегін, поштаға келген сілтеме арқылы.',
    limitButton: 'Тегін тіркелу',
    generate: 'Шот жасау — басып шығаруға және жүктеуге ашылады',
    remaining: (left, n) => `Бүгін тағы ${left} тегін шот қалды (күніне ${n}) · шоттың төменгі жағында invoices.kz белгісі бар жол болады`,
    guideLink: 'Шотта міндетті түрде не болуы керек →',
    faqTitle: 'Жиі қойылатын сұрақтар',
    faq: [
      {
        q: 'Төлем шотында қандай деректемелер міндетті?',
        a: 'Жеткізушінің атауы мен БСН/ЖСН-і, банкі, ЖСК және БСК, КБе коды, клиенттің атауы мен БСН/ЖСН-і, шоттың нөмірі мен күні, тауарлар немесе қызметтер тізімі және жалпы сома. Банк немесе БСК қате болса, клиент төлемді жібере алмайды — сондықтан мұнда банк анықтамалықтан таңдалады.',
      },
      {
        q: 'Төлем шоты мен ЭШФ — бір құжат па?',
        a: 'Жоқ. Төлем шоты клиентке қайда және қанша төлеу керегін көрсетеді — ол салық органына жіберілмейді. ЭШФ — ЭШФ ақпараттық жүйесіндегі электрондық шот-фактура, яғни салық құжаты. Ал жұмыстың немесе қызметтің орындалғанын Орындалған жұмыстар (көрсетілген қызметтер) актісі (ОЖА) растайды.',
      },
      {
        q: 'ҚҚС 16% қалай есептеледі?',
        a: 'Бағалар ҚҚС-ты қоса алғанда енгізіледі. ҚҚС сомасы жалпы сомадан бөлініп шығарылады: сома × 16 / 116 — шоттың өзіндегідей. 16% мөлшерлеме 2026 жылғы 1 қаңтардан бастап қолданылады. ҚҚС төлеушісі болмасаңыз, «ҚҚС-сыз» дегенді таңдаңыз.',
      },
      {
        q: 'Деректерім қайда сақталады?',
        a: 'Деректемелер мен позициялар тек сіздің браузеріңізде сақталады — келесі шот үшін қайта толтырмау үшін. Шот осы құрылғыда жасалады және біздің серверге жіберілмейді. Серверге тек БСН/ЖСН («Табу» батырмасын басқанда) және сіздің email жіберіледі — егер оны көрсетіп, таратылымға келісім белгісін қалдырсаңыз: сонда біз invoices.kz кеңестері мен жаңалықтарын жібереміз, кез келген хаттан бас тартуға болады.',
      },
    ],
  },

  en: {
    seo: {
      title: 'Kazakhstan Invoice Generator (Invoice for Payment) — Free PDF',
      description:
        'Create a Kazakhstan invoice for payment online for a sole proprietor (IE) or LLP: BIN, bank and BIC from the directory, 16% VAT or no VAT, amount in words. Ready PDF in a minute, no sign-up — 3 invoices a day free.',
      keywords:
        'kazakhstan invoice template, invoice generator kazakhstan, kazakhstan invoice for payment, invoice for payment template kazakhstan, schet na oplatu, kazakhstan invoice pdf free, kazakhstan vat 16 invoice, llp invoice kazakhstan, sole proprietor invoice kazakhstan',
      ogTitle: 'Kazakhstan invoice for payment — free, in a minute',
      ogDescription: 'Your details, BIN, bank from the directory, 16% VAT or none, amount in words. PDF without sign-up.',
      ogImageAlt: 'Kazakhstan invoice generator — invoices.kz',
    },
    h1: 'Kazakhstan invoice for payment — online, free',
    intro: n =>
      `Fill in your details — BIN/IIN (business or individual identification number), bank and account — to get a ready invoice on the standard Kazakhstan form: the bank code (BIC) comes from the bank directory, the amount is written out in words, VAT is added if you need it. No sign-up, ${n} invoices per day.`,
    docLangNote: 'The invoice is generated in Russian — the standard form that accountants and banks in Kazakhstan accept.',
    supplierTitle: 'Supplier — you',
    companyLabel: 'Sole proprietor (IE) / LLP name *',
    companyPlaceholder: 'IE Ivanov / Romashka LLP',
    binLabel: 'BIN / IIN *',
    binPlaceholder: '12 digits',
    bankLabel: 'Bank *',
    bankPlaceholder: 'Choose a bank',
    otherBank: 'Other bank…',
    otherBankNameLabel: 'Bank name *',
    otherBankBikLabel: 'BIC *',
    otherBankBikPlaceholder: '8 characters',
    iikLabel: 'Account, IIK / IBAN (KZ…) *',
    iikPlaceholder: 'KZ…',
    kbeLabel: 'Kbe (beneficiary code)',
    directorLabel: 'Director',
    directorPlaceholder: 'for the signature line',
    addressLabel: 'Address',
    emailLabel: 'Your email (optional)',
    marketingConsent: 'Send me invoices.kz tips and news at this email (unsubscribe from any email).',
    privacyLink: 'Privacy policy',
    clientTitle: 'Client — who the invoice is for',
    clientNameLabel: 'Client name *',
    clientBinLabel: 'Client BIN / IIN *',
    checkHint: 'Not sure about this counterparty? Check it for free: ',
    checkLink: 'BIN check',
    checkAfter: '.',
    invoiceTitle: 'Invoice',
    numberLabel: 'Number *',
    dateLabel: 'Date *',
    dueDateLabel: 'Due date',
    vatLabel: 'VAT',
    vatOptions: { no_vat: 'No VAT', vat_16: 'VAT 16% included', vat_0: 'VAT 0%' },
    itemPlaceholder: n => `Product or service ${n}`,
    qtyPlaceholder: 'Qty',
    pricePlaceholder: 'Price, ₸',
    itemAria: n => `Item ${n} name`,
    qtyAria: n => `Quantity, item ${n}`,
    priceAria: n => `Price, item ${n}`,
    removeRow: n => `Remove item ${n}`,
    addRow: '+ Add product / service',
    total: s => `Total: ${s}`,
    vatIncluded: s => `incl. VAT 16%: ${s}`,
    noteLabel: 'Note (printed on the invoice)',
    errors: {
      company: 'Enter the name of your sole proprietorship or LLP',
      bin: 'Supplier BIN/IIN must be 12 digits',
      bank: 'Choose a bank (or enter its name and 8-character BIC)',
      iik: 'The IIK account number is 20 characters and starts with KZ',
      client: 'Enter the client name',
      clientBin: 'Client BIN/IIN must be 12 digits',
      noRows: 'Add at least one item',
      rowName: n => `Enter the name of item ${n}`,
      rowQty: name => `Enter a quantity for “${name}”`,
      rowPrice: name => `Enter a price for “${name}”`,
      zero: 'The invoice total must be greater than zero',
      popup: 'Your browser blocked the invoice window — allow pop-ups for invoices.kz and click again. This attempt was not counted.',
    },
    limitTitle: n => `All ${n} free invoices for today are used`,
    limitBody:
      'In an invoices.kz account invoices are unlimited and watermark-free: your details are saved once, numbering is automatic, you can see when the client opened the invoice, and you can accept payment via Kaspi. Sign-up is free, with an email link.',
    limitButton: 'Sign up for free',
    generate: 'Create the invoice — opens for printing and download',
    remaining: (left, n) => `${left} of ${n} free invoices left today · the invoice carries a small invoices.kz footer line`,
    guideLink: 'What an invoice must include (in Russian) →',
    faqTitle: 'FAQ',
    faq: [
      {
        q: 'What details must a Kazakhstan invoice for payment include?',
        a: 'The supplier’s name and BIN/IIN, bank, IIK (account number) and BIC, the Kbe beneficiary code, the client’s name and BIN/IIN, the invoice number and date, the list of goods or services and the total. A wrong bank or BIC means the client simply cannot send the payment, which is why the bank is picked from a directory here.',
      },
      {
        q: 'Is an invoice for payment the same as an e-invoice (ESF)?',
        a: 'No. An invoice for payment tells the client where and how much to pay — it is not filed with the tax authority. The ESF is an electronic VAT invoice in the state e-invoicing system, a tax document. Completion of works or services is confirmed by a separate certificate of completed works (AVR).',
      },
      {
        q: 'How is 16% VAT calculated?',
        a: 'Prices are entered VAT-inclusive. VAT is extracted from the total as total × 16 / 116 — exactly as in the invoice itself. The 16% rate applies from 1 January 2026. If you are not registered for VAT, choose “No VAT”.',
      },
      {
        q: 'Where is my data stored?',
        a: 'Your details and items stay only in your browser, so you don’t have to retype them for the next invoice. The invoice itself is built on this device and is not sent to our server. Only the BIN/IIN (when you click “Find”) and your email are sent to the server — the email only if you entered it and left the newsletter consent box ticked, so we can send you invoices.kz tips and news; you can unsubscribe from any email.',
      },
    ],
  },
}

/**
 * schema.org FAQPage для языковой версии /tools/schet — те же вопросы, что
 * видны на странице (блок FAQ в SchetTool), на языке адреса. Строка уже
 * экранирована от '</script>' — вставлять через dangerouslySetInnerHTML как есть.
 */
export function schetFaqJsonLd(lang: ToolLang): string {
  const t = schetDict[lang]
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${toolUrl('schet', lang)}#faq`,
    inLanguage: TOOL_LOCALE[lang],
    mainEntity: t.faq.map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
