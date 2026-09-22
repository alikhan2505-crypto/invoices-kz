// Registry of the product areas of invoices.kz and the per-person "my
// products" preference that decides which of them show up in the menu.
// Stage 1 of the subdomain split (founder, 21.09.2026): one domain, but
// someone who doesn't sell on Kaspi no longer sees Kaspi in the menu.
//
// Pure module on purpose (no React, no localStorage) so it is unit-testable
// and safe to import from server code; the browser side lives in
// useMyProducts.ts.

export type ProductKey = 'invoices' | 'kaspiApi' | 'kaspiShop' | 'aiAgent' | 'wildberries' | 'salon'

export type ProductDef = {
  key: ProductKey
  // Names as they already appear in SiteNav, so the hub doesn't introduce a
  // third way of naming the same thing.
  name: string
  blurb: string
  audience: string
  href: string
  // Public page of the product for people who are not in its cabinet (guests, or
  // an account that can't open it yet); signed-in people with access go to href.
  landing?: string
  // Colours follow DESIGN.md §7 (marketing surfaces): one flat colour per
  // product, one ink on it, one softer tint for stickers.
  bg: string
  ink: string
  // Locked for everyone, admin included (not finished yet).
  locked?: boolean
  // Only shown to admins until the founder reviews it.
  adminOnly?: boolean
  // Needs the Pro plan (mirrors SiteNav's SECTIONS; shown as a tag on the hub).
  proOnly?: boolean
  // Has a section in SiteNav's tab row (salon lives under /admin, not in it).
  inNav: boolean
}

export const PRODUCTS: ProductDef[] = [
  { key: 'invoices', name: 'Счета', blurb: 'Счёт, КП и АВР за 30 секунд', audience: 'ИП и ТОО Казахстана', href: '/create', bg: '#1C2056', ink: '#F4F6FF', inNav: true },
  { key: 'kaspiShop', name: 'Kaspi Bot', blurb: 'Демпинг цен и заказы Kaspi', audience: 'Продавцы Kaspi Магазина', href: '/kaspi-shop/overview', landing: 'https://kaspi.invoices.kz', bg: '#FF6B57', ink: '#2A0B07', proOnly: true, inNav: true },
  { key: 'kaspiApi', name: 'Kaspi Cashier API', blurb: 'Приём Kaspi Pay в ваш код', audience: 'Разработчики и интеграторы', href: '/kaspi-api', landing: 'https://api.invoices.kz', bg: '#F5E663', ink: '#14130A', inNav: true },
  { key: 'aiAgent', name: 'AI-агент', blurb: 'Отвечает клиентам в мессенджерах', audience: 'Бизнес, который живёт в переписке', href: '/ai-agent/overview', landing: 'https://agent.invoices.kz', bg: '#B7A6FF', ink: '#1D1140', proOnly: true, inNav: true },
  { key: 'salon', name: 'Салон', blurb: 'Записи, мастера, сайт салона', audience: 'Салоны красоты и барбершопы', href: '/admin/site-generator', landing: 'https://salon.invoices.kz', bg: '#F7C6D4', ink: '#3B1030', inNav: false },
  { key: 'wildberries', name: 'WB Bot', blurb: 'Товары и заказы Wildberries', audience: 'Продавцы Wildberries', href: '/wildberries', bg: '#7A2E8E', ink: '#FBEAFB', locked: true, inNav: true },
]

export function findProduct(key: ProductKey): ProductDef | undefined {
  return PRODUCTS.find((p) => p.key === key)
}

// What a person can actually pick: not locked, not admin-gated. This is also
// the starting set when someone who never chose anything toggles their first
// product (see toggleProduct).
export const SELECTABLE_KEYS: ProductKey[] = PRODUCTS.filter((p) => !p.locked && !p.adminOnly).map((p) => p.key)

const ALL_KEYS = new Set<string>(PRODUCTS.map((p) => p.key))

// null = never chose = show everything, exactly as before this feature
// existed. A stored value that isn't a JSON array (or holds unknown keys,
// e.g. a product that was renamed) degrades to null / drops the unknown keys
// rather than hiding the whole menu.
export function parseMyProducts(raw: string | null): ProductKey[] | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const keys = parsed.filter((k): k is ProductKey => typeof k === 'string' && ALL_KEYS.has(k))
    // An empty list would leave a menu with nothing but "Дашборд"; treat it
    // as "never chose" instead of a valid state.
    return keys.length > 0 ? keys : null
  } catch {
    return null
  }
}

export function serializeMyProducts(keys: ProductKey[]): string {
  return JSON.stringify(keys)
}

// Toggle one product in the person's menu. First ever toggle starts from the
// full selectable set (what they were seeing), so switching one product off
// doesn't silently hide all the others. Never returns an empty list: the last
// product can't be removed.
export function toggleProduct(current: ProductKey[] | null, key: ProductKey): ProductKey[] {
  const base = current ?? SELECTABLE_KEYS
  if (base.includes(key)) {
    const next = base.filter((k) => k !== key)
    return next.length > 0 ? next : base
  }
  return [...base, key]
}

export function isInMyProducts(mine: ProductKey[] | null, key: ProductKey): boolean {
  if (mine === null) return SELECTABLE_KEYS.includes(key)
  return mine.includes(key)
}

// Should this menu section be drawn? Always when nothing was chosen, and
// always for the section the person is standing in (hiding the tab you're on
// would leave a page with no visible parent).
export function isSectionVisible(mine: ProductKey[] | null, key: ProductKey, activeKey: ProductKey | null): boolean {
  if (mine === null) return true
  return mine.includes(key) || activeKey === key
}

// Where a person lands after signing in when nothing more specific was asked
// for. One connected product other than invoices -> straight into it; several
// -> the products page; invoices only, or nothing chosen yet (new account, tour)
// -> the dashboard, as before. Display routing only, never an access decision.
export function homeFor(list: unknown): string {
  if (!Array.isArray(list)) return '/dashboard'
  const keys = list.filter((k): k is ProductKey => typeof k === 'string' && ALL_KEYS.has(k))
  if (keys.length === 0) return '/dashboard'
  if (keys.length > 1) return '/products'
  const only = PRODUCTS.find((p) => p.key === keys[0])
  return only && only.key !== 'invoices' && only.key !== 'salon' && !only.locked ? only.href : '/dashboard'
}

// "What do you do?" on the start page (founder's mock, 21.09.2026): one tap
// connects the products that fit. Salon comes with the AI agent, as in the mock.
export const PERSONAS: { key: string; label: string; products: ProductKey[] }[] = [
  { key: 'kaspi', label: 'Продаю на Kaspi', products: ['kaspiShop'] },
  { key: 'ip', label: 'Я ИП или ТОО', products: ['invoices'] },
  { key: 'dev', label: 'Пишу код', products: ['kaspiApi'] },
  { key: 'salon', label: 'У меня салон', products: ['salon', 'aiAgent'] },
]

export function personaProducts(key: string | null): ProductKey[] | null {
  return PERSONAS.find((p) => p.key === key)?.products ?? null
}

// Remembered across the trip through /login (same origin, so localStorage works).
export const PENDING_PERSONA_KEY = 'pending_persona'
