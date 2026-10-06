// src/lib/printShop/fonts.ts
export type PrintShopFont = { id: string; label: string; family: string }

// Должно 1:1 соответствовать public/fonts/print-shop/<id>.ttf -- см.
// scripts/fetch-print-shop-fonts.mjs, которым эти файлы были скачаны.
export const PRINT_SHOP_FONTS: PrintShopFont[] = [
  { id: 'pt-sans', label: 'PT Sans', family: 'PT Sans' },
  { id: 'pt-sans-caption', label: 'PT Sans Caption', family: 'PT Sans Caption' },
  { id: 'pt-serif', label: 'PT Serif', family: 'PT Serif' },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat' },
  { id: 'ruda', label: 'Ruda', family: 'Ruda' },
  { id: 'golos-text', label: 'Golos Text', family: 'Golos Text' },
  { id: 'unbounded', label: 'Unbounded', family: 'Unbounded' },
  { id: 'caveat', label: 'Caveat', family: 'Caveat' },
  { id: 'comfortaa', label: 'Comfortaa', family: 'Comfortaa' },
  { id: 'onest', label: 'Onest', family: 'Onest' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope' },
  { id: 'exo-2', label: 'Exo 2', family: 'Exo 2' },
  { id: 'tektur', label: 'Tektur', family: 'Tektur' },
  { id: 'bad-script', label: 'Bad Script', family: 'Bad Script' },
  { id: 'marck-script', label: 'Marck Script', family: 'Marck Script' },
  { id: 'yeseva-one', label: 'Yeseva One', family: 'Yeseva One' },
  { id: 'russo-one', label: 'Russo One', family: 'Russo One' },
  { id: 'yanone-kaffeesatz', label: 'Yanone Kaffeesatz', family: 'Yanone Kaffeesatz' },
  { id: 'jura', label: 'Jura', family: 'Jura' },
  { id: 'play', label: 'Play', family: 'Play' },
]

export function findPrintShopFont(id: string): PrintShopFont | undefined {
  return PRINT_SHOP_FONTS.find(f => f.id === id)
}

export function printShopFontUrl(id: string): string {
  return `/fonts/print-shop/${id}.ttf`
}
