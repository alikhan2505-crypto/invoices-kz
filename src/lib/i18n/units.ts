import type { Lang } from '@/components/LanguageProvider'

// Units of measure are STORED in Russian (invoices.items[].unit, PDFs, ЭСФ),
// so the values never change -- only the label shown in the UI does.
// Unknown/free-text units are shown as they were typed.
const UNIT_LABELS: Record<string, { kk: string; en: string }> = {
  'шт': { kk: 'дана', en: 'pcs' },
  'кг': { kk: 'кг', en: 'kg' },
  'л': { kk: 'л', en: 'l' },
  'м': { kk: 'м', en: 'm' },
  'м²': { kk: 'м²', en: 'm²' },
  'м³': { kk: 'м³', en: 'm³' },
  'час': { kk: 'сағат', en: 'hour' },
  'день': { kk: 'күн', en: 'day' },
  'месяц': { kk: 'ай', en: 'month' },
  'услуга': { kk: 'қызмет', en: 'service' },
  'работа': { kk: 'жұмыс', en: 'work' },
}

export const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

export function unitLabel(unit: string, lang: Lang): string {
  if (lang === 'ru') return unit
  return UNIT_LABELS[unit]?.[lang] ?? unit
}
