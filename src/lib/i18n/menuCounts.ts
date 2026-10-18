import type { Lang } from '@/components/LanguageProvider'

// Подпись к числу у пункта бокового меню Kaspi Bot (18.10.2026): «12 в работе».
// Число идёт перед словом, поэтому в словаре только слово(а).
export const menuCountDict: Record<Lang, { inWork: string }> = {
  ru: { inWork: 'в работе' },
  kk: { inWork: 'өңделуде' },
  en: { inWork: 'in progress' },
}

export function menuCountLabel(n: number, lang: Lang): string {
  return `${n} ${menuCountDict[lang].inWork}`
}
