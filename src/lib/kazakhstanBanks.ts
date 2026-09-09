// The banks a Kazakhstan business can hold a settlement account with, each
// with its official name and БИК.
//
// Why this exists: /profile/banks asked for the bank name and the БИК as two
// free-text fields, and the live data shows what that produces. One bank was
// spelled seven different ways across sixteen accounts ("Каспи", "AO kaspi
// bank", 'АО "Каспи банк"', ...), and the БИК column held "Casdfgh" and
// "123456789". Those values are not decoration: they are printed on the
// invoice PDF the payer's accountant works from.
//
// It is also the step customers stop at. Of the 19 accounts that filled in a
// company name and then never issued an invoice, every single one had an empty
// bank block. A name and a БИН are typed from memory; an account number and a
// БИК mean opening the banking app. Picking the bank from a list removes that
// trip without making the field optional.
//
// Deliberately NOT here: deriving the bank from the ИИК. A KZ IBAN does carry
// a bank identifier in positions 5-7, and our own accounts confirm two of them
// (722 → Kaspi, 601 → Halyk), but the public tables for the rest disagreed
// with each other and with those two. Guessing wrong would silently print
// another bank's details on a real invoice, which is worse than one extra tap.

export interface KazakhstanBank {
  /** БИК — the 8-character SWIFT/BIC that goes on the invoice. */
  bik: string
  /** Official name, as it should appear on the document. */
  name: string
}

/**
 * Ordered by how likely a small Kazakhstan business is to bank there, not
 * alphabetically: the first three cover most of the accounts we have.
 *
 * Every БИК below is confirmed from two independent sources. HSBKKZKX and
 * CASPKZKA are additionally confirmed by our own production rows, where real
 * users typed them by hand.
 */
export const KAZAKHSTAN_BANKS: KazakhstanBank[] = [
  { bik: 'CASPKZKA', name: 'АО «Kaspi Bank»' },
  { bik: 'HSBKKZKX', name: 'АО «Народный Банк Казахстана»' },
  { bik: 'KCJBKZKX', name: 'АО «Банк ЦентрКредит»' },
  { bik: 'IRTYKZKA', name: 'АО «ForteBank»' },
  { bik: 'TSESKZKA', name: 'АО «Jusan Bank»' },
  { bik: 'EURIKZKA', name: 'АО «Евразийский банк»' },
  { bik: 'KSNVKZKA', name: 'АО «Freedom Bank Kazakhstan»' },
  { bik: 'SABRKZKA', name: 'АО «Bereke Bank»' },
  { bik: 'ATYNKZKA', name: 'АО «Altyn Bank»' },
  { bik: 'KINCKZKA', name: 'АО «Банк RBK»' },
  { bik: 'NURSKZKX', name: 'АО «Нурбанк»' },
  { bik: 'INLMKZKA', name: 'АО «Home Credit Bank»' },
  { bik: 'VTBAKZKZ', name: 'ДО АО Банк ВТБ (Казахстан)' },
  { bik: 'SHBKKZKA', name: 'АО «Шинхан Банк Казахстан»' },
  { bik: 'CITIKZKA', name: 'АО «Ситибанк Казахстан»' },
  { bik: 'KZIBKZKA', name: 'АО «ДБ «КЗИ Банк»' },
  { bik: 'BKCHKZKA', name: 'ДБ АО «Банк Китая в Казахстане»' },
  { bik: 'ICBKKZKX', name: 'ДБ АО «Торгово-промышленный Банк Китая в г. Алматы»' },
  { bik: 'HLALKZKZ', name: 'АО «Исламский Банк «Al Hilal»' },
  { bik: 'ZAJSKZ22', name: 'АО «Исламский банк «Заман-Банк»' },
]

/** Sentinel for the "my bank is not listed" option, which reopens free text. */
export const OTHER_BANK = '__other__'

/**
 * The registry entry for `bik`, or null.
 *
 * Case- and space-insensitive because the existing rows are hand-typed: one
 * account carries "HSBKKZKX " with a trailing space, and it should still
 * light up its bank in the picker rather than silently falling through to
 * "other" and looking unsaved.
 */
export function findBankByBik(bik: string | null | undefined): KazakhstanBank | null {
  const needle = (bik || '').replace(/\s/g, '').toUpperCase()
  if (!needle) return null
  return KAZAKHSTAN_BANKS.find(b => b.bik === needle) || null
}

/**
 * The registry entry whose name matches `name`, or null.
 *
 * Used to recognise an account saved before the picker existed, so editing it
 * shows the bank selected instead of dropping the user into the free-text
 * fallback. Matching ignores case, spacing and the quote characters people
 * vary on — 'АО "Kaspi Bank"', 'АО «Kaspi Bank»' and 'AO Kaspi Bank' are the
 * same bank, and the live data contains all three shapes.
 */
export function findBankByName(name: string | null | undefined): KazakhstanBank | null {
  const normalize = (value: string) =>
    value.replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const needle = normalize(name || '')
  if (!needle) return null
  return KAZAKHSTAN_BANKS.find(b => normalize(b.name) === needle) || null
}
