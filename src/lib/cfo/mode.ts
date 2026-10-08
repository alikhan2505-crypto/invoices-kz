// Режим кабинета: «бизнес» или «семейный бюджет». Движок один (журнал, план,
// отчёты, календарь), меняются слова, набор статей и то, что показывается.
import type { Activity, ArticleKind, PnlGroup } from './types'

export type CfoMode = 'business' | 'family'

export const VOCAB = {
  business: {
    company: 'Компания', companyField: 'Название компании',
    pnl: 'БДР', pnlLong: 'Бюджет доходов и расходов (БДР)', cashflow: 'БДДС', plan: 'План', calendar: 'Платёжный календарь',
    revenue: 'Выручка', net: 'Чистая прибыль', expenses: 'Расходы',
    pnlHint: 'Доходы и расходы по дате начисления. Кредиты, вложения и вывод денег собственником, покупка оборудования и переводы между счетами сюда не входят — они в БДДС.',
  },
  family: {
    company: 'Семья', companyField: 'Название (например, «Бюджет семьи Ахметовых»)',
    pnl: 'Доходы и расходы', pnlLong: 'Доходы и расходы', cashflow: 'Движение денег', plan: 'Бюджет', calendar: 'Платежи',
    revenue: 'Доходы', net: 'Сбережено', expenses: 'Расходы',
    pnlHint: 'Доходы и расходы семьи по месяцам. Переводы между своими картами и счетами, взятые и возвращённые долги сюда не входят — они в «Движении денег».',
  },
} as const

export type FamilyArticle = { name: string; kind: ArticleKind; activity: Activity; pnlGroup: PnlGroup | null }

// Статьи семейного бюджета. Доходы — в группе «выручка», траты — «операционные»:
// так отчёт показывает «Доходы − Расходы = Сбережено» без бизнес-промежуточных итогов.
export const FAMILY_ARTICLES: FamilyArticle[] = [
  { name: 'Зарплата', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Подработка и фриланс', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Пособия и выплаты', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Подарки и помощь', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Прочие доходы', kind: 'income', activity: 'operating', pnlGroup: 'revenue' },
  { name: 'Взяли в долг / кредит', kind: 'income', activity: 'financing', pnlGroup: null },
  { name: 'Продукты', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Кафе и доставка еды', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Жильё и коммунальные', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Транспорт и такси', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Связь и подписки', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Дети и образование', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Здоровье и аптека', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Одежда и обувь', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Развлечения и отдых', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Подарки', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Дом и быт', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Налоги и сборы', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Прочие расходы', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Проценты по кредитам', kind: 'expense', activity: 'operating', pnlGroup: 'opex' },
  { name: 'Возврат долга / кредита', kind: 'expense', activity: 'financing', pnlGroup: null },
]

// Что делать со статьями при смене режима: недостающие статьи нового режима
// добавить, неиспользуемые статьи старого — убрать в архив (используемые не трогаем,
// иначе пропадут из отчётов).
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
  const isBusiness = (a: { name: string; kind: ArticleKind }) => businessNames.has(a.name.toLowerCase()) && !isFamily(a)
  if (target === 'family') {
    return {
      add: FAMILY_ARTICLES.filter((f) => !have.has(key(f.name, f.kind))),
      archive: articles.filter((a) => !a.archived && !used.has(a.id) && isBusiness(a)).map((a) => a.id),
      restore: articles.filter((a) => a.archived && isFamily(a)).map((a) => a.id),
    }
  }
  return {
    add: [],
    archive: articles.filter((a) => !a.archived && !used.has(a.id) && isFamily(a) && !businessNames.has(a.name.toLowerCase())).map((a) => a.id),
    restore: articles.filter((a) => a.archived && isBusiness(a)).map((a) => a.id),
  }
}

// Стартовые статьи бизнеса — те же 25 названий, что заводит cfo_bootstrap().
export const BUSINESS_ARTICLE_NAMES = new Set([
  'выручка от продажи товаров', 'выручка от услуг', 'прочие доходы', 'получение кредита / займа', 'вложения собственника', 'продажа оборудования и ос',
  'закупка товаров и материалов', 'зарплата', 'налоги и взносы с зарплаты (опв, со, восмс, сн, ипн)', 'аренда', 'коммунальные услуги', 'реклама и маркетинг',
  'связь и интернет', 'банковские комиссии и эквайринг', 'транспорт и логистика', 'программы и подписки', 'бухгалтерия и юристы', 'хозяйственные расходы',
  'прочие расходы', 'налог на доход (ипн ип / кпн)', 'ндс к уплате', 'проценты по кредитам', 'погашение тела кредита', 'вывод средств собственником', 'покупка оборудования и ос',
])
