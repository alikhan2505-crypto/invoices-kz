export type KeychainSize = 'S' | 'M' | 'L'

export type SizePreset = {
  fontSizeMm: number
  baseThicknessMm: number
  textThicknessMm: number
  borderMm: number
  ringHoleDiameterMm: number
  ringWallMm: number
  ringDistanceMm: number
  price: number
}

// Черновые цены по просьбе founder'а ("цены пока придумай") -- простая
// константа, не поле в БД и не админ-UI в v1 (см. design-спеку). Остальные
// числа отталкиваются от значений по умолчанию у референса MakerWorld
// (base 2.0 / text 1.4 / border 3.4 / hole ⌀5 / wall 3.0), масштабированы
// по трём размерам.
export const SIZE_PRESETS: Record<KeychainSize, SizePreset> = {
  S: { fontSizeMm: 10, baseThicknessMm: 2.0, textThicknessMm: 1.2, borderMm: 2.5, ringHoleDiameterMm: 4, ringWallMm: 2.5, ringDistanceMm: 1.2, price: 2500 },
  M: { fontSizeMm: 14, baseThicknessMm: 2.0, textThicknessMm: 1.4, borderMm: 3.0, ringHoleDiameterMm: 5, ringWallMm: 3.0, ringDistanceMm: 1.2, price: 3500 },
  L: { fontSizeMm: 18, baseThicknessMm: 2.4, textThicknessMm: 1.6, borderMm: 3.5, ringHoleDiameterMm: 5, ringWallMm: 3.0, ringDistanceMm: 1.2, price: 4500 },
}

export function priceForSize(size: KeychainSize): number {
  return SIZE_PRESETS[size].price
}
