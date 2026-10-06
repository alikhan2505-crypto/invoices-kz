export type KeychainSize = 'S' | 'M' | 'L'

export type SizePreset = {
  fontSizeMm: number
  baseThicknessMm: number
  textThicknessMm: number
  borderMm: number
  ringDistanceMm: number
  price: number
}

// Черновые цены по просьбе founder'а ("цены пока придумай") -- простая
// константа, не поле в БД и не админ-UI в v1 (см. design-спеку). Остальные
// числа отталкиваются от значений по умолчанию у референса MakerWorld
// (base 2.0 / text 1.4 / border 3.4), масштабированы по трём размерам.
// Диаметр/стенка кольца живут отдельно в RING_SIZE_PRESETS -- founder явно
// попросил независимую настройку кольца, не привязанную к размеру брелка.
// Founder 2026-10-06: "сам брелок как объект" needed tighter proportions --
// borderMm trimmed ~20% narrower than the original MakerWorld-derived
// defaults so the base hugs the letters more closely instead of reading as
// a loose blob around the name.
export const SIZE_PRESETS: Record<KeychainSize, SizePreset> = {
  S: { fontSizeMm: 10, baseThicknessMm: 2.0, textThicknessMm: 1.2, borderMm: 2.0, ringDistanceMm: 1.2, price: 2500 },
  M: { fontSizeMm: 14, baseThicknessMm: 2.0, textThicknessMm: 1.4, borderMm: 2.4, ringDistanceMm: 1.2, price: 3500 },
  L: { fontSizeMm: 18, baseThicknessMm: 2.4, textThicknessMm: 1.6, borderMm: 2.8, ringDistanceMm: 1.2, price: 4500 },
}

export function priceForSize(size: KeychainSize): number {
  return SIZE_PRESETS[size].price
}

export type RingSize = 'S' | 'M' | 'L'

export type RingSizePreset = {
  holeDiameterMm: number
  wallMm: number
}

// Заметно меньше прежних дефолтов (старое M было ⌀5мм/стенка 3мм, т.е.
// кольцо-"бугорок" на брелке диаметром 11мм) -- founder 2026-10-06:
// "надо сделать кольцо меньше". Стенка 1.5мм в PLA на базовой толщине
// 2мм+ всё ещё печатается прочно, отверстие 2.5мм минимально пропускает
// обычное заводное кольцо для брелка.
export const RING_SIZE_PRESETS: Record<RingSize, RingSizePreset> = {
  S: { holeDiameterMm: 2.5, wallMm: 1.5 },
  M: { holeDiameterMm: 3.2, wallMm: 1.8 },
  L: { holeDiameterMm: 4.0, wallMm: 2.2 },
}

export const DEFAULT_RING_SIZE: RingSize = 'M'
