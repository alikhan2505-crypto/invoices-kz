import type { ToolLang, ToolSeoCopy } from '@/lib/tools-i18n'

// Все тексты /tools/kontragent на трёх языках: и <head> (seo), и интерфейс.
// Русский — дословно прежний текст страницы, чтобы не сбить уже набранную
// выдачу. Суммы и даты форматируются снаружи (formatTenge / formatIsoDate) и
// приходят сюда готовыми строками.

export interface KontragentDict {
  seo: ToolSeoCopy
  h1: string
  intro: string
  binLabel: string
  binPlaceholder: string
  check: string
  checking: string
  remaining: (n: number) => string
  errGeneric: string
  errNetwork: string
  errUnavailable: string
  errInvalidBin: string
  busy: string
  notFoundTitle: string
  notFoundBody: string
  /** Оба реестра не ответили: это не «не найдено», и попытка из лимита не списывается. */
  unavailableTitle: string
  unavailableBody: string
  limitTitle: string
  limitBody: string
  limitButton: string
  /** Тот же блок для вошедшего (с 15.10.2026): вместо фразы о регистрации — «продолжите в кабинете». */
  limitBodySignedIn: string
  binPrefix: string
  registered: (date: string) => string
  kgdNote: string
  unknown: string
  unreliable: { label: string; ok: string; bad: string }
  liquidation: { label: string; ok: string; bad: string }
  arrear: {
    label: string
    ok: string
    bad: (total: string, tax: string | null) => string
    badGeneric: string
    unknown: string
  }
  vat: { label: string; payer: (since: string | null) => string; notPayer: string; unknown: string }
  fullCardTitle: string
  fullCardBody: string
  fullCardLink: string
  /** Для вошедшего: без «после регистрации», ссылка ведёт в счёт кабинета. */
  fullCardTitleSignedIn: string
  fullCardBodySignedIn: string
  fullCardLinkSignedIn: string
  sources: string
  /** Что инструмент не проверяет + ссылка на гайд proverka-kompanii-po-bin-chto-mozhno-uznat (en — русский гайд). */
  notCheckedNote: string
  notCheckedLink: string
  /** Ссылка на гайд proverka-kontragenta (en — русский гайд, подпись это говорит). */
  guideLink: string
  /** Статус из реестра приходит по-русски (statusru) — переводим известные. */
  status: (raw: string) => string
  /** Пояснения под инструментом; те же вопросы уходят в FAQPage JSON-LD. */
  faq: { title: string; items: ReadonlyArray<{ q: string; a: string }> }
}

// Реестр отдаёт статус только по-русски; переводим то, что встречается, а
// незнакомое показываем как есть — лучше русское слово, чем пустое место.
// Порядок важен: «бездействующий» проверяется раньше «действующего».
const STATUS: Array<{ re: RegExp; kk: string; en: string }> = [
  { re: /^зарегистрирован/i, kk: 'Тіркелген', en: 'Registered' },
  { re: /^ликвидирован/i, kk: 'Таратылған', en: 'Liquidated' },
  { re: /^(в стадии|в процессе) ликвидации/i, kk: 'Тарату сатысында', en: 'In liquidation' },
  { re: /^приостановлен/i, kk: 'Қызметі тоқтатыла тұрған', en: 'Suspended' },
  { re: /^реорганизован/i, kk: 'Қайта ұйымдастырылған', en: 'Reorganized' },
  { re: /^бездействующ/i, kk: 'Әрекетсіз', en: 'Inactive' },
  { re: /^действующ/i, kk: 'Жұмыс істеп тұр', en: 'Active' },
  { re: /^снят с (учета|учёта|регистрации)/i, kk: 'Тіркеуден шығарылған', en: 'Deregistered' },
]
const translateStatus = (lang: 'kk' | 'en') => (raw: string) =>
  STATUS.find(s => s.re.test(raw.trim()))?.[lang] ?? raw

export const kontragentDict: Record<ToolLang, KontragentDict> = {
  ru: {
    seo: {
      title: 'Проверка контрагента по БИН — бесплатно',
      description:
        'Проверьте контрагента по БИН за секунды: неблагонадёжность, ликвидация, налоговая задолженность, статус плательщика НДС. Данные КГД РК, бесплатно.',
      keywords:
        'проверка контрагента по бин, проверить бин казахстан, неблагонадёжный налогоплательщик кгд, проверить тоо по бин, налоговая задолженность по бин, плательщик ндс проверить бин, ликвидация тоо проверка',
      ogTitle: 'Проверка контрагента по БИН — бесплатно',
      ogDescription:
        'Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным реестрам КГД РК. Без регистрации.',
      ogImageAlt: 'Проверка контрагента — invoices.kz',
    },
    h1: 'Проверка контрагента по БИН',
    intro:
      'Неблагонадёжность, ликвидация, налоговая задолженность и НДС — по официальным данным КГД РК и реестра юридических лиц. Бесплатно: 3 проверки в квартал.',
    binLabel: 'БИН / ИИН контрагента',
    binPlaceholder: '12 цифр',
    check: 'Проверить',
    checking: 'Проверяем…',
    remaining: n =>
      n > 0
        ? `Осталось ${n} из 3 бесплатных проверок в этом квартале`
        : 'Бесплатные проверки в этом квартале закончились — следующие с начала нового квартала',
    errGeneric: 'Не получилось проверить, попробуйте ещё раз',
    errNetwork: 'Не получилось проверить — проверьте интернет и попробуйте ещё раз',
    errUnavailable: 'Сервис временно недоступен, попробуйте позже',
    errInvalidBin: 'БИН должен состоять из 12 цифр',
    busy: 'Инструмент сегодня перегружен — попробуйте завтра. Внутри платформы проверки работают без общей очереди.',
    notFoundTitle: 'По этому БИН ничего не нашлось',
    notFoundBody:
      'Ни в реестре юридических лиц, ни в базе КГД. Проверьте цифры — или это очень свежая регистрация, реестры обновляются с задержкой до суток.',
    unavailableTitle: 'Реестры сейчас не ответили',
    unavailableBody:
      'Это не значит, что компании нет: ни реестр юридических лиц, ни база КГД не дали ответа. Попытка не списана, повторите проверку чуть позже.',
    limitTitle: '3 бесплатные проверки в этом квартале закончились',
    limitBody:
      'В кабинете invoices.kz проверки без лимита — плюс полная карточка контрагента (адрес, руководитель, вид деятельности) и автозаполнение реквизитов прямо в счёте. Регистрация бесплатная, по ссылке на почту.',
    limitButton: 'Зарегистрироваться бесплатно',
    limitBodySignedIn:
      'В кабинете invoices.kz проверка по БИН — без лимита, прямо в счёте: введите БИН клиента, и реквизиты подставятся сами, а налоговый долг и риски будут видны сразу. Продолжите в кабинете invoices.kz.',
    binPrefix: 'БИН',
    registered: d => `зарегистрирован ${d}`,
    kgdNote: 'Данные КГД: для ИП государство публикует только имя и дату регистрации — пустые поля здесь не ошибка.',
    unknown: 'Не удалось проверить — это не значит, что всё в порядке',
    unreliable: {
      label: 'Неблагонадёжность',
      ok: 'Не числится в списке неблагонадёжных налогоплательщиков КГД',
      bad: 'Числится в списке неблагонадёжных — работать с предоплатой рискованно',
    },
    liquidation: {
      label: 'Ликвидация',
      ok: 'Не находится в процессе ликвидации',
      bad: 'Находится на стадии ликвидации по данным КГД',
    },
    arrear: {
      label: 'Налоговая задолженность',
      ok: 'Задолженности перед бюджетом нет',
      bad: (total, tax) => `Долг ${total}${tax ? ` (из них налоги ${tax})` : ''}`,
      badGeneric: 'Есть задолженность',
      unknown: 'Не удалось проверить — это не значит, что долга нет',
    },
    vat: {
      label: 'НДС',
      payer: since => `Плательщик НДС${since ? ` с ${since}` : ''}`,
      notPayer: 'Не является плательщиком НДС',
      unknown: 'Не удалось проверить статус НДС',
    },
    fullCardTitle: '🔒 Адрес, руководитель и вид деятельности — в полной карточке',
    fullCardBody: 'После бесплатной регистрации реквизиты контрагента подставляются в счёт автоматически.',
    fullCardLink: 'Открыть полную карточку →',
    fullCardTitleSignedIn: 'Адрес, руководитель и вид деятельности — в кабинете, в форме счёта',
    fullCardBodySignedIn: 'В кабинете введите БИН клиента при создании счёта — реквизиты подставятся автоматически.',
    fullCardLinkSignedIn: 'Открыть в кабинете →',
    sources:
      'Источники: ГБД «Юридические лица» (data.egov.kz) и сервисы портала КГД РК. Данные обновляются реестрами с задержкой до суток; результат носит справочный характер.',
    notCheckedNote:
      'Здесь не проверяются лицензии, реестр должников исполнительных производств, банкротство, налоговый режим и суды.',
    notCheckedLink: 'Что ещё можно узнать о компании по БИН и где →',
    guideLink: 'Как проверить контрагента по БИН: пошагово →',
    status: raw => raw,
    faq: {
      title: 'Частые вопросы',
      items: [
        {
          q: 'Чем БИН отличается от ИИН?',
          a: 'БИН — 12-значный бизнес-идентификационный номер юридического лица: ТОО, АО, филиала. У ИП и физических лиц вместо него ИИН — тоже 12 цифр. Проверка принимает оба номера; их пишут в счёте, договоре или на сайте компании.',
        },
        {
          q: 'Что значит «неблагонадёжный налогоплательщик»?',
          a: 'КГД ведёт списки компаний и ИП, признанных бездействующими, лжепредприятиями, банкротами, отсутствующими по юридическому адресу или с регистрацией, признанной недействительной. Сделка с таким контрагентом — риск: налоговая может не принять НДС к зачёту, а расходы по сделке — к вычету.',
        },
        {
          q: 'Контрагент на стадии ликвидации — можно ли с ним работать?',
          a: 'Компания в ликвидации закрывается: рассчитывается с кредиторами и обычно не берёт новых обязательств. Предоплату такой компании платить не стоит — после исключения из реестра вернуть деньги будет не с кого.',
        },
        {
          q: 'Чем опасна налоговая задолженность контрагента?',
          a: 'Сам долг сделку не запрещает. Но при неуплате КГД может приостановить расходные операции по банковским счетам должника — и контрагент не сможет ни оплатить ваш счёт, ни вернуть предоплату. При крупном долге надёжнее расчёт по факту поставки, а не предоплата.',
        },
        {
          q: 'Зачем проверять статус плательщика НДС?',
          a: 'Выделить НДС в счёте-фактуре (ЭСФ) вправе только плательщик НДС, и только по такому счёту-фактуре вы примете НДС к зачёту. Если контрагент не плательщик, а в документах выделен НДС, зачёт не пройдёт.',
        },
        {
          q: 'Насколько можно доверять результату?',
          a: 'Данные берутся в момент проверки напрямую из ГБД «Юридические лица» (data.egov.kz) и сервисов портала КГД РК. Реестры обновляются с задержкой до суток, поэтому результат справочный: официальную справку получают на eGov или в кабинете налогоплательщика.',
        },
        {
          q: 'Сколько проверок бесплатно?',
          a: '3 проверки в квартал с одного подключения к интернету (IP-адреса); счётчик обнуляется 1 января, 1 апреля, 1 июля и 1 октября по времени Алматы. В кабинете invoices.kz проверки без лимита, регистрация бесплатная.',
        },
      ],
    },
  },

  kk: {
    seo: {
      title: 'Контрагентті БСН бойынша тексеру — тегін',
      description:
        'Контрагентті БСН бойынша секундтар ішінде тексеріңіз: сенімсіз салық төлеушілер, тарату, салық берешегі, ҚҚС төлеуші мәртебесі. ҚР МКК деректері, тегін.',
      keywords:
        'контрагентті тексеру, контрагентті бсн бойынша тексеру, бсн бойынша тексеру, компанияны бсн бойынша тексеру, сенімсіз салық төлеуші мкк, жшс тексеру бсн, салық берешегін тексеру, ққс төлеушіні тексеру, жк жсн бойынша тексеру, тарату жшс тексеру',
      ogTitle: 'Контрагентті БСН бойынша тегін тексеру',
      ogDescription:
        'Сенімсіздік, тарату, салық берешегі және ҚҚС — ҚР МКК ресми тізілімдері бойынша. Тіркелусіз.',
      ogImageAlt: 'Контрагентті тексеру — invoices.kz',
    },
    h1: 'Контрагентті БСН бойынша тексеру',
    intro:
      'Сенімсіз салық төлеуші мәртебесі, тарату, салық берешегі және ҚҚС — ҚР МКК мен заңды тұлғалар тізілімінің ресми деректері бойынша. Тегін: тоқсанына 3 тексеру.',
    binLabel: 'Контрагенттің БСН / ЖСН',
    binPlaceholder: '12 цифр',
    check: 'Тексеру',
    checking: 'Тексеріп жатырмыз…',
    remaining: n =>
      n > 0
        ? `Осы тоқсанда тағы ${n} тегін тексеру қалды (тоқсанына 3)`
        : 'Осы тоқсандағы тегін тексерулер таусылды — келесілері жаңа тоқсаннан басталады',
    errGeneric: 'Тексеру мүмкін болмады, қайталап көріңіз',
    errNetwork: 'Тексеру мүмкін болмады — интернетті тексеріп, қайталап көріңіз',
    errUnavailable: 'Сервис уақытша қолжетімсіз, сәл кейінірек қайталап көріңіз',
    errInvalidBin: 'БСН 12 цифрдан тұруы керек',
    busy: 'Құрал бүгін шамадан тыс жүктелген — ертең қайталап көріңіз. Платформа ішінде тексерулер ортақ кезексіз жұмыс істейді.',
    notFoundTitle: 'Бұл БСН бойынша ештеңе табылмады',
    notFoundBody:
      'Заңды тұлғалар тізілімінде де, МКК базасында да жоқ. Сандарды тексеріңіз — немесе бұл жаңа ғана тіркелген компания: тізілімдер бір тәулікке дейін кешігіп жаңарады.',
    unavailableTitle: 'Тізілімдер қазір жауап бермеді',
    unavailableBody:
      'Бұл компания жоқ дегенді білдірмейді: заңды тұлғалар тізілімі де, МКК базасы да жауап бермеді. Әрекет есептен шығарылған жоқ, сәл кейінірек қайталап көріңіз.',
    limitTitle: 'Осы тоқсандағы 3 тегін тексеру таусылды',
    limitBody:
      'invoices.kz кабинетінде тексеру шектеусіз — оған қоса контрагенттің толық карточкасы (мекенжайы, басшысы, қызмет түрі) бар, ал деректемелер шотқа өзі толтырылады. Тіркелу тегін, поштаға келген сілтеме арқылы.',
    limitButton: 'Тегін тіркелу',
    limitBodySignedIn:
      'invoices.kz кабинетінде БСН бойынша тексеру шектеусіз, тікелей шоттың ішінде: клиенттің БСН-ін енгізсеңіз, деректемелері өзі толтырылады, ал салық қарызы мен тәуекелдер бірден көрінеді. Жұмысты invoices.kz кабинетінде жалғастырыңыз.',
    binPrefix: 'БСН',
    registered: d => `тіркелген күні ${d}`,
    kgdNote: 'МКК деректері: ЖК бойынша мемлекет тек аты-жөні мен тіркелген күнін жариялайды — мұндағы бос өрістер қате емес.',
    unknown: 'Тексеру мүмкін болмады — бұл бәрі дұрыс дегенді білдірмейді',
    unreliable: {
      label: 'Сенімсіз салық төлеуші',
      ok: 'МКК-нің сенімсіз салық төлеушілер тізімінде жоқ',
      bad: 'Сенімсіздер тізімінде тұр — алдын ала төлеммен жұмыс істеу қауіпті',
    },
    liquidation: {
      label: 'Тарату',
      ok: 'Тарату рәсімінде емес',
      bad: 'МКК деректері бойынша тарату сатысында',
    },
    arrear: {
      label: 'Салық берешегі',
      ok: 'Бюджет алдында берешегі жоқ',
      bad: (total, tax) => `Берешегі ${total}${tax ? ` (оның ішінде салықтар — ${tax})` : ''}`,
      badGeneric: 'Берешегі бар',
      unknown: 'Тексеру мүмкін болмады — бұл берешек жоқ дегенді білдірмейді',
    },
    vat: {
      label: 'ҚҚС',
      payer: since => (since ? `${since} бастап ҚҚС төлеуші` : 'ҚҚС төлеуші'),
      notPayer: 'ҚҚС төлеуші емес',
      unknown: 'ҚҚС мәртебесін тексеру мүмкін болмады',
    },
    fullCardTitle: '🔒 Мекенжайы, басшысы және қызмет түрі — толық карточкада',
    fullCardBody: 'Тегін тіркелгеннен кейін контрагенттің деректемелері шотқа автоматты түрде қойылады.',
    fullCardLink: 'Толық карточканы ашу →',
    fullCardTitleSignedIn: 'Мекенжайы, басшысы және қызмет түрі — кабинетте, шот жасау бетінде',
    fullCardBodySignedIn: 'Кабинетте шот жасағанда клиенттің БСН-ін енгізіңіз — деректемелері автоматты түрде қойылады.',
    fullCardLinkSignedIn: 'Кабинетте ашу →',
    sources:
      'Дереккөздер: «Заңды тұлғалар» мемлекеттік деректер базасы (data.egov.kz) және ҚР МКК порталының сервистері. Тізілімдер бір тәулікке дейін кешігіп жаңарады; нәтиже анықтамалық сипатта. Компания атауы мен мәртебесі тізілімде қалай жазылса, солай көрсетіледі — көбіне орыс тілінде.',
    notCheckedNote:
      'Мұнда лицензиялар, атқарушылық өндіріс борышкерлерінің тізілімі, банкроттық, салық режимі және сот істері тексерілмейді.',
    notCheckedLink: 'Компания туралы БСН бойынша тағы нені және қайдан білуге болады →',
    guideLink: 'Контрагентті БСН бойынша қалай тексеруге болады: қадам-қадаммен →',
    status: translateStatus('kk'),
    faq: {
      title: 'Жиі қойылатын сұрақтар',
      items: [
        {
          q: 'БСН мен ЖСН-нің айырмашылығы неде?',
          a: 'БСН — заңды тұлғаның (ЖШС, АҚ, филиал) 12 таңбалы бизнес-сәйкестендіру нөмірі. ЖК мен жеке тұлғаларда оның орнына ЖСН болады — ол да 12 цифрдан тұрады. Тексеру екеуін де қабылдайды; оларды шоттан, шарттан немесе компанияның сайтынан табуға болады.',
        },
        {
          q: '«Сенімсіз салық төлеуші» деген не?',
          a: 'МКК әрекетсіз, жалған кәсіпорын немесе банкрот деп танылған, заңды мекенжайы бойынша табылмаған не тіркелуі жарамсыз деп танылған компаниялар мен ЖК тізімдерін жүргізеді. Мұндай контрагентпен мәміле — тәуекел: салық органы ҚҚС-ты есепке алмауы, ал мәміле бойынша шығыстарды шегерімге қабылдамауы мүмкін.',
        },
        {
          q: 'Контрагент тарату сатысында — онымен жұмыс істеуге бола ма?',
          a: 'Таратылып жатқан компания жабылу үстінде: кредиторлармен есеп айырысады және әдетте жаңа міндеттеме алмайды. Мұндай компанияға алдын ала төлем жасамаған жөн — ол тізілімнен шығарылғаннан кейін ақшаны қайтаратын ешкім болмайды.',
        },
        {
          q: 'Контрагенттің салық берешегі неліктен қауіпті?',
          a: 'Берешектің өзі мәмілеге тыйым салмайды. Бірақ ол төленбесе, МКК борышкердің банк шоттары бойынша шығыс операцияларын тоқтата тұруы мүмкін — сонда контрагент сіздің шотыңызды да төлей алмайды, алдын ала төлемді де қайтара алмайды. Берешек үлкен болса, алдын ала төлемнен гөрі тауар жеткізілгеннен кейін есеп айырысқан сенімдірек.',
        },
        {
          q: 'ҚҚС төлеуші мәртебесін не үшін тексеру керек?',
          a: 'Шот-фактурада (ЭШФ) ҚҚС-ты тек ҚҚС төлеуші бөліп көрсете алады, және тек сондай шот-фактура бойынша ҚҚС-ты есепке ала аласыз. Контрагент ҚҚС төлеуші болмаса, ал құжаттарда ҚҚС бөлінсе, есепке алу өтпейді.',
        },
        {
          q: 'Нәтижеге қаншалықты сенуге болады?',
          a: 'Деректер тексеру сәтінде «Заңды тұлғалар» мемлекеттік деректер базасынан (data.egov.kz) және ҚР МКК порталының сервистерінен тікелей алынады. Тізілімдер бір тәулікке дейін кешігіп жаңарады, сондықтан нәтиже анықтамалық сипатта: ресми анықтаманы eGov-тан немесе салық төлеушінің кабинетінен алады.',
        },
        {
          q: 'Қанша тексеру тегін?',
          a: 'Бір интернет қосылымынан (IP-мекенжайдан) тоқсанына 3 тексеру; есептегіш Алматы уақытымен 1 қаңтарда, 1 сәуірде, 1 шілдеде және 1 қазанда нөлденеді. invoices.kz кабинетінде тексеру шектеусіз, тіркелу тегін.',
        },
      ],
    },
  },

  en: {
    seo: {
      title: 'Check a Company by BIN in Kazakhstan — Free',
      description:
        'Check a Kazakhstan company or sole proprietor by BIN/IIN in seconds: unreliable-taxpayer list, liquidation, tax debt, VAT status. Official KGD data, free.',
      keywords:
        'kazakhstan company check by bin, kazakhstan bin lookup, verify kazakhstan company, counterparty check kazakhstan, kgd unreliable taxpayer, kazakhstan vat payer check, kazakhstan tax debt check, kazakhstan llp check',
      ogTitle: 'Free Kazakhstan company check by BIN',
      ogDescription:
        'Unreliable-taxpayer status, liquidation, tax debt and VAT — from official Kazakhstan State Revenue Committee registers. No sign-up.',
      ogImageAlt: 'Kazakhstan company check — invoices.kz',
    },
    h1: 'Check a Kazakhstan company by BIN',
    intro:
      'Enter a 12-digit BIN (company ID) or IIN (sole proprietor ID) to see unreliable-taxpayer status, liquidation, tax debt and VAT registration — from official data of the State Revenue Committee (KGD) and the legal entity register. Free: 3 checks per quarter.',
    binLabel: 'Company BIN / IIN',
    binPlaceholder: '12 digits',
    check: 'Check',
    checking: 'Checking…',
    remaining: n =>
      n > 0
        ? `${n} of 3 free checks left this quarter`
        : 'No free checks left this quarter — more when the next quarter starts',
    errGeneric: 'The check failed, please try again',
    errNetwork: 'The check failed — check your connection and try again',
    errUnavailable: 'The service is temporarily unavailable, please try later',
    errInvalidBin: 'A BIN must be 12 digits',
    busy: 'The tool is overloaded today — please try again tomorrow. Inside the platform, checks run without the shared queue.',
    notFoundTitle: 'Nothing found for this BIN',
    notFoundBody:
      'Neither the legal entity register nor the KGD database knows it. Double-check the digits — or this is a very recent registration: the registers update with up to a one-day delay.',
    unavailableTitle: 'The registers did not respond just now',
    unavailableBody:
      'This does not mean the company does not exist: neither the legal entity register nor the KGD database answered. The attempt was not counted, so please try again in a little while.',
    limitTitle: 'Your 3 free checks for this quarter are used up',
    limitBody:
      'Inside an invoices.kz account checks are unlimited — plus the full company card (address, director, line of business) and the company details filled into your invoice automatically. Sign-up is free, via an email link.',
    limitButton: 'Sign up for free',
    limitBodySignedIn:
      'In your invoices.kz account BIN checks are unlimited, right inside the invoice: enter the client’s BIN and their details fill in automatically, with tax debt and risks shown at once. Continue in your invoices.kz account.',
    binPrefix: 'BIN',
    registered: d => `registered ${d}`,
    kgdNote: 'KGD data: for sole proprietors the state publishes only the name and registration date — empty fields here are not an error.',
    unknown: 'Could not be checked — this does not mean everything is fine',
    unreliable: {
      label: 'Unreliable taxpayer',
      ok: 'Not on the KGD list of unreliable taxpayers',
      bad: 'On the unreliable-taxpayer list — paying in advance is risky',
    },
    liquidation: {
      label: 'Liquidation',
      ok: 'Not in liquidation',
      bad: 'In liquidation according to KGD',
    },
    arrear: {
      label: 'Tax debt',
      ok: 'No debt to the state budget',
      bad: (total, tax) => `Debt of ${total}${tax ? ` (of which taxes ${tax})` : ''}`,
      badGeneric: 'Has tax debt',
      unknown: 'Could not be checked — this does not mean there is no debt',
    },
    vat: {
      label: 'VAT',
      payer: since => `VAT payer${since ? ` since ${since}` : ''}`,
      notPayer: 'Not a VAT payer',
      unknown: 'Could not check VAT status',
    },
    fullCardTitle: '🔒 Address, director and line of business are in the full card',
    fullCardBody: 'After a free sign-up, a counterparty’s company details are filled into your invoice automatically.',
    fullCardLink: 'Open the full card →',
    fullCardTitleSignedIn: 'Address, director and line of business are in your account, on the invoice form',
    fullCardBodySignedIn: 'In your account, enter the client’s BIN when creating an invoice and their details fill in automatically.',
    fullCardLinkSignedIn: 'Open in my account →',
    sources:
      'Sources: the “Legal Entities” state database (data.egov.kz) and KGD portal services. Registers update with up to a one-day delay; results are for reference only. Company names and statuses are shown as they appear in the register, usually in Russian.',
    notCheckedNote:
      'This check does not cover licences, the enforcement debtors register, bankruptcy, tax regime or court cases.',
    notCheckedLink: 'What else you can learn about a company by BIN, and where (in Russian) →',
    guideLink: 'How to check a counterparty by BIN, step by step (in Russian) →',
    status: translateStatus('en'),
    faq: {
      title: 'Frequently asked questions',
      items: [
        {
          q: 'What is the difference between a BIN and an IIN?',
          a: 'A BIN (business identification number) is the 12-digit ID of a legal entity in Kazakhstan — an LLP (TOO), a JSC or a branch. Sole proprietors (IP) and individuals have a 12-digit IIN (individual identification number) instead. The check accepts both; you will find them on an invoice, a contract or the company’s website.',
        },
        {
          q: 'What is an “unreliable taxpayer”?',
          a: 'Kazakhstan’s State Revenue Committee (KGD) keeps lists of companies and sole proprietors declared inactive, sham companies or bankrupt, not found at their registered address, or whose registration was declared invalid. Doing business with them is risky: the tax authority may refuse your VAT credit and disallow the related expenses as deductions.',
        },
        {
          q: 'The company is in liquidation — can I still work with it?',
          a: 'A company in liquidation is winding up: it settles with its creditors and usually takes on no new obligations. Do not pay it in advance — once it is struck off the register, there will be no one to get the money back from.',
        },
        {
          q: 'Why does a counterparty’s tax debt matter?',
          a: 'Debt on its own does not prohibit a deal. But if it stays unpaid, KGD can freeze outgoing payments from the debtor’s bank accounts — and then the company can neither pay your invoice nor refund a prepayment. With a large debt, it is safer to settle on delivery than to pay up front.',
        },
        {
          q: 'Why check VAT registration?',
          a: 'Only a VAT payer may charge VAT on an electronic invoice (ESF), and you can claim input VAT only from such an invoice. If the counterparty is not registered for VAT but VAT appears in the documents, the credit will not go through.',
        },
        {
          q: 'How reliable is the result?',
          a: 'The data is taken directly, at the moment you check, from the “Legal Entities” state database (data.egov.kz) and KGD portal services. Registers update with up to a one-day delay, so the result is for reference only: an official certificate comes from eGov or the taxpayer’s online account.',
        },
        {
          q: 'How many checks are free?',
          a: '3 checks a quarter per internet connection (IP address); the counter resets on 1 January, 1 April, 1 July and 1 October, Almaty time. Inside an invoices.kz account checks are unlimited, and sign-up is free.',
        },
      ],
    },
  },
}
