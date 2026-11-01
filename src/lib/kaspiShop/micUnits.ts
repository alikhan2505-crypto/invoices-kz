// Единицы минимальной партии Made-in-China ("10,000 Bags") для показа продавцу и для решения,
// можно ли подставлять цену в калькулятор маржи как цену за штуку.

const RU: Record<string, string> = {
  piece: 'шт', pieces: 'шт', pc: 'шт', pcs: 'шт', unit: 'шт', units: 'шт',
  pair: 'пар', pairs: 'пар', set: 'комплектов', sets: 'комплектов',
  bag: 'пакетов', bags: 'пакетов', box: 'коробок', boxes: 'коробок', carton: 'коробок', cartons: 'коробок',
  roll: 'рулонов', rolls: 'рулонов', kg: 'кг', kilograms: 'кг', ton: 'т', tons: 'т', meter: 'м', meters: 'м',
}

/** Единица, которую продавец продаёт на Kaspi как один товар: штука, пара, комплект. */
const SELLABLE = new Set(['piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'pair', 'pairs', 'set', 'sets'])

const norm = (u: string | null | undefined) => (u ?? '').trim().toLowerCase().replace(/\.$/, '')

/** true: цену можно считать ценой за товар. Неизвестная единица тоже false: не гадаем. */
export function isSellableUnit(unit: string | null | undefined): boolean {
  return SELLABLE.has(norm(unit))
}

/** «10 000 пакетов» или «10 000 bags», если единицу не знаем. null, если партии нет. */
export function moqText(qty: number | null | undefined, unit: string | null | undefined): string | null {
  if (qty === null || qty === undefined || !Number.isFinite(qty) || qty <= 0) return null
  const u = norm(unit)
  return `${qty.toLocaleString('ru-KZ')} ${RU[u] ?? u}`.trim()
}
