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
  /** Дата после статуса, когда слово «зарегистрирован» уже есть в статусе. */
  registeredSince: (date: string) => string
  kgdNote: string
  unknown: string
  unreliable: {
    label: string
    ok: string
    bad: string
    /** «Причина в списке КГД: ...»; перечень причин собирает binRiskText. */
    reasons: (list: string) => string
  }
  /** Банкротство по решению суда: берётся из того же списка КГД, реабилитация показывается отдельной строкой ниже. */
  bankruptcy: { label: string; ok: string; bad: string; unknown: string }
  liquidation: { label: string; ok: string; bad: string }
  arrear: {
    label: string
    ok: string
    bad: (total: string, tax: string | null) => string
    badGeneric: string
    unknown: string
  }
  vat: { label: string; payer: (since: string | null) => string; notPayer: string; unknown: string }
  /** Налоговый режим (КГД, сервис СНР). Нейтральная строка: «хорошо» и «плохо» тут нет. */
  regime: {
    label: string
    unknown: string
    since: (date: string) => string
    until: (date: string) => string
    /** КГД публикует даты режимов только с 01.01.2026: пустая дата не ошибка. */
    datesNote: string
  }
  /** Исполнительные производства: открытые данные Минюста на data.egov.kz. */
  enforcement: {
    label: string
    ok: string
    /** records = все записи реестра, active = из них без даты окончания. */
    bad: (records: string, active: string, amount: string | null, since: string | null) => string
    unknown: string
    /** Оговорка рядом с любым ответом: открытые данные, не справка, дата обновления набора. */
    asOfNote: string
    /** Для ИП: БИН это ИИН человека, запись может быть личной, а не про бизнес. */
    ipNote: string
    /** «Источник: » перед ссылкой на набор данных (условие data.egov.kz). */
    sourcePrefix: string
    sourceLink: string
    /** Ссылка на ручную проверку, когда сервис не ответил (БИН подставить нельзя: reCAPTCHA). */
    manualLink: string
  }
  /** Реестр недобросовестных участников госзакупок (goszakup.gov.kz), 30.10.2026. */
  rnu: {
    label: string
    ok: string
    bad: (records: string) => string
    unknown: string
    note: string
    sourcePrefix: string
    sourceLink: string
  }
  /**
   * Реабилитационная процедура (список должников КГД, суточная выгрузка). Строка
   * показывается, только когда проверка включена (в ответе есть поле rehabilitation).
   */
  rehabilitation: {
    label: string
    ok: string
    /** since = дата вступления решения в силу, уже отформатированная, или null. */
    bad: (since: string | null) => string
    terminated: string
    unknown: string
    note: string
  }
  /** Лицензии: автоматически не проверяем, даём ссылку на поиск с подставленным БИН. */
  permits: { label: string; text: string; link: string }
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
      'Неблагонадёжность, банкротство, ликвидация, налоговая задолженность, НДС, налоговый режим и исполнительные производства — по официальным данным КГД РК, Минюста и реестра юридических лиц. Бесплатно: 3 проверки в квартал.',
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
    registeredSince: d => `с ${d}`,
    kgdNote: 'Данные КГД: для ИП государство публикует только имя и дату регистрации — пустые поля здесь не ошибка.',
    unknown: 'Не удалось проверить — это не значит, что всё в порядке',
    unreliable: {
      label: 'Неблагонадёжность',
      ok: 'Не числится в списке неблагонадёжных налогоплательщиков КГД',
      bad: 'Числится в списке неблагонадёжных — работать с предоплатой рискованно',
      reasons: list => `Причина в списке КГД: ${list}`,
    },
    bankruptcy: {
      label: 'Банкротство',
      ok: 'Решения суда о банкротстве в списке КГД нет',
      bad: 'Признан банкротом по решению суда (список КГД)',
      unknown: 'Не удалось проверить. Это не значит, что банкротства нет',
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
    regime: {
      label: 'Налоговый режим',
      unknown: 'Не удалось проверить налоговый режим',
      since: d => `с ${d}`,
      until: d => `по ${d}`,
      datesNote: 'КГД публикует даты режимов только с 01.01.2026, пустая дата здесь не ошибка',
    },
    enforcement: {
      label: 'Исполнительные производства',
      ok: 'В реестре должников Минюста по открытым данным производств нет',
      bad: (records, active, amount, since) =>
        `В реестре есть записи об исполнительных производствах: ${records}, из них без даты окончания: ${active}${amount ? `, сумма взыскания ${amount}` : ''}${since ? `, самое раннее с ${since}` : ''}`,
      unknown: 'Не удалось проверить. Это не значит, что производств нет',
      asOfNote: 'Открытые данные Минюста на дату обновления набора, это не справка',
      ipNote: 'Для ИП запись может относиться к самому человеку, а не к бизнесу',
      sourcePrefix: 'Источник: ',
      sourceLink: 'открытые данные Минюста РК, data.egov.kz',
      manualLink: 'Проверить вручную на aisoip.adilet.gov.kz (нужна капча)',
    },
    rnu: {
      label: 'Реестр недобросовестных участников госзакупок',
      ok: 'В реестре недобросовестных участников государственных закупок не числится',
      bad: records => `Числится в реестре недобросовестных участников госзакупок (записей: ${records})`,
      unknown: 'Не удалось проверить. Это не значит, что в реестре нет',
      note: 'Реестр портала госзакупок (Минфин РК): включение по решению суда или уполномоченного органа, это не справка',
      sourcePrefix: 'Источник: ',
      sourceLink: 'реестр на портале госзакупок goszakup.gov.kz',
    },
    rehabilitation: {
      label: 'Реабилитационная процедура',
      ok: 'В списке КГД с реабилитационной процедурой не числится',
      bad: since =>
        `Числится в списке КГД: вступило в силу решение суда о реабилитационной процедуре${since ? `, с ${since}` : ''}`,
      terminated: 'Реабилитационная процедура прекращена определением суда (список КГД)',
      unknown: 'Не удалось проверить. Это не значит, что процедуры нет',
      note: 'Список должников КГД, обновляется раз в сутки, это не справка',
    },
    permits: {
      label: 'Лицензии и разрешения',
      text: 'Автоматически не проверяем: у реестра нет открытого API, а поиск закрыт капчей. Откройте поиск с уже подставленным БИН.',
      link: 'Проверить на elicense.kz →',
    },
    fullCardTitle: '🔒 Адрес, руководитель и вид деятельности — в полной карточке',
    fullCardBody: 'После бесплатной регистрации реквизиты контрагента подставляются в счёт автоматически.',
    fullCardLink: 'Открыть полную карточку →',
    fullCardTitleSignedIn: 'Адрес, руководитель и вид деятельности — в кабинете, в форме счёта',
    fullCardBodySignedIn: 'В кабинете введите БИН клиента при создании счёта — реквизиты подставятся автоматически.',
    fullCardLinkSignedIn: 'Открыть в кабинете →',
    sources:
      'Источники: ГБД «Юридические лица» и реестр должников Минюста (data.egov.kz), сервисы портала КГД РК. Данные обновляются реестрами с задержкой до суток; результат носит справочный характер.',
    notCheckedNote:
      'Здесь не проверяются сделки без фактического выполнения работ, лицензии (даём ссылку на поиск) и суды.',
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
          a: 'КГД ведёт списки налогоплательщиков, признанных бездействующими, банкротами по решению суда или с регистрацией либо перерегистрацией, признанной недействительной. Проверка показывает, по какой из причин контрагент в списке. Сделка с таким контрагентом — риск: налоговая может не принять НДС к зачёту, а расходы по сделке — к вычету.',
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
          q: 'Что значат исполнительные производства в результате?',
          a: 'Это записи реестра должников Минюста (АИС ОИП) в открытых данных data.egov.kz: по ним судебные исполнители взыскивают долг по исполнительным документам. Показываем число записей и сумму взыскания, без имён. «Производств нет» означает, что в открытых данных их нет на дату обновления реестра, это не официальная справка. Если сервис не ответил, строка пишет «не удалось проверить».',
        },
        {
          q: 'Как проверить лицензию контрагента?',
          a: 'У реестра лицензий нет открытого API, а поиск на elicense.kz закрыт капчей, поэтому инструмент лицензии не проверяет. Ссылка «Проверить на elicense.kz» открывает поиск с уже подставленным БИН, останется ввести капчу. Отсутствие лицензии не всегда тревожный знак: для части видов деятельности нужно только уведомление.',
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
      'Сенімсіз салық төлеуші мәртебесі, банкроттық, тарату, салық берешегі, ҚҚС, салық режимі және атқарушылық іс жүргізу — ҚР МКК, Әділет министрлігі мен заңды тұлғалар тізілімінің ресми деректері бойынша. Тегін: тоқсанына 3 тексеру.',
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
    registeredSince: d => `${d} бастап`,
    kgdNote: 'МКК деректері: ЖК бойынша мемлекет тек аты-жөні мен тіркелген күнін жариялайды — мұндағы бос өрістер қате емес.',
    unknown: 'Тексеру мүмкін болмады — бұл бәрі дұрыс дегенді білдірмейді',
    unreliable: {
      label: 'Сенімсіз салық төлеуші',
      ok: 'МКК-нің сенімсіз салық төлеушілер тізімінде жоқ',
      bad: 'Сенімсіздер тізімінде тұр — алдын ала төлеммен жұмыс істеу қауіпті',
      reasons: list => `МКК тізіміндегі себебі: ${list}`,
    },
    bankruptcy: {
      label: 'Банкроттық',
      ok: 'МКК тізімінде банкроттық туралы сот шешімі жоқ',
      bad: 'Сот шешімі бойынша банкрот деп танылған (МКК тізімі)',
      unknown: 'Тексеру мүмкін болмады. Бұл банкроттық жоқ дегенді білдірмейді',
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
    regime: {
      label: 'Салық режимі',
      unknown: 'Салық режимін тексеру мүмкін болмады',
      since: d => `${d} бастап`,
      until: d => `${d} дейін`,
      datesNote: 'МКК режим күндерін тек 2026 жылғы 1 қаңтардан бастап жариялайды, бос күн мұнда қате емес',
    },
    enforcement: {
      label: 'Атқарушылық іс жүргізу',
      ok: 'Әділет министрлігінің борышкерлер тізілімінде ашық деректер бойынша өндіріс жоқ',
      bad: (records, active, amount, since) =>
        `Тізілімде атқарушылық өндіріс жазбалары бар: ${records}, оның ішінде аяқталу күні жоқ: ${active}${amount ? `, өндіріп алу сомасы ${amount}` : ''}${since ? `, ең ертесі ${since} бастап` : ''}`,
      unknown: 'Тексеру мүмкін болмады. Бұл өндіріс жоқ дегенді білдірмейді',
      asOfNote: 'Әділет министрлігінің ашық деректері жиынтықтың жаңарту күніне, бұл анықтама емес',
      ipNote: 'ЖК үшін жазба бизнеске емес, адамның өзіне қатысты болуы мүмкін',
      sourcePrefix: 'Дереккөз: ',
      sourceLink: 'ҚР Әділет министрлігінің ашық деректері, data.egov.kz',
      manualLink: 'aisoip.adilet.gov.kz сайтында қолмен тексеру (капча керек)',
    },
    rnu: {
      label: 'Мемлекеттік сатып алудың жосықсыз қатысушылары тізілімі',
      ok: 'Мемлекеттік сатып алудың жосықсыз қатысушылары тізімінде тұрмайды',
      bad: records => `Мемлекеттік сатып алудың жосықсыз қатысушылары тізімінде тұр (жазба саны: ${records})`,
      unknown: 'Тексеру мүмкін болмады. Бұл тізімде жоқ дегенді білдірмейді',
      note: 'Мемлекеттік сатып алу порталының тізілімі (ҚР Қаржы министрлігі): сот немесе уәкілетті орган шешімі бойынша енгізіледі, бұл анықтама емес',
      sourcePrefix: 'Дереккөз: ',
      sourceLink: 'goszakup.gov.kz мемлекеттік сатып алу порталындағы тізілім',
    },
    rehabilitation: {
      label: 'Оңалту рәсімі',
      ok: 'МКК тізімінде оңалту рәсімі бойынша тұрмайды',
      bad: since =>
        `МКК тізімінде тұр: оңалту рәсімі туралы сот шешімі заңды күшіне енген${since ? `, ${since} бастап` : ''}`,
      terminated: 'Оңалту рәсімі сот ұйғарымымен тоқтатылған (МКК тізімі)',
      unknown: 'Тексеру мүмкін болмады. Бұл рәсім жоқ дегенді білдірмейді',
      note: 'МКК борышкерлер тізімі, тәулігіне бір рет жаңартылады, бұл анықтама емес',
    },
    permits: {
      label: 'Лицензиялар және рұқсаттар',
      text: 'Автоматты түрде тексермейміз: тізілімнің ашық API-і жоқ, ал іздеу капчамен жабылған. БСН-і қойылған іздеуді ашыңыз.',
      link: 'elicense.kz сайтында тексеру →',
    },
    fullCardTitle: '🔒 Мекенжайы, басшысы және қызмет түрі — толық карточкада',
    fullCardBody: 'Тегін тіркелгеннен кейін контрагенттің деректемелері шотқа автоматты түрде қойылады.',
    fullCardLink: 'Толық карточканы ашу →',
    fullCardTitleSignedIn: 'Мекенжайы, басшысы және қызмет түрі — кабинетте, шот жасау бетінде',
    fullCardBodySignedIn: 'Кабинетте шот жасағанда клиенттің БСН-ін енгізіңіз — деректемелері автоматты түрде қойылады.',
    fullCardLinkSignedIn: 'Кабинетте ашу →',
    sources:
      'Дереккөздер: «Заңды тұлғалар» мемлекеттік деректер базасы мен Әділет министрлігінің борышкерлер тізілімі (data.egov.kz) және ҚР МКК порталының сервистері. Тізілімдер бір тәулікке дейін кешігіп жаңарады; нәтиже анықтамалық сипатта. Компания атауы мен мәртебесі тізілімде қалай жазылса, солай көрсетіледі — көбіне орыс тілінде.',
    notCheckedNote:
      'Мұнда жұмыстар нақты орындалмай жасалған мәмілелер, лицензиялар (іздеуге сілтеме береміз) және сот істері тексерілмейді.',
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
          a: 'МКК әрекетсіз, сот шешімі бойынша банкрот деп танылған не тіркелуі немесе қайта тіркелуі жарамсыз деп танылған салық төлеушілер тізімдерін жүргізеді. Тексеру контрагент тізімде қандай себеппен тұрғанын көрсетеді. Мұндай контрагентпен мәміле — тәуекел: салық органы ҚҚС-ты есепке алмауы, ал мәміле бойынша шығыстарды шегерімге қабылдамауы мүмкін.',
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
          q: 'Нәтижедегі атқарушылық іс жүргізу нені білдіреді?',
          a: 'Бұл data.egov.kz ашық деректеріндегі Әділет министрлігінің борышкерлер тізілімінің (АІЖО ААЖ) жазбалары: олар бойынша сот орындаушылары атқару құжаттары негізінде берешекті өндіріп алады. Жазба санын және өндіріп алу сомасын көрсетеміз, есімдерсіз. «Өндіріс жоқ» деген тізілім жаңартылған күні ашық деректерде олардың жоқтығын білдіреді, бұл ресми анықтама емес. Сервис жауап бермесе, жол «тексеру мүмкін болмады» деп жазады.',
        },
        {
          q: 'Контрагенттің лицензиясын қалай тексеруге болады?',
          a: 'Лицензиялар тізілімінің ашық API-і жоқ, ал elicense.kz сайтындағы іздеу капчамен жабылған, сондықтан құрал лицензияларды тексермейді. «elicense.kz сайтында тексеру» сілтемесі БСН-і қойылған іздеуді ашады, тек капчаны енгізу қалады. Лицензияның болмауы әрдайым алаңдатарлық белгі емес: қызметтің бір бөлігі үшін тек хабарлама қажет.',
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
      'Enter a 12-digit BIN (company ID) or IIN (sole proprietor ID) to see unreliable-taxpayer status, bankruptcy, liquidation, tax debt, VAT registration, tax regime and enforcement proceedings, from official data of the State Revenue Committee (KGD), the Ministry of Justice and the legal entity register. Free: 3 checks per quarter.',
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
    registeredSince: d => `since ${d}`,
    kgdNote: 'KGD data: for sole proprietors the state publishes only the name and registration date — empty fields here are not an error.',
    unknown: 'Could not be checked — this does not mean everything is fine',
    unreliable: {
      label: 'Unreliable taxpayer',
      ok: 'Not on the KGD list of unreliable taxpayers',
      bad: 'On the unreliable-taxpayer list — paying in advance is risky',
      reasons: list => `Reason on the KGD list: ${list}`,
    },
    bankruptcy: {
      label: 'Bankruptcy',
      ok: 'No court bankruptcy decision on the KGD list',
      bad: 'Declared bankrupt by a court (KGD list)',
      unknown: 'Could not be checked. This does not mean there is no bankruptcy',
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
    regime: {
      label: 'Tax regime',
      unknown: 'Could not check the tax regime',
      since: d => `since ${d}`,
      until: d => `until ${d}`,
      datesNote: 'KGD publishes regime dates only from 1 January 2026, so an empty date here is not an error',
    },
    enforcement: {
      label: 'Enforcement proceedings',
      ok: 'No proceedings in the Ministry of Justice debtors register, per open data',
      bad: (records, active, amount, since) =>
        `The register has enforcement records: ${records}, of them without an end date: ${active}${amount ? `, amount to recover ${amount}` : ''}${since ? `, earliest since ${since}` : ''}`,
      unknown: 'Could not be checked. This does not mean there are no proceedings',
      asOfNote: 'Ministry of Justice open data as of the dataset update date, not an official certificate',
      ipNote: 'For a sole proprietor a record may concern the person, not the business',
      sourcePrefix: 'Source: ',
      sourceLink: 'Ministry of Justice open data, data.egov.kz',
      manualLink: 'Check manually at aisoip.adilet.gov.kz (captcha required)',
    },
    rnu: {
      label: 'Register of unreliable public procurement participants',
      ok: 'Not in the register of unreliable participants of public procurement',
      bad: records => `In the register of unreliable public procurement participants (records: ${records})`,
      unknown: 'Could not be checked. This does not mean it is not listed',
      note: 'Public procurement portal register (Ministry of Finance): listing follows a court or authority decision, not an official certificate',
      sourcePrefix: 'Source: ',
      sourceLink: 'register on the goszakup.gov.kz procurement portal',
    },
    rehabilitation: {
      label: 'Rehabilitation procedure',
      ok: 'Not in the KGD list of rehabilitation procedures',
      bad: since =>
        `Listed by KGD: a court decision on a rehabilitation procedure has come into force${since ? `, since ${since}` : ''}`,
      terminated: 'The rehabilitation procedure was terminated by a court ruling (KGD list)',
      unknown: 'Could not be checked. This does not mean there is no procedure',
      note: 'KGD debtors list, updated once a day, not an official certificate',
    },
    permits: {
      label: 'Licences and permits',
      text: 'Not checked automatically: the register has no open API and its search is behind a captcha. Open the search with the BIN already filled in.',
      link: 'Check on elicense.kz →',
    },
    fullCardTitle: '🔒 Address, director and line of business are in the full card',
    fullCardBody: 'After a free sign-up, a counterparty’s company details are filled into your invoice automatically.',
    fullCardLink: 'Open the full card →',
    fullCardTitleSignedIn: 'Address, director and line of business are in your account, on the invoice form',
    fullCardBodySignedIn: 'In your account, enter the client’s BIN when creating an invoice and their details fill in automatically.',
    fullCardLinkSignedIn: 'Open in my account →',
    sources:
      'Sources: the “Legal Entities” state database and the Ministry of Justice debtors register (data.egov.kz), and KGD portal services. Registers update with up to a one-day delay; results are for reference only. Company names and statuses are shown as they appear in the register, usually in Russian.',
    notCheckedNote:
      'This check does not cover deals without actual delivery of work, licences (we link to the search) or court cases.',
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
          a: 'Kazakhstan’s State Revenue Committee (KGD) keeps lists of taxpayers declared inactive, declared bankrupt by a court, or whose registration or re-registration was declared invalid. The check shows which of these reasons applies. Doing business with them is risky: the tax authority may refuse your VAT credit and disallow the related expenses as deductions.',
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
          q: 'What do enforcement proceedings in the result mean?',
          a: 'These are records of the Ministry of Justice debtors register (AIS OIP) in the open data on data.egov.kz: bailiffs use them to recover debts under enforcement documents. We show the number of records and the amount to recover, without names. “No proceedings” means none appear in the open data as of the register’s update date, which is not an official certificate. If the service did not respond, the line says it could not be checked.',
        },
        {
          q: 'How do I check a counterparty’s licence?',
          a: 'The licence register has no open API and its search on elicense.kz is behind a captcha, so this tool does not check licences. The “Check on elicense.kz” link opens the search with the BIN already filled in; you only enter the captcha. A missing licence is not always a warning sign: for some activities only a notification is required.',
        },
        {
          q: 'How many checks are free?',
          a: '3 checks a quarter per internet connection (IP address); the counter resets on 1 January, 1 April, 1 July and 1 October, Almaty time. Inside an invoices.kz account checks are unlimited, and sign-up is free.',
        },
      ],
    },
  },
}
