// Registry of the SEO guides under /guides.
//
// Single source for four consumers that would otherwise drift: the index
// pages, the sitemap, the cross-links between guides and the ru<->kk
// language switch. Adding a guide means adding its page directories AND an
// entry here -- everything else picks it up on its own.
//
// Each language is a REAL route (/guides/<slug> and /guides/kk/<slug>), not
// a client-side toggle. A toggle would render the second language only in
// the browser, so it would never appear in the prerendered HTML a crawler
// reads -- which is the whole point of these pages. Verified the hard way on
// the landing: its kk strings live only in the JS bundle, not in index.html.
//
// `updated` is the real last-edit date and is what the sitemap reports as
// lastmod, so a crawler is never told a page changed when it didn't.
// `published` is optional and only for a guide whose first release is known
// to be earlier than its last edit; without it datePublished falls back to
// `updated` (we never invent an earlier date).

export type GuideLang = 'ru' | 'kk'

export type GuideFaqItem = { q: string; a: string }

export type GuideCopy = {
  title: string
  /** Meta description and the index-card subtitle. */
  description: string
  /** Short label for cross-links between guides. */
  shortTitle: string
  /**
   * Answer-first block rendered above the article ("Коротко"). 40-60 words,
   * facts taken from the article itself. Omitted where the article already
   * opens with its own short answer.
   */
  summary?: string
  /**
   * Questions shown visibly under the article AND emitted as FAQPage markup
   * from this same list -- markup without the visible text is not allowed.
   */
  faq?: GuideFaqItem[]
}

export type Guide = {
  slug: string
  updated: string
  /** First release date, if known and different from `updated`. */
  published?: string
  /** Slugs of free tools (see tools-i18n/toolsIndex.ts) shown as "Related tools". */
  relatedTools: string[]
  /** Slugs of other guides shown under "Read also". */
  relatedGuides: string[]
  ru: GuideCopy
  kk: GuideCopy
}

export const GUIDES: Guide[] = [
  {
    slug: 'komissiya-kaspi',
    updated: '2026-10-22',
    relatedTools: ['margin', 'waybills', 'nalogi'],
    relatedGuides: ['nalogi-ip-uproshchenka-2026', 'kak-otkryt-ip-2026'],
    ru: {
      shortTitle: 'Комиссия Kaspi Магазина',
      title: 'Комиссия Kaspi Магазина 2026: сколько забирает маркетплейс',
      description:
        'Ставки комиссии Kaspi Магазина по категориям — 7,3%, 12,5% и 15,5% с НДС. Почему минимальная цена выше суммы расходов и как посчитать прибыль с продажи.',
    },
    kk: {
      shortTitle: 'Kaspi Магазин комиссиясы',
      title: 'Kaspi Магазин комиссиясы 2026: маркетплейс қанша ұстайды',
      description:
        'Kaspi Магазин комиссиясының санаттар бойынша мөлшерлемелері — ҚҚС-пен 7,3%, 12,5% және 15,5%. Ең төмен баға неге шығындардан жоғары және сатудан не қалады.',
    },
  },
  {
    slug: 'nakladnye-kaspi-odnim-pdf',
    updated: '2026-10-23',
    relatedTools: ['waybills', 'margin'],
    relatedGuides: ['komissiya-kaspi', 'kak-vystavit-schet-ip'],
    ru: {
      shortTitle: 'Накладные Kaspi одним PDF',
      title: 'Накладные Kaspi одним PDF: печать 4 на А4 или А6',
      description:
        'Как объединить накладные Kaspi в один PDF: 4 на лист А4 или по одной в А6 для термопринтера. Порядок действий, лимиты и ответы на частые вопросы.',
      summary:
        'Чтобы напечатать накладные Kaspi одним PDF, скачайте их в кабинете Kaspi Магазина PDF-файлами или ZIP-архивом, загрузите в бесплатный инструмент invoices.kz, выберите А4 (4 накладные на лист) или А6 (по одной на этикетку) и скачайте готовый файл. За раз — до 30 накладных, 5 склеек в месяц бесплатно.',
      faq: [
        {
          q: 'Как объединить накладные Kaspi в один PDF?',
          a: 'Скачайте накладные в кабинете Kaspi Магазина PDF-файлами или ZIP-архивом, загрузите их в инструмент invoices.kz как есть, выберите А4 (по 4 на лист) или А6 (по одной) и нажмите «Склеить и скачать PDF». За один раз можно объединить до 30 накладных.',
        },
        {
          q: 'Сколько накладных помещается на лист А4 и можно ли печатать на А6 для термопринтера?',
          a: 'На лист А4 помещается 4 накладные, потом лист разрезается на четыре; 30 накладных занимают 8 листов. А6 — для термопринтера этикеток: одна накладная на этикетку.',
        },
        {
          q: 'Это бесплатно и какие есть лимиты?',
          a: '5 склеек в месяц с одной сети (IP) — бесплатно и без регистрации; регистрация лимит не меняет, он обновляется 1-го числа. В одну склейку входит до 30 накладных. Без ограничений — в Kaspi Bot на тарифе Про.',
        },
        {
          q: 'Нужно ли подключать магазин и что такое Kaspi Bot?',
          a: 'Нет, для инструмента не нужно ни подключать магазин, ни регистрироваться — достаточно скачанных накладных. Kaspi Bot — продукт invoices.kz для продавцов Kaspi Магазина: на тарифе Про накладные приходят из Kaspi сами, их не нужно скачивать и склеивать.',
        },
        {
          q: 'Куда попадают файлы накладных?',
          a: 'Никуда: файлы склеиваются в памяти сервера и сразу возвращаются вам, мы их не сохраняем. ZIP-архив распаковывается прямо в вашем браузере.',
        },
      ],
    },
    kk: {
      shortTitle: 'Kaspi жүкқұжаттары бір PDF-те',
      title: 'Kaspi жүкқұжаттарын бір PDF-пен басып шығару: А4 немесе А6',
      description:
        'Kaspi жүкқұжаттарын бір PDF-ке қалай біріктіруге болады: А4 парағына 4-тен немесе термопринтерге А6. Қадамдар, шектеулер және жиі қойылатын сұрақтар.',
      summary:
        'Kaspi жүкқұжаттарын бір PDF-пен басып шығару үшін оларды Kaspi Магазин кабинетінен PDF-файлдар немесе ZIP-архив түрінде жүктеп алыңыз, тегін invoices.kz құралына жүктеңіз, А4 (парақта 4 жүкқұжат) немесе А6 (әр заттаңбаға біреу) форматын таңдап, дайын файлды алыңыз. Бір ретте 30 жүкқұжатқа дейін, айына 5 біріктіру тегін.',
      faq: [
        {
          q: 'Kaspi жүкқұжаттарын бір PDF-ке қалай біріктіруге болады?',
          a: 'Kaspi Магазин кабинетінен жүкқұжаттарды PDF-файлдар немесе ZIP-архив түрінде жүктеп алыңыз, оларды invoices.kz құралына сол күйінде жүктеңіз, А4 (парақта 4-тен) немесе А6 (бір-бірден) форматын таңдап, «Біріктіріп, PDF жүктеп алу» батырмасын басыңыз. Бір ретте 30 жүкқұжатқа дейін біріктіруге болады.',
        },
        {
          q: 'А4 парағына неше жүкқұжат сияды және А6 форматын термопринтерге басуға бола ма?',
          a: 'А4 парағына 4 жүкқұжат орналасады, кейін парақты төртке қиясыз; 30 жүкқұжат 8 парақты алады. А6 — заттаңба басатын термопринтерге: әр заттаңбаға бір жүкқұжат.',
        },
        {
          q: 'Бұл тегін бе және қандай шектеулер бар?',
          a: 'Бір желіден (IP мекенжайынан) айына 5 біріктіру — тегін және тіркелусіз; тіркелу шектеуді өзгертпейді, ол әр айдың 1-күні жаңарады. Бір біріктіруге 30 жүкқұжатқа дейін кіреді. Шектеусіз — Про тарифіндегі Kaspi Bot-та.',
        },
        {
          q: 'Дүкенді қосу керек пе және Kaspi Bot деген не?',
          a: 'Жоқ, құрал үшін дүкенді қосудың да, тіркелудің де қажеті жоқ — жүктеп алынған жүкқұжаттар жеткілікті. Kaspi Bot — Kaspi Магазин сатушыларына арналған invoices.kz өнімі: Про тарифінде жүкқұжаттар Kaspi-ден өздігінен келеді, оларды жүктеп алып, біріктірудің қажеті жоқ.',
        },
        {
          q: 'Жүкқұжат файлдары қайда сақталады?',
          a: 'Ешқайда: файлдар сервер жадында біріктіріліп, бірден өзіңізге қайтарылады — біз оларды сақтамаймыз. ZIP-архив тікелей браузеріңізде ашылады.',
        },
      ],
    },
  },
  {
    slug: 'kak-vystavit-schet-ip',
    updated: '2026-10-22',
    relatedTools: ['schet', 'kontragent', 'avr'],
    relatedGuides: ['dokumenty-ip-kazakhstan', 'proverka-kontragenta', 'penya-za-prosrochku'],
    ru: {
      shortTitle: 'Как выставить счёт',
      title: 'Как выставить счёт на оплату ИП: реквизиты и ошибки',
      description:
        'Как выставить счёт на оплату от ИП и ТОО: какие нужны реквизиты (БИН/ИИН, банк, ИИК, БИК), частые ошибки и как отправить счёт клиенту за минуту.',
      summary:
        'В счёте на оплату указывают: поставщика (название ИП или ТОО, БИН или ИИН, адрес), банк, ИИК и БИК, покупателя с его БИН, номер и дату счёта, позиции с количеством, ценой и итогом. Плательщик НДС выделяет налог отдельной строкой, остальные пишут «без НДС». Форма законом не установлена, подпись и печать ускоряют оплату.',
      faq: [
        {
          q: 'Как выставить счёт на оплату от ИП?',
          a: 'Укажите название ИП, ИИН и адрес, банк, ИИК и БИК, покупателя с его БИН или ИИН, номер и дату счёта, а затем перечень позиций с количеством, ценой и итогом. Плательщик НДС выделяет налог отдельной строкой, остальные пишут «без НДС». Отправьте клиенту PDF или ссылку, а не фотографию.',
        },
        {
          q: 'Какие реквизиты нужны для выставления счёта?',
          a: 'Название и БИН (для ИП — ИИН) поставщика, юридический адрес, наименование банка, ИИК и БИК, название и БИН покупателя, номер и дата счёта. Без банковских реквизитов платить некуда, поэтому такой счёт бесполезен.',
        },
        {
          q: 'Обязательны ли подпись и печать на счёте?',
          a: 'Формально для счёта не обязательны, но на практике ускоряют оплату: без них осторожный бухгалтер задаёт лишние вопросы. Адрес и телефон покупателя указывать не обязательно, на прохождение платежа они не влияют.',
        },
        {
          q: 'Почему счёт на оплату не оплачивают?',
          a: 'Чаще всего из-за неверного БИК или ИИК, не того БИН контрагента, отсутствия расшифровки позиций или счёта, присланного картинкой вместо PDF.',
        },
      ],
    },
    kk: {
      shortTitle: 'Шотты қалай шығару керек',
      title: 'Төлемге шотты қалай шығару керек: ЖК үшін деректемелер',
      description:
        'ЖК және ЖШС төлемге шотты қалай шығарады: қандай деректемелер керек (БСН/ЖСН, банк, ЖСК, БСК), шот неге төленбейді және клиентке қалай жіберу керек.',
      summary:
        'Төлемге шотта мыналар көрсетіледі: жеткізуші (ЖК немесе ЖШС атауы, БСН немесе ЖСН, мекенжай), банк, ЖСК және БСК, сатып алушы және оның БСН-і, шоттың нөмірі мен күні, саны, бағасы және жиынтығы бар позициялар. ҚҚС төлеушісі салықты бөлек жолмен көрсетеді, қалғандары «ҚҚС-сыз» деп жазады. Шоттың нысаны заңмен бекітілмеген, қолтаңба мен мөр төлемді жылдамдатады.',
      faq: [
        {
          q: 'ЖК-дан төлемге шотты қалай шығару керек?',
          a: 'ЖК атауын, ЖСН мен мекенжайды, банкті, ЖСК мен БСК-ны, сатып алушыны оның БСН-імен немесе ЖСН-імен, шоттың нөмірі мен күнін, содан кейін саны, бағасы және жиынтығы бар позициялар тізімін көрсетіңіз. ҚҚС төлеушісі салықты бөлек жолмен көрсетеді, қалғандары «ҚҚС-сыз» деп жазады. Клиентке сурет емес, PDF немесе сілтеме жіберіңіз.',
        },
        {
          q: 'Шот шығару үшін қандай деректемелер керек?',
          a: 'Жеткізушінің атауы мен БСН-і (ЖК үшін — ЖСН), заңды мекенжай, банк атауы, ЖСК және БСК, сатып алушының атауы мен БСН-і, шоттың нөмірі мен күні. Банк деректемелері болмаса, төлем жасайтын жер жоқ, сондықтан мұндай шот пайдасыз.',
        },
        {
          q: 'Шотқа қолтаңба мен мөр міндетті ме?',
          a: 'Шот үшін формальды түрде міндетті емес, бірақ іс жүзінде төлемді жылдамдатады: оларсыз сақ бухгалтер қосымша сұрақ қояды. Сатып алушының мекенжайы мен телефонын көрсету міндетті емес, олар төлемнің өтуіне әсер етпейді.',
        },
        {
          q: 'Шот неге төленбей қалады?',
          a: 'Көбіне қате БСК немесе ЖСК, контрагенттің қате БСН-і, позициялардың толық жазылмауы немесе PDF орнына сурет болып жіберілгені себепті.',
        },
      ],
    },
  },
  {
    slug: 'dokumenty-ip-kazakhstan',
    updated: '2026-10-22',
    relatedTools: ['schet', 'avr', 'nakladnaya', 'kp'],
    relatedGuides: ['kak-vystavit-schet-ip', 'esf-kazakhstan-2026'],
    ru: {
      shortTitle: 'Счёт, АВР, накладная и КП',
      title: 'Счёт, АВР, накладная и КП: чем отличаются и когда нужны',
      description:
        'Счёт на оплату, акт выполненных работ, накладная и коммерческое предложение простыми словами: что подтверждает каждый документ и когда его выставляют.',
      summary:
        'Счёт на оплату говорит, сколько и куда платить. АВР подтверждает, что работа выполнена и принята. Накладная подтверждает, что товар передан покупателю. КП показывает состав и цену до сделки и ни к чему не обязывает. Обычный порядок: КП, затем счёт, затем АВР для услуг или накладная для товара. ЭСФ — отдельный налоговый документ.',
    },
    kk: {
      shortTitle: 'Шот, ОЖА, жүкқұжат және КҰ',
      title: 'Шот, ОЖА, жүкқұжат және КҰ: айырмашылығы және қашан қажет',
      description:
        'Төлемге шот, орындалған жұмыстар актісі, жүкқұжат және коммерциялық ұсыныс қарапайым тілмен: әрбір құжат нені растайды және қашан шығарылады.',
      summary:
        'Төлемге шот қанша және қайда төлеу керектігін көрсетеді. ОЖА жұмыстың орындалғанын және қабылданғанын растайды. Жүкқұжат тауардың сатып алушыға берілгенін растайды. КҰ мәмілеге дейін құрамы мен бағасын көрсетеді және ешкімді міндеттемейді. Әдеттегі реті: КҰ, содан кейін шот, содан кейін қызмет үшін ОЖА немесе тауар үшін жүкқұжат. ЭШФ — бөлек салықтық құжат.',
    },
  },
  {
    slug: 'proverka-kontragenta',
    updated: '2026-10-22',
    relatedTools: ['kontragent', 'schet'],
    relatedGuides: ['kak-vystavit-schet-ip', 'penya-za-prosrochku'],
    ru: {
      shortTitle: 'Проверка контрагента',
      title: 'Как проверить контрагента по БИН в Казахстане: пошагово',
      description:
        'Что проверить перед сделкой: статус компании, неблагонадёжность по КГД, ликвидацию, налоговый долг и НДС. Официальные источники и бесплатная проверка.',
      summary:
        'Перед сделкой по БИН (для ИП — ИИН) проверьте пять вещей: компания существует и действует, не числится в списке неблагонадёжных КГД, не находится в ликвидации, не имеет налоговой задолженности и стоит на учёте по НДС, если вам нужен зачёт. Это открытые данные, а бесплатный инструмент показывает их одним экраном.',
    },
    kk: {
      shortTitle: 'Контрагентті тексеру',
      title: 'Контрагентті БСН бойынша қалай тексеру: қадам-қадаммен',
      description:
        'Мәміле алдында нені тексеру керек: компания мәртебесі, МКК сенімсіздер тізімі, тарату, салық берешегі және ҚҚС. Ресми дереккөздер және тегін тексеру.',
      summary:
        'Мәміле алдында БСН (ЖК үшін — ЖСН) бойынша бес нәрсені тексеріңіз: компания бар және әрекет етеді, МКК сенімсіздер тізімінде жоқ, тарату сатысында емес, салық берешегі жоқ және ҚҚС есепке жатқызу қажет болса, ҚҚС бойынша есепте тұр. Бұл ашық деректер, ал тегін құрал оларды бір экранда көрсетеді.',
    },
  },
  {
    slug: 'nalogi-ip-uproshchenka-2026',
    updated: '2026-10-22',
    relatedTools: ['nalogi', 'margin'],
    relatedGuides: ['kak-otkryt-ip-2026', 'esf-kazakhstan-2026', 'komissiya-kaspi'],
    ru: {
      shortTitle: 'Налоги ИП на упрощёнке — 2026',
      title: 'Налоги ИП на упрощёнке в 2026: ставка 4% и взносы',
      description:
        'С 1 января 2026 ставка упрощёнки — 4% вместо 3%, лимит дохода 600 000 МРП, патент и розничный налог отменены. Сколько и когда платит ИП, включая взносы.',
      summary:
        'С 1 января 2026 года ИП на упрощённой декларации платит 4% от дохода без вычета расходов; маслихаты могут менять ставку от 2% до 6%. Лимит дохода — 600 000 МРП, патент и розничный налог отменены. Декларация 910 сдаётся раз в полугодие, а взносы за себя ИП платит каждый месяц отдельно от налога.',
    },
    kk: {
      shortTitle: 'ЖК салықтары — 2026',
      title: 'ЖК салықтары 2026: оңайлатылған декларация, 4% мөлшерлеме',
      description:
        '2026 жылғы 1 қаңтардан оңайлатылған декларация мөлшерлемесі 4%, табыс шегі — 600 000 АЕК, патент пен бөлшек салық жойылды. ЖК қанша және қашан төлейді.',
      summary:
        '2026 жылғы 1 қаңтардан оңайлатылған декларациядағы ЖК шығыстарды шегермей, табыстан 4% төлейді; мәслихаттар мөлшерлемені 2%-дан 6%-ға дейін өзгерте алады. Табыс шегі — 600 000 АЕК, патент пен бөлшек салық алынып тасталды. 910 нысаны жарты жылда бір рет тапсырылады, ал өзі үшін жарналарды ЖК салықтан бөлек ай сайын төлейді.',
    },
  },
  {
    slug: 'esf-kazakhstan-2026',
    updated: '2026-10-22',
    relatedTools: ['schet', 'nalogi'],
    relatedGuides: ['nalogi-ip-uproshchenka-2026', 'kak-vystavit-schet-ip', 'dokumenty-ip-kazakhstan'],
    ru: {
      shortTitle: 'ЭСФ — кто обязан',
      title: 'ЭСФ в 2026 году: кто обязан выписывать в Казахстане',
      description:
        'ЭСФ по новому Налоговому кодексу: кто обязан выписывать (не только плательщики НДС), в какие сроки, когда можно не выписывать и чем он отличается от счёта.',
      summary:
        'ЭСФ — налоговый документ, он выписывается в ИС ЭСФ с подписью ЭЦП и не заменяет счёт на оплату. В 2026 году его обязаны выписывать не только плательщики НДС, но и продавцы импортных товаров, посредники и ряд других. Срок — до 15-го календарного дня после оборота. Продажу физлицу с чеком ККМ выписывать не нужно.',
    },
    kk: {
      shortTitle: 'ЭШФ — кім міндетті',
      title: '2026 жылы ЭШФ: Қазақстанда кім жазуға міндетті',
      description:
        'Жаңа Салық кодексі бойынша ЭШФ: кім жазуға міндетті (ҚҚС төлеушілер ғана емес), мерзімі, қашан жазбауға болады және шоттан айырмашылығы.',
      summary:
        'ЭШФ — салықтық құжат, ол ЭШФ АЖ-де ЭЦҚ-мен жазылады және төлемге шотты алмастырмайды. 2026 жылы оны ҚҚС төлеушілер ғана емес, импортталған тауар сатушылар, делдалдар және басқа да бірқатар санаттар жазуға міндетті. Мерзім — айналым күнінен кейінгі 15-ші күнтізбелік күнге дейін. ККМ чегімен расталған жеке тұлғаға сатуды жазу қажет емес.',
    },
  },
  {
    slug: 'penya-za-prosrochku',
    updated: '2026-10-22',
    relatedTools: ['schet', 'kontragent'],
    relatedGuides: ['kak-vystavit-schet-ip', 'proverka-kontragenta'],
    ru: {
      shortTitle: 'Пеня за просрочку оплаты',
      title: 'Пеня за просрочку оплаты: расчёт по ст. 353 ГК РК',
      description:
        'Как посчитать законную неустойку за просрочку оплаты: формула от базовой ставки Нацбанка, пример в тенге и как предъявить претензию.',
      summary:
        'Если клиент просрочил оплату, вы вправе требовать неустойку по статье 353 ГК РК, даже если в договоре о пене ничего нет. Законная пеня равна долгу, умноженному на базовую ставку Нацбанка и на дни просрочки, делённому на 365. Если договор называет свою ставку, применяется она. Сначала напомните, затем направьте письменную претензию с расчётом.',
    },
    kk: {
      shortTitle: 'Кешіктіру өсімпұлы',
      title: 'Төлемді кешіктіргені үшін өсімпұл: АК 353-бабы бойынша',
      description:
        'Төлемді кешіктіргені үшін заңды тұрақсыздық айыбы қалай есептеледі: Ұлттық банктің базалық мөлшерлемесінен формула және теңгемен мысал.',
      summary:
        'Клиент төлемді кешіктірсе, шартта өсімпұл туралы ештеңе жазылмаса да, ҚР АК 353-бабы бойынша тұрақсыздық айыбын талап етуге құқығыңыз бар. Заңды өсімпұл — борышты Ұлттық банктің базалық мөлшерлемесіне және кешіктірілген күндерге көбейтіп, 365-ке бөлгенге тең. Шартта өз мөлшерлемесі болса, сол қолданылады. Алдымен еске салыңыз, содан кейін есебі бар жазбаша талап жіберіңіз.',
    },
  },
  {
    slug: 'kak-otkryt-ip-2026',
    updated: '2026-10-22',
    relatedTools: ['nalogi', 'schet', 'kontragent'],
    relatedGuides: ['nalogi-ip-uproshchenka-2026', 'kak-vystavit-schet-ip'],
    ru: {
      shortTitle: 'Как открыть ИП — 2026',
      title: 'Как открыть ИП в Казахстане в 2026: пошагово и онлайн',
      description:
        'Регистрация ИП в 2026: уведомительный порядок через eGov или приложение банка, какие документы нужны, как выбрать ОКЭД и режим — и что сделать сразу после.',
      summary:
        'ИП в Казахстане регистрируется бесплатно, онлайн и в уведомительном порядке: на egov.kz нужна услуга «Уведомление о начале деятельности в качестве индивидуального предпринимателя», подписанная ЭЦП. Результат — талон, работать можно сразу. Заранее выберите ОКЭД и налоговый режим, после регистрации откройте расчётный счёт и запомните сроки формы 910.',
    },
    kk: {
      shortTitle: 'ЖК қалай ашу — 2026',
      title: '2026 жылы Қазақстанда ЖК қалай ашу керек: онлайн, тегін',
      description:
        '2026 жылы ЖК тіркеу: eGov немесе банк қосымшасы арқылы хабарлама тәртібі, қандай құжаттар қажет, ҚЭЖЖ мен салық режимін таңдау және одан кейін не істеу.',
      summary:
        'Қазақстанда ЖК тегін, онлайн және хабарлама тәртібімен тіркеледі: egov.kz сайтында ЭЦҚ-мен қол қойылатын «Жеке кәсіпкер ретінде қызметті бастағаны туралы хабарлама» қызметі керек. Нәтиже — талон, жұмысты бірден бастауға болады. Алдын ала ҚЭЖЖ мен салық режимін таңдаңыз, тіркелгеннен кейін есеп шотын ашыңыз және 910 нысанының мерзімдерін есте сақтаңыз.',
    },
  },
]

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug)
}

export function otherGuides(slug: string): Guide[] {
  return GUIDES.filter(g => g.slug !== slug)
}

/** Guides to show under "Read also": the curated list, else every other guide. */
export function relatedGuidesOf(guide: Guide): Guide[] {
  const picked = guide.relatedGuides
    .map(getGuide)
    .filter((g): g is Guide => g !== undefined && g.slug !== guide.slug)
  return picked.length > 0 ? picked : otherGuides(guide.slug)
}

export function guidePath(slug: string, lang: GuideLang): string {
  return lang === 'kk' ? `/guides/kk/${slug}` : `/guides/${slug}`
}

export function guidesIndexPath(lang: GuideLang): string {
  return lang === 'kk' ? '/guides/kk' : '/guides'
}

/**
 * Both language versions of one guide, for `alternates.languages` (hreflang)
 * and the sitemap. x-default points at the Russian URL, the same convention
 * the tools use (toolAlternates).
 */
export function guideAlternates(slug: string): Record<GuideLang | 'x-default', string> {
  return {
    ru: `https://invoices.kz${guidePath(slug, 'ru')}`,
    kk: `https://invoices.kz${guidePath(slug, 'kk')}`,
    'x-default': `https://invoices.kz${guidePath(slug, 'ru')}`,
  }
}

/** hreflang set of the two guide index pages. */
export function guidesIndexAlternates(): Record<GuideLang | 'x-default', string> {
  return {
    ru: 'https://invoices.kz/guides',
    kk: 'https://invoices.kz/guides/kk',
    'x-default': 'https://invoices.kz/guides',
  }
}

const BRAND_SUFFIX = ' | invoices.kz'
const TITLE_MAX = 60

/**
 * <title> of a guide: keyword first, brand last, and the brand only when the
 * whole string still fits the ~60 characters a SERP shows.
 */
export function guideMetaTitle(title: string): string {
  return title.length + BRAND_SUFFIX.length <= TITLE_MAX ? `${title}${BRAND_SUFFIX}` : title
}

/** datePublished: the explicit first-release date, else the last-edit date. */
export function guidePublished(guide: Guide): string {
  return guide.published ?? guide.updated
}

const LOCALE: Record<GuideLang, string> = { ru: 'ru-KZ', kk: 'kk-KZ' }
const CRUMBS: Record<GuideLang, { home: string; section: string }> = {
  ru: { home: 'Главная', section: 'Полезное' },
  kk: { home: 'Басты бет', section: 'Пайдалы' },
}

/**
 * schema.org graph of one guide page: Article (author and publisher are the
 * Organization, never an invented person), BreadcrumbList and -- only when the
 * guide carries visible FAQ items -- FAQPage built from those same items.
 */
export function guideJsonLdData(guide: Guide, lang: GuideLang) {
  const copy = guide[lang]
  const crumbs = CRUMBS[lang]
  const url = `https://invoices.kz${guidePath(guide.slug, lang)}`
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: copy.title,
      description: copy.description,
      inLanguage: LOCALE[lang],
      dateModified: guide.updated,
      datePublished: guidePublished(guide),
      mainEntityOfPage: url,
      author: { '@id': 'https://invoices.kz/#organization' },
      publisher: { '@id': 'https://invoices.kz/#organization' },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: crumbs.home, item: 'https://invoices.kz' },
        {
          '@type': 'ListItem',
          position: 2,
          name: crumbs.section,
          item: `https://invoices.kz${guidesIndexPath(lang)}`,
        },
        { '@type': 'ListItem', position: 3, name: copy.title, item: url },
      ],
    },
  ]
  if (copy.faq && copy.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      inLanguage: LOCALE[lang],
      mainEntity: copy.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    })
  }
  return { '@context': 'https://schema.org', '@graph': graph }
}
