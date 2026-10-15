// Как подписать номер компании в карточке профиля и что показать в аватаре
// (ревизия /profile 15.10.2026: раньше везде стояло «ИИН», даже у ТОО, а без
// названия аватар показывал «FP»).

export type CompanyIdKind = 'bin' | 'iin' | 'unknown'

// Организационно-правовая форма в начале названия. ИП (ЖК, IP) — физлицо,
// номер у него ИИН; у юрлиц (ТОО, АО, ЖШС, АҚ, LLP…) — БИН.
const SOLE_PROPRIETOR_PREFIX = /^(ип|жк|ip)(?=$|[\s.,«"'“„(])/i
const LEGAL_ENTITY_PREFIX = /^(тоо|ао|пао|зао|оао|жшс|ақ|ак|llp|llc|jsc|ltd|пк|кт|тдо|оо|оф|оюл|чу|гу|ргп|гкп|рмк|мкм)(?=$|[\s.,«"'“„(])/i

/**
 * БИН или ИИН. Сначала — по форме в начале названия; если её нет — по самому
 * номеру: у ИИН 5-я цифра — первая цифра дня рождения (0–3), у БИН — тип
 * юрлица (4–6). Ни то, ни другое — 'unknown', и подпись будет «БИН/ИИН».
 */
export function companyIdKind(companyName: string | null | undefined, binIin: string | null | undefined): CompanyIdKind {
  const name = (companyName || '').trim().replace(/^[«"'“„]+/, '')
  if (SOLE_PROPRIETOR_PREFIX.test(name)) return 'iin'
  if (LEGAL_ENTITY_PREFIX.test(name)) return 'bin'
  const digits = (binIin || '').replace(/\D/g, '')
  if (digits.length === 12) {
    const fifth = Number(digits[4])
    if (fifth >= 4 && fifth <= 6) return 'bin'
    if (fifth >= 0 && fifth <= 3) return 'iin'
  }
  return 'unknown'
}

/**
 * Две буквы для аватара из настоящего названия: без формы собственности и
 * кавычек. «ТОО «Альфа Строй»» → «АС», «ИП Смагулов А.К.» → «СА».
 * Пустая строка — названия нет, вместо букв показывается нейтральная иконка.
 */
export function companyInitials(companyName: string | null | undefined): string {
  let name = (companyName || '').trim().replace(/^[«"'“„]+/, '')
  name = name.replace(SOLE_PROPRIETOR_PREFIX, '').replace(LEGAL_ENTITY_PREFIX, '')
  const words = name
    .replace(/[«»"'“”„()]/g, ' ')
    .split(/[\s.,]+/)
    .filter(w => /[\p{L}\p{N}]/u.test(w))
  if (words.length === 0) return ''
  const first = (w: string) => (w.match(/[\p{L}\p{N}]/u)?.[0] || '').toUpperCase()
  return (first(words[0]) + (words[1] ? first(words[1]) : '')).slice(0, 2)
}
