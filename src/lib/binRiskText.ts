// Общие короткие подписи для результатов проверки по БИН (25.10.2026): причины
// попадания в список неблагонадёжных и название налогового режима. Их читают и
// публичный /tools/kontragent, и форма счёта /create, поэтому они здесь, а не в
// словаре одного из них.
//
// kk: вычитка носителем языка ждёт основателя. en без кириллицы (проверяет тест).
// В строках нет тире и эмодзи.

import type { TaxRegime, UnreliableCategory } from './kgdTaxpayer'

export type RiskLang = 'ru' | 'kk' | 'en'

const CATEGORY_NAME: Record<RiskLang, Record<UnreliableCategory, string>> = {
  ru: {
    inactive: 'бездействующий налогоплательщик',
    bankrupt: 'банкрот по решению суда',
    registrationInvalid: 'регистрация признана недействительной',
    reregistrationInvalid: 'перерегистрация признана недействительной',
    other: 'другая категория списка КГД',
  },
  kk: {
    inactive: 'әрекетсіз салық төлеуші',
    bankrupt: 'сот шешімі бойынша банкрот',
    registrationInvalid: 'тіркелуі жарамсыз деп танылған',
    reregistrationInvalid: 'қайта тіркелуі жарамсыз деп танылған',
    other: 'МКК тізімінің басқа санаты',
  },
  en: {
    inactive: 'inactive taxpayer',
    bankrupt: 'declared bankrupt by a court',
    registrationInvalid: 'registration declared invalid',
    reregistrationInvalid: 're-registration declared invalid',
    other: 'another category of the KGD list',
  },
}

/** Причины попадания в список через «; ». Пустая строка, если причин нет. */
export function unreliableCategoriesText(categories: readonly UnreliableCategory[] | null | undefined, lang: RiskLang): string {
  return (categories ?? []).map(c => CATEGORY_NAME[lang][c]).join('; ')
}

const REGIME_NAME: Record<string, Record<RiskLang, string>> = {
  SNR_GENERAL_ORDER: {
    ru: 'Общеустановленный порядок',
    kk: 'Жалпыға бірдей белгіленген тәртіп',
    en: 'General regime',
  },
  SNR_SIMPLIFIED_DECLARATION: {
    ru: 'Упрощённая декларация',
    kk: 'Оңайлатылған декларация',
    en: 'Simplified declaration',
  },
}

const REGIME_UNKNOWN: Record<RiskLang, string> = {
  ru: 'Другой режим (см. КГД)',
  kk: 'Басқа режим (МКК қараңыз)',
  en: 'Other regime (see KGD)',
}

const HAS_CYRILLIC = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/

/**
 * Название режима. Известные типы называем сами (одинаково на трёх языках);
 * незнакомый показываем под названием КГД на нужном языке. На английском
 * кириллица не допускается: если КГД не дал английского названия, пишем общую
 * подпись, а не русское слово.
 */
export function taxRegimeName(regime: TaxRegime, lang: RiskLang): string {
  const known = REGIME_NAME[regime.type]
  if (known) return known[lang]
  const own = lang === 'ru' ? regime.nameRu : lang === 'kk' ? regime.nameKk ?? regime.nameRu : regime.nameEn
  if (own && (lang !== 'en' || !HAS_CYRILLIC.test(own))) return own
  return REGIME_UNKNOWN[lang]
}

/**
 * Режимы одной строкой: «Название с 01.01.2026; Название». `date` форматирует
 * ISO-дату (formatIsoDate); `since` и `until` собирают фразу «с ДАТА» и «по ДАТА»
 * на языке страницы (в казахском предлог стоит после даты).
 */
export function taxRegimesText(
  regimes: readonly TaxRegime[],
  lang: RiskLang,
  date: (iso: string | null) => string | null,
  phrases: { since: (date: string) => string; until: (date: string) => string },
): string {
  return regimes
    .map(r => {
      const from = date(r.beginDate)
      const to = date(r.endDate)
      return [taxRegimeName(r, lang), from ? phrases.since(from) : '', to ? phrases.until(to) : '']
        .filter(Boolean)
        .join(' ')
    })
    .join('; ')
}

/** Ссылка на поиск elicense.kz с уже подставленным БИН; капчу вводит человек. */
export function elicenseSearchUrl(bin: string, lang: 'ru' | 'kk' | 'en' = 'ru'): string {
  const base = 'https://elicense.kz/LicensingContent/SimpleSearchLicense'
  const query = `IinBinStr=${encodeURIComponent(bin)}&IinBinEquality=1`
  return lang === 'kk' ? `${base}?${query}` : `${base}?lang=ru&${query}`
}
