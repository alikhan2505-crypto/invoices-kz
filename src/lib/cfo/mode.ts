// Режим кабинета: «бизнес» или «семейный бюджет». Движок один (журнал, план,
// отчёты, календарь), меняются слова, набор статей и то, что показывается.
// Группы БДР (pnl_group) в базе — всегда бизнесовые и при смене режима НЕ
// меняются: семейная группировка («Доходы − Расходы = Сбережено») считается
// на уровне отчёта (familyPnlGroup), поэтому круг «семья → бизнес → семья»
// возвращает ровно те же отчёты, что были.
import type { Activity, ArticleKind, PnlGroup } from './types'

export type CfoMode = 'business' | 'family'

export const VOCAB = {
  business: {
    company: 'Компания', companyField: 'Название компании', nameEmpty: 'Введите название компании',
    pnl: 'БДР', pnlLong: 'Бюджет доходов и расходов (БДР)', cashflow: 'БДДС', plan: 'План', calendar: 'Платёжный календарь',
    revenue: 'Выручка', net: 'Чистая прибыль', expenses: 'Расходы',
    pnlHint: 'Доходы и расходы по дате начисления. Кредиты, вложения и вывод денег собственником, покупка оборудования и переводы между счетами сюда не входят — они в БДДС.',
    cashflowHint: 'Деньги по дате оплаты, по видам деятельности. Остатки — по всем счетам и кассам, переводы между ними не считаются ни поступлением, ни выплатой.',
    planHint: 'Бюджет по статьям на месяц — с ним сравниваются факт в БДР, БДДС и на обзоре. Конкретные будущие платежи по дням заводятся в «Операциях» как плановые.',
    counterparty: 'Контрагент', purpose: 'Назначение платежа',
    accrualToggle: 'Другая дата начисления (для БДР)', accrualHint: 'Например, услуга за март, оплаченная в апреле: начисление — март',
    activityField: 'Вид деятельности (БДДС)', pnlField: 'Строка БДР', pnlNone: 'Не идёт в БДР', pnlNoneShort: 'не идёт в БДР',
    opsEmptyHint: 'Приход, расход или перевод между своими счетами — из них сами строятся БДР, БДДС и календарь.',
    overviewEmptyHint: 'Как только появятся приходы и расходы, здесь будут выручка, прибыль, запас денег и ближайшие платежи.',
    limitsEmpty: 'Лимитов нет. Впишите план расходов по статьям в', limitsLink: 'Плане',
    ask: 'Спросите CFO', askPlaceholder: 'Например: почему в сентябре прибыль упала?',
    askGate: 'Задайте вопрос обычным языком — «почему упала прибыль?», «хватит ли денег до конца месяца?» — и ИИ ответит по цифрам вашего кабинета. Доступно на тарифе Про.',
    gap: 'Кассовый разрыв', gapHint: 'по плановым платежам денег не хватит', gapAdvice: 'Перенесите платежи или ускорьте поступления.',
    noGap: 'Кассовых разрывов нет',
    scenarioGate: 'Сценарии «выручка упадёт на 20%», «наймём двоих», «купим оборудование» — и сразу видно, будет ли кассовый разрыв. Доступно на тарифе Про.',
    digestExamples: '«аренда 300 000», «пришло 450к от ТОО Ромашка», «такси 3500 вчера»',
    telegramDigestWhat: 'сколько денег на счетах, что сегодня к оплате и к поступлению, просрочка и ближайший кассовый разрыв',
  },
  family: {
    company: 'Семья', companyField: 'Название (например, «Бюджет семьи Ахметовых»)', nameEmpty: 'Введите название',
    pnl: 'Доходы и расходы', pnlLong: 'Доходы и расходы', cashflow: 'Движение денег', plan: 'Бюджет', calendar: 'Платежи',
    revenue: 'Доходы', net: 'Сбережено', expenses: 'Расходы',
    pnlHint: 'Доходы и расходы семьи по месяцам. Переводы между своими картами и счетами, взятые и возвращённые долги сюда не входят — они в «Движении денег».',
    cashflowHint: 'Деньги по дате оплаты. Остатки — по всем картам, наличным и накоплениям; переводы между ними не считаются ни поступлением, ни тратой.',
    planHint: 'Сколько семья планирует получать и тратить по каждой статье в месяц — с бюджетом сравниваются «Доходы и расходы» и обзор. Конкретные будущие платежи по дням заводятся в «Операциях» как плановые.',
    counterparty: 'Кому или от кого', purpose: 'Описание',
    accrualToggle: 'Отнести к другому месяцу', accrualHint: 'Например, коммуналка за сентябрь, оплаченная в октябре: месяц — сентябрь',
    activityField: 'Раздел в «Движении денег»', pnlField: 'В «Доходах и расходах»', pnlNone: 'Не идёт в доходы и расходы', pnlNoneShort: 'не идёт в доходы и расходы',
    opsEmptyHint: 'Поступление, трата или перевод между своими картами — из них сами строятся отчёты, бюджет и платежи.',
    overviewEmptyHint: 'Как только появятся доходы и траты, здесь будут расходы по категориям, сбережения, запас денег и ближайшие платежи.',
    limitsEmpty: 'Лимитов нет. Впишите, сколько готовы тратить по статьям, в', limitsLink: 'Бюджете',
    ask: 'Спросите помощника', askPlaceholder: 'Например: на что ушли деньги в сентябре?',
    askGate: 'Задайте вопрос обычным языком — «сколько мы можем откладывать?», «хватит ли денег до зарплаты?» — и ИИ ответит по цифрам вашего бюджета. Доступно на тарифе Про.',
    gap: 'Денег не хватит', gapHint: 'по запланированным платежам денег на картах и наличными не хватит', gapAdvice: 'Перенесите платёж или отложите крупную трату.',
    noGap: 'Денег на все запланированные платежи хватает',
    scenarioGate: 'Сценарии «доходы упадут на 20%», «купим машину», «поедем в отпуск» — и сразу видно, хватит ли денег. Доступно на тарифе Про.',
    digestExamples: '«продукты 12 500», «зарплата 450 000», «такси 3500 вчера»',
    telegramDigestWhat: 'сколько денег на картах и наличными, что сегодня платить, просрочка и хватит ли денег на ближайшие платежи',
  },
} as const

export type Vocab = (typeof VOCAB)[CfoMode]
export const vocab = (mode: CfoMode | undefined): Vocab => VOCAB[mode === 'family' ? 'family' : 'business']

// Имя по умолчанию заводит cfo_bootstrap(); в семейном режиме оно бизнесовое,
// поэтому в заголовках, файлах Excel и сводках подменяется.
export const DEFAULT_COMPANY_NAME = 'Моя компания'
export function displayName(ws: { companyName: string; mode?: CfoMode }): string {
  return ws.mode === 'family' && ws.companyName.trim() === DEFAULT_COMPANY_NAME ? 'Семейный бюджет' : ws.companyName
}

// Семейная группировка отчёта: все доходы — «Доходы» (revenue), все траты —
// «Расходы» (opex), долги (pnlGroup null) — вне отчёта. Хранимая группа не трогается.
export function familyPnlGroup(a: { kind: ArticleKind; pnlGroup: PnlGroup | null }): PnlGroup | null {
  if (a.pnlGroup === null) return null
  return a.kind === 'income' ? 'revenue' : 'opex'
}
export function reportPnlGroup(a: { kind: ArticleKind; pnlGroup: PnlGroup | null }, mode: CfoMode | undefined): PnlGroup | null {
  return mode === 'family' ? familyPnlGroup(a) : a.pnlGroup
}

export const PNL_GROUP_LABEL_BY_MODE: Record<CfoMode, Record<PnlGroup, string>> = {
  business: { revenue: 'Выручка', cogs: 'Себестоимость', opex: 'Операционные расходы', finance: 'Прочие доходы и расходы', tax: 'Налоги' },
  family: { revenue: 'Доходы', cogs: 'Расходы', opex: 'Расходы', finance: 'Прочее', tax: 'Налоги' },
}
export const ACTIVITY_LABEL_BY_MODE: Record<CfoMode, Record<Activity, string>> = {
  business: { operating: 'Операционная', investing: 'Инвестиционная', financing: 'Финансовая' },
  family: { operating: 'Обычные доходы и траты', investing: 'Покупки и вложения', financing: 'Долги и кредиты' },
}
export const ACTIVITY_SECTION_BY_MODE: Record<CfoMode, Record<Activity, string>> = {
  business: { operating: 'Операционная деятельность', investing: 'Инвестиционная деятельность', financing: 'Финансовая деятельность' },
  family: { operating: 'Обычные доходы и траты', investing: 'Покупки и вложения', financing: 'Долги и кредиты' },
}
// Строки отчёта, которые в семейном режиме не нужны (промежуточные бизнес-итоги).
export const LOAN_PAYMENTS_LABEL = 'Платежи по кредитам'
export const LOAN_RECEIVED_LABEL = 'Получено по кредиту'

export type FamilyArticle = { name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null; alike?: string[] }

// Статьи семейного бюджета. Доходы — в группе «выручка», траты — «операционные»:
// так отчёт показывает «Доходы − Расходы = Сбережено» без бизнес-промежуточных итогов.
export const FAMILY_ARTICLES: FamilyArticle[] = [
  { name: 'Зарплата', kind: 'income', activity: 'operating', pnlGroup: 'revenue', alike: ['зарплат', 'заработн', 'оклад'] },
  { name: 'Подработка и фриланс', kind: 'income', activity: 'operating', pnlGroup: 'revenue', alike: ['подработ', 'фриланс'] },
  { name: 'Пособия и выплаты', kind: 'income', activity: 'operating', pnlGroup: 'revenue', alike: ['пособи', 'выплат'] },
  { name: 'Подарки и помощь', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Прочие доходы', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Взяли в долг / кредит', kind: 'income', activity: 'financing', pnlGroup: null },
  { name: 'Продукты', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['продукт', 'магазин', 'супермаркет'] },
  { name: 'Кафе и доставка еды', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['кафе', 'ресторан', 'доставк', 'обед'] },
  { name: 'Жильё и коммунальные', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['коммунал', 'аренда квартир', 'жиль', 'квартплат', 'ипотек'] },
  { name: 'Транспорт и такси', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['такси', 'транспорт', 'бензин', 'топлив', 'машин'] },
  { name: 'Связь и подписки', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['связь', 'интернет', 'подписк', 'мобильн'] },
  { name: 'Дети и образование', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['дет', 'школ', 'сад', 'кружк', 'образован', 'учёб', 'учеб'] },
  { name: 'Здоровье и аптека', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['здоров', 'аптек', 'врач', 'лекарств', 'медиц'] },
  { name: 'Одежда и обувь', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['одежд', 'обув'] },
  { name: 'Развлечения и отдых', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['развлеч', 'отдых', 'кино', 'путешеств', 'отпуск'] },
  { name: 'Подарки', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Дом и быт', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Налоги и сборы', kind: 'expense', activity: 'operating', pnlGroup: 'opex', alike: ['налог', 'штраф', 'сбор'] },
  { name: 'Прочие расходы', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Проценты по кредитам', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Возврат долга / кредита', kind: 'expense', activity: 'financing', pnlGroup: null },
]

// Что делать со статьями при смене режима: недостающие статьи нового режима
// добавить, неиспользуемые статьи старого — убрать в архив (используемые не трогаем,
// иначе пропадут из отчётов). Группы БДР не трогаются никогда.
export function planModeSwitch(
  articles: { id: string; name: string; kind: ArticleKind; archived: boolean }[],
  used: Set<string>,
  target: CfoMode,
  businessNames: Set<string>,
): { add: FamilyArticle[]; archive: string[]; restore: string[] } {
  // Сравниваем по названию И виду: «Зарплата» в бизнесе — расход, в семье — доход.
  const key = (name: string, kind: ArticleKind) => `${name.toLowerCase()}|${kind}`
  const have = new Set(articles.map((a) => key(a.name, a.kind)))
  const familyKeys = new Set(FAMILY_ARTICLES.map((a) => key(a.name, a.kind)))
  const isFamily = (a: { name: string; kind: ArticleKind }) => familyKeys.has(key(a.name, a.kind))
  const isBusiness = (a: { name: string; kind: ArticleKind }) => businessNames.has(a.name.toLowerCase()) && businessKind(a.name) === a.kind
  if (target === 'family') {
    const archive = articles.filter((a) => !a.archived && !used.has(a.id) && isBusiness(a) && !isFamily(a)).map((a) => a.id)
    // Своя похожая статья остаётся («Продукты питания», «Оплата за школу») — семейную не плодим дублем.
    // Стартовая бизнес-статья, оставшаяся только потому, что по ней есть операции («Налог на доход»),
    // своей не считается — иначе она «съедала» бы семейную «Налоги и сборы».
    const staying = articles.filter((a) => !a.archived && !archive.includes(a.id))
    const own = staying.filter((a) => !isFamily(a) && !isBusiness(a))
    const hasAlike = (f: FamilyArticle) => (f.alike ?? []).some((w) => own.some((a) => a.kind === f.kind && a.name.toLowerCase().includes(w)))
    // Уже добавленные раньше семейные статьи-дубли своих (не используются) — тоже в архив.
    const starterOf = (a: { name: string; kind: ArticleKind }) => FAMILY_ARTICLES.find((f) => key(f.name, f.kind) === key(a.name, a.kind))
    const dupes = staying.filter((a) => { const f = starterOf(a); return !!f && !used.has(a.id) && hasAlike(f) }).map((a) => a.id)
    return {
      add: FAMILY_ARTICLES.filter((f) => !have.has(key(f.name, f.kind)) && !hasAlike(f)),
      archive: [...archive, ...dupes],
      restore: articles.filter((a) => a.archived && isFamily(a)).map((a) => a.id),
    }
  }
  return {
    add: [],
    archive: articles.filter((a) => !a.archived && !used.has(a.id) && isFamily(a) && !isBusiness(a)).map((a) => a.id),
    restore: articles.filter((a) => a.archived && isBusiness(a)).map((a) => a.id),
  }
}

// Доходные статьи из стартового набора бизнеса; остальные стартовые — расходы.
const BUSINESS_INCOME = new Set(['выручка от продажи товаров', 'выручка от услуг', 'прочие доходы', 'получение кредита / займа', 'вложения собственника', 'продажа оборудования и ос'])
const businessKind = (name: string): ArticleKind => (BUSINESS_INCOME.has(name.toLowerCase()) ? 'income' : 'expense')

// Стартовые статьи бизнеса — те же 25 названий, что заводит cfo_bootstrap().
export const BUSINESS_ARTICLE_NAMES = new Set([
  'выручка от продажи товаров', 'выручка от услуг', 'прочие доходы', 'получение кредита / займа', 'вложения собственника', 'продажа оборудования и ос',
  'закупка товаров и материалов', 'зарплата', 'налоги и взносы с зарплаты (опв, со, восмс, сн, ипн)', 'аренда', 'коммунальные услуги', 'реклама и маркетинг',
  'связь и интернет', 'банковские комиссии и эквайринг', 'транспорт и логистика', 'программы и подписки', 'бухгалтерия и юристы', 'хозяйственные расходы',
  'прочие расходы', 'налог на доход (ипн ип / кпн)', 'ндс к уплате', 'проценты по кредитам', 'погашение тела кредита', 'вывод средств собственником', 'покупка оборудования и ос',
])

// Группы БДР стартовых статей бизнеса, которые старый переключатель режима
// (до 17.10.2026) перезаписывал. По этой карте их возвращает миграция
// cfo_pnl_group_repair.sql; остальные стартовые статьи он не трогал.
export const BUSINESS_STARTER_PNL_GROUP: Record<string, PnlGroup> = {
  'закупка товаров и материалов': 'cogs',
  'налог на доход (ипн ип / кпн)': 'tax',
  'ндс к уплате': 'tax',
  'прочие доходы': 'finance',
  'проценты по кредитам': 'finance',
}
