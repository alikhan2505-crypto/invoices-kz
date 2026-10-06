// scripts/fetch-print-shop-fonts.mjs
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

// Кириллические шрифты Google Fonts, достаточно толстые/округлые для
// 3D-печати мелким текстом (без тонких засечек/волосяных линий). Список
// курирован вручную 2026-10-05 -- см. docs/superpowers/specs/2026-10-05-
// print-keychain-shop-design.md.
//
// ВАЖНО (2026-10-06): шрифт в этот список попадает только после ПРОВЕРКИ
// сборки реальной геометрии многобуквенного имени через
// buildKeychainGeometries -- наличия глифов НЕ достаточно. opentype.js 2.0
// не поддерживает GSUB substFormat 2 для lookupType 6 и бросает
// "substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet
// supported" на ЛЮБОЙ строке длиннее одного символа. Так тихо выпали
// Nunito, Rubik и Oswald (заменены на Ruda, Onest, Yanone Kaffeesatz) --
// каждый из них показывал все глифы на месте и всё равно не рендерил ни
// одного имени. Из той же ловушки: Nunito Sans, Inter Tight, Oswald на
// любом весе. Шрифты без реальной кириллицы (Actor, Anton, Baloo 2 --
// CSS2 отдаёт латинский сабсет) тоже сюда не годятся.
const FONTS = [
  { id: 'pt-sans', label: 'PT Sans', family: 'PT Sans', weight: 700 },
  { id: 'pt-sans-caption', label: 'PT Sans Caption', family: 'PT Sans Caption', weight: 700 },
  { id: 'pt-serif', label: 'PT Serif', family: 'PT Serif', weight: 700 },
  { id: 'montserrat', label: 'Montserrat', family: 'Montserrat', weight: 800 },
  { id: 'ruda', label: 'Ruda', family: 'Ruda', weight: 800 },
  { id: 'golos-text', label: 'Golos Text', family: 'Golos Text', weight: 700 },
  { id: 'unbounded', label: 'Unbounded', family: 'Unbounded', weight: 700 },
  { id: 'caveat', label: 'Caveat', family: 'Caveat', weight: 700 },
  { id: 'comfortaa', label: 'Comfortaa', family: 'Comfortaa', weight: 700 },
  { id: 'onest', label: 'Onest', family: 'Onest', weight: 800 },
  { id: 'manrope', label: 'Manrope', family: 'Manrope', weight: 800 },
  { id: 'exo-2', label: 'Exo 2', family: 'Exo 2', weight: 800 },
  { id: 'tektur', label: 'Tektur', family: 'Tektur', weight: 700 },
  { id: 'bad-script', label: 'Bad Script', family: 'Bad Script', weight: 400 },
  { id: 'marck-script', label: 'Marck Script', family: 'Marck Script', weight: 400 },
  { id: 'yeseva-one', label: 'Yeseva One', family: 'Yeseva One', weight: 400 },
  { id: 'russo-one', label: 'Russo One', family: 'Russo One', weight: 400 },
  { id: 'yanone-kaffeesatz', label: 'Yanone Kaffeesatz', family: 'Yanone Kaffeesatz', weight: 700 },
  { id: 'jura', label: 'Jura', family: 'Jura', weight: 700 },
  { id: 'play', label: 'Play', family: 'Play', weight: 700 },
]

const OUT_DIR = path.resolve(process.cwd(), 'public/fonts/print-shop')
// Пресловутый приём: UA без поддержки WOFF2 -- Google CSS2 API честно
// отдаёт ссылку на обычный TTF вместо woff2, который opentype.js не читает.
// NB 2026-10-06: Firefox/4.0 UA (как в исходном плане) уже недостаточно
// стар -- Google теперь отдаёт ему WOFF1 (format('woff'), url без .ttf в
// пути). Нужен UA из до-WOFF эпохи (Firefox 1.0, 2004 год), тогда CSS2
// отдаёт format('truetype') и реальные TTF-байты (magic 00 01 00 00).
const LEGACY_UA = 'Mozilla/5.0 (Windows NT 5.1; rv:1.0) Gecko/20100101 Firefox/1.0'

// Google CSS2's `text=` parameter is SUBSETTING, not a hint: the .ttf it
// hands back physically contains ONLY the glyphs listed here. Everything a
// customer may type on a keychain must therefore be in this string -- a
// character left out is a character the font "does not have" as far as
// opentype.js (and /api/print/orders's glyph check) can tell, no matter how
// complete the real upstream family is.
//
// 2026-10-06: the first version of this script listed only basic Russian
// Cyrillic + Latin, so ALL 20 downloaded fonts rejected Әсел / Қуаныш /
// Өмірбек / Ұлан / Үміт / Ілияс, every digit, and every hyphenated name
// (Аян-Бек) -- in a Kazakhstan name-keychain shop. Hence the three extra
// groups below.
const CHARSET = [
  // Базовая русская кириллица
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ',
  'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  // Специфические казахские буквы (их НЕ покрывает русский набор выше)
  'ӘҒҚҢӨҰҮҺІ',
  'әғқңөұүһі',
  // Латиница
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  // Цифры (годы, номера машин, «№7») и пунктуация (дефис в двойных именах
  // вроде Аян-Бек -- обязателен)
  '0123456789',
  "-.,!?'’&№ ",
].join('')

async function fetchFontTtfUrl(family, weight) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(CHARSET)}`
  const res = await fetch(cssUrl, { headers: { 'User-Agent': LEGACY_UA } })
  if (!res.ok) throw new Error(`CSS2 API ${res.status} for ${family}`)
  const css = await res.text()
  // Современный CSS2-ответ не содержит .ttf в пути -- URL вида
  // .../l/font?kit=...&skey=...&v=... Матчим только когда формат явно
  // truetype, чтобы не словить случайно woff/woff2 для редкой комбинации.
  const match = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\('truetype'\)/)
  if (!match) throw new Error(`no truetype url found for ${family} (got: ${css.slice(0, 300)})`)
  return match[1]
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const failures = []
  for (const font of FONTS) {
    try {
      const ttfUrl = await fetchFontTtfUrl(font.family, font.weight)
      const bytes = await (await fetch(ttfUrl)).arrayBuffer()
      await writeFile(path.join(OUT_DIR, `${font.id}.ttf`), Buffer.from(bytes))
      console.log(`OK  ${font.id} <- ${ttfUrl}`)
    } catch (e) {
      console.error(`FAIL ${font.id}: ${e.message}`)
      failures.push(font.id)
    }
  }
  if (failures.length) {
    console.error(`\n${failures.length} font(s) failed: ${failures.join(', ')} -- fix or drop from the list before continuing.`)
    process.exit(1)
  }
}

main()
