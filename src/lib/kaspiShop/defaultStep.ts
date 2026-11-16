// Шаг демпинга по умолчанию для нового товара (решение основателя D3, 16.11.2026): 0,1% цены, не меньше 1 ₸.
// Раньше для любого товара ставилось 100 ₸: на товаре за 190 ₸ это больше половины цены, на товаре за 78 990 ₸
// почти незаметно. Шаг касается только вновь заведённых товаров (импорт при подключении и добавление из «Управления товарами»):
// у уже заведённых остаётся то, что стоит. Бот всё равно не опускается ниже минимальной цены.
export const DEFAULT_STEP_SHARE = 0.001

export function defaultUndercutStep(price: unknown): number {
  const n = typeof price === 'number' ? price : Number(price)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.max(1, Math.round(n * DEFAULT_STEP_SHARE))
}
