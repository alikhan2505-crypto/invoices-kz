// Тексты «Следить за этим БИН» (ru/kk/en): кнопка в проверке контрагента
// (/tools/kontragent и /create), страница списка /profile/bin-watch и названия
// признаков риска. Письмо уходит по-русски (как все системные письма проекта) и
// собирает свои фразы в src/lib/binWatch/email.ts.
//
// kk: вычитка носителем языка ждёт основателя (решение 25.10.2026), файл
// покрыт записью 'cabinet-ui' реестра src/lib/kkReview.ts. Термины как в
// словаре проверки контрагента: БСН, ЖСН, ҚҚС, МКК. en без кириллицы (проверяет тест).
// В строках нет тире и эмодзи.

import type { ChangeKey, WatchSignals } from '@/lib/binWatch/signals'

export type BinWatchLang = 'ru' | 'kk' | 'en'

/** Подпись признака: плохие (ChangeKey) и «не проверено» (любой ключ WatchSignals). */
export type SignalLabelKey = ChangeKey | keyof WatchSignals

export interface BinWatchTexts {
  // кнопка
  cardTitle: string
  button: string
  buttonAdding: string
  buttonAdded: string
  buttonAlready: string
  buttonHint: string
  buttonSignInHint: string
  inlineSubmit: string
  inlineAfterOpen: string
  openList: string
  limitReached: (limit: number) => string
  errNotReady: string
  errGeneric: string
  errNetwork: string
  // страница
  menuLabel: string
  pageTitle: string
  pageSubtitle: string
  counter: (count: number, limit: number) => string
  planNote: (freeLimit: number, proLimit: number) => string
  addPlaceholder: string
  addButton: string
  invalidBin: string
  emptyTitle: string
  emptyBody: string
  loadError: string
  retry: string
  notAvailable: string
  binPrefix: (bin: string) => string
  neverChecked: string
  lastChecked: (date: string) => string
  lastAttemptFailed: string
  statusRisks: string
  statusClean: string
  statusPartial: string
  statusUnchecked: (names: string) => string
  unknownName: string
  remove: string
  removeConfirm: (name: string) => string
  removeError: string
  emailNote: string
  notificationsLink: string
  intentAdded: string
  intentFailed: string
  arrear: (amount: string) => string
  enforcement: (count: number, active: number) => string
  signals: Record<SignalLabelKey, string>
}

export const binWatchDict: Record<BinWatchLang, BinWatchTexts> = {
  ru: {
    cardTitle: 'Узнать первым, если с этой компанией что-то случится',
    button: 'Следить за этим БИН',
    buttonAdding: 'Добавляем…',
    buttonAdded: 'БИН на слежении',
    buttonAlready: 'Этот БИН уже на слежении',
    buttonHint: 'Проверим его раз в сутки и напишем на почту, если появится новый признак риска.',
    buttonSignInHint: 'Проверим раз в сутки и напишем на почту, если появится новый признак риска. Аккаунт создастся сам, пароль не нужен.',
    inlineSubmit: 'Получить ссылку и следить',
    inlineAfterOpen: 'Откройте письмо: после перехода по ссылке БИН встанет на слежение.',
    openList: 'Открыть список слежения',
    limitReached: limit => `В списке уже ${limit} БИН: это предел вашего тарифа. Удалите ненужный или перейдите на тариф Про.`,
    errNotReady: 'Слежение ещё настраивается, попробуйте позже.',
    errGeneric: 'Не получилось добавить БИН, попробуйте ещё раз.',
    errNetwork: 'Нет связи с сервером, попробуйте ещё раз.',
    menuLabel: 'Слежение за БИН',
    pageTitle: 'Слежение за БИН',
    pageSubtitle: 'Раз в сутки перепроверяем контрагентов из списка и пишем на почту, если появился новый признак риска.',
    counter: (count, limit) => `В списке ${count} из ${limit}`,
    planNote: (free, pro) => `На бесплатном тарифе до ${free} БИН, на тарифе Про до ${pro}.`,
    addPlaceholder: 'БИН или ИИН',
    addButton: 'Следить',
    invalidBin: 'БИН должен состоять из 12 цифр',
    emptyTitle: 'Пока никого нет',
    emptyBody: 'Проверьте контрагента по БИН и нажмите «Следить за этим БИН» или введите БИН выше.',
    loadError: 'Не удалось загрузить список',
    retry: 'Повторить',
    notAvailable: 'Раздел пока недоступен.',
    binPrefix: bin => `БИН ${bin}`,
    neverChecked: 'Ещё не проверялся: первая проверка будет при ближайшем ночном прогоне.',
    lastChecked: date => `Проверено ${date}`,
    lastAttemptFailed: 'Последняя проверка не удалась, реестры не ответили. Повторим завтра.',
    statusRisks: 'Есть признаки риска',
    statusClean: 'Признаков риска не найдено',
    statusPartial: 'Признаков риска не найдено, но часть реестров не ответила',
    statusUnchecked: names => `Не проверено: ${names}`,
    unknownName: 'Название появится после первой проверки',
    remove: 'Убрать из списка',
    removeConfirm: name => `Убрать «${name}» из списка слежения?`,
    removeError: 'Не удалось убрать БИН, попробуйте ещё раз.',
    emailNote: 'Письмо приходит на почту аккаунта не чаще раза в сутки. Выключить его можно в настройках уведомлений.',
    notificationsLink: 'Настройки уведомлений',
    intentAdded: 'БИН добавлен в список слежения.',
    intentFailed: 'Не удалось добавить БИН после входа. Введите его выше.',
    arrear: amount => `долг ${amount}`,
    enforcement: (count, active) => `${count} произв., действующих ${active}`,
    signals: {
      unreliable: 'Неблагонадёжный налогоплательщик',
      bankrupt: 'Банкротство',
      liquidating: 'Ликвидация',
      registryClosed: 'Статус в реестре: ликвидирован или прекращён',
      taxDebt: 'Налоговая задолженность',
      enforcement: 'Исполнительные производства',
      rehabilitation: 'Реабилитационная процедура',
      vatLost: 'Снят с учёта по НДС',
      vat: 'Статус НДС',
    },
  },
  kk: {
    cardTitle: 'Осы компаниямен бірдеңе болса, бірінші болып біліңіз',
    button: 'Осы БСН-ді бақылау',
    buttonAdding: 'Қосып жатырмыз…',
    buttonAdded: 'БСН бақылауда',
    buttonAlready: 'Бұл БСН бұрыннан бақылауда',
    buttonHint: 'Оны тәулігіне бір рет тексереміз, жаңа тәуекел белгісі пайда болса, поштаға хабарлаймыз.',
    buttonSignInHint: 'Тәулігіне бір рет тексереміз, жаңа тәуекел белгісі пайда болса, поштаға хабарлаймыз. Аккаунт өзі ашылады, құпия сөз қажет емес.',
    inlineSubmit: 'Сілтемені алу және бақылау',
    inlineAfterOpen: 'Хатты ашыңыз: сілтемеге өткеннен кейін БСН бақылауға қойылады.',
    openList: 'Бақылау тізімін ашу',
    limitReached: limit => `Тізімде ${limit} БСН бар: бұл тарифіңіздің шегі. Керек емесін жойыңыз немесе Про тарифіне өтіңіз.`,
    errNotReady: 'Бақылау әлі бапталып жатыр, кейінірек қайталап көріңіз.',
    errGeneric: 'БСН қосу мүмкін болмады, қайталап көріңіз.',
    errNetwork: 'Сервермен байланыс жоқ, қайталап көріңіз.',
    menuLabel: 'БСН бақылау',
    pageTitle: 'БСН бақылау',
    pageSubtitle: 'Тізімдегі контрагенттерді тәулігіне бір рет қайта тексереміз, жаңа тәуекел белгісі пайда болса, поштаға жазамыз.',
    counter: (count, limit) => `Тізімде ${count} / ${limit}`,
    planNote: (free, pro) => `Тегін тарифте ${free} БСН-ге дейін, Про тарифінде ${pro} БСН-ге дейін.`,
    addPlaceholder: 'БСН немесе ЖСН',
    addButton: 'Бақылау',
    invalidBin: 'БСН 12 саннан тұруы керек',
    emptyTitle: 'Әзірге ешкім жоқ',
    emptyBody: 'Контрагентті БСН бойынша тексеріп, «Осы БСН-ді бақылау» батырмасын басыңыз немесе БСН-ді жоғарыға енгізіңіз.',
    loadError: 'Тізімді жүктеу мүмкін болмады',
    retry: 'Қайталау',
    notAvailable: 'Бөлім әзірге қолжетімсіз.',
    binPrefix: bin => `БСН ${bin}`,
    neverChecked: 'Әлі тексерілмеген: алғашқы тексеру жақын арадағы түнгі іске қосуда болады.',
    lastChecked: date => `Тексерілген күні: ${date}`,
    lastAttemptFailed: 'Соңғы тексеру сәтсіз болды, тізілімдер жауап бермеді. Ертең қайталаймыз.',
    statusRisks: 'Тәуекел белгілері бар',
    statusClean: 'Тәуекел белгілері табылмады',
    statusPartial: 'Тәуекел белгілері табылмады, бірақ тізілімдердің бір бөлігі жауап бермеді',
    statusUnchecked: names => `Тексерілмеген: ${names}`,
    unknownName: 'Атауы алғашқы тексеруден кейін шығады',
    remove: 'Тізімнен алып тастау',
    removeConfirm: name => `«${name}» бақылау тізімінен алынсын ба?`,
    removeError: 'БСН-ді алып тастау мүмкін болмады, қайталап көріңіз.',
    emailNote: 'Хат аккаунттың поштасына тәулігіне бір реттен жиі келмейді. Оны хабарландыру баптауларында өшіруге болады.',
    notificationsLink: 'Хабарландыру баптаулары',
    intentAdded: 'БСН бақылау тізіміне қосылды.',
    intentFailed: 'Кіргеннен кейін БСН-ді қосу мүмкін болмады. Оны жоғарыға енгізіңіз.',
    arrear: amount => `берешек ${amount}`,
    enforcement: (count, active) => `${count} іс, қолданыстағысы ${active}`,
    signals: {
      unreliable: 'Сенімсіз салық төлеуші',
      bankrupt: 'Банкроттық',
      liquidating: 'Тарату',
      registryClosed: 'Тізілімдегі мәртебе: таратылған немесе тоқтатылған',
      taxDebt: 'Салық бойынша берешек',
      enforcement: 'Атқарушылық іс жүргізу',
      rehabilitation: 'Оңалту рәсімі',
      vatLost: 'ҚҚС бойынша есептен шығарылған',
      vat: 'ҚҚС мәртебесі',
    },
  },
  en: {
    cardTitle: 'Be the first to know if something happens to this company',
    button: 'Watch this BIN',
    buttonAdding: 'Adding…',
    buttonAdded: 'BIN is being watched',
    buttonAlready: 'This BIN is already on the watch list',
    buttonHint: 'We re-check it once a day and email you if a new risk sign appears.',
    buttonSignInHint: 'We re-check it once a day and email you if a new risk sign appears. The account is created automatically, no password needed.',
    inlineSubmit: 'Get the link and watch',
    inlineAfterOpen: 'Open the email: after you follow the link the BIN is put on watch.',
    openList: 'Open the watch list',
    limitReached: limit => `Your list already has ${limit} BINs, the limit of your plan. Remove one or move to the Pro plan.`,
    errNotReady: 'Watching is still being set up, please try again later.',
    errGeneric: 'Could not add the BIN, please try again.',
    errNetwork: 'No connection to the server, please try again.',
    menuLabel: 'BIN watch list',
    pageTitle: 'BIN watch list',
    pageSubtitle: 'Once a day we re-check the counterparties on your list and email you if a new risk sign appears.',
    counter: (count, limit) => `${count} of ${limit} in the list`,
    planNote: (free, pro) => `Up to ${free} BINs on the free plan, up to ${pro} on Pro.`,
    addPlaceholder: 'BIN or IIN',
    addButton: 'Watch',
    invalidBin: 'A BIN must be 12 digits',
    emptyTitle: 'Nobody here yet',
    emptyBody: 'Check a counterparty by BIN and press “Watch this BIN”, or type a BIN above.',
    loadError: 'Could not load the list',
    retry: 'Retry',
    notAvailable: 'This section is not available yet.',
    binPrefix: bin => `BIN ${bin}`,
    neverChecked: 'Not checked yet: the first check happens at the next nightly run.',
    lastChecked: date => `Checked on ${date}`,
    lastAttemptFailed: 'The last check failed, the registries did not answer. We will try again tomorrow.',
    statusRisks: 'Risk signs found',
    statusClean: 'No risk signs found',
    statusPartial: 'No risk signs found, but some registries did not answer',
    statusUnchecked: names => `Not checked: ${names}`,
    unknownName: 'The name appears after the first check',
    remove: 'Remove from the list',
    removeConfirm: name => `Remove “${name}” from the watch list?`,
    removeError: 'Could not remove the BIN, please try again.',
    emailNote: 'The email goes to your account address at most once a day. You can turn it off in the notification settings.',
    notificationsLink: 'Notification settings',
    intentAdded: 'The BIN was added to your watch list.',
    intentFailed: 'Could not add the BIN after sign-in. Type it above.',
    arrear: amount => `arrears ${amount}`,
    enforcement: (count, active) => `${count} proceedings, ${active} active`,
    signals: {
      unreliable: 'Unreliable taxpayer',
      bankrupt: 'Bankruptcy',
      liquidating: 'Liquidation',
      registryClosed: 'Registry status: liquidated or terminated',
      taxDebt: 'Tax arrears',
      enforcement: 'Enforcement proceedings',
      rehabilitation: 'Rehabilitation procedure',
      vatLost: 'Deregistered from VAT',
      vat: 'VAT status',
    },
  },
}
