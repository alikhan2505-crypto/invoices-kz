// Собирает статические PDF-образцы для бесплатных /tools (кнопка «Скачать образец PDF»).
// Запуск вручную: npx --yes tsx scripts/build-sample-pdfs.mts [avr|kp|schet|nakladnaya]
// Берёт те же данные образца, что показывает страница (sample.ts), и тот же генератор
// документа, что печатает инструмент, поэтому PDF совпадает с тем, что человек получил бы
// сам. Данные вымышленные. Печать идёт через установленный Chrome (headless), результат
// кладётся в public/samples и коммитится: на сборке и в рантайме ничего не генерируется.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT_DIR = resolve('public/samples')

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)
if (!CHROME) throw new Error('Не найден Chrome/Edge для печати в PDF')

/** Убираем из HTML то, что нужно только на экране: скрипты, панель кнопок и её отступ. */
function forPrint(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="toolbar"[\s\S]*?<div style="height:50px;"><\/div>/i, '')
}

async function avr(): Promise<{ file: string; html: string }> {
  const s = await import('../src/app/tools/avr/sample')
  const { buildAVRHtml } = await import('../src/lib/generateAVR')
  const { documentRows } = await import('../src/app/tools/avr/calc')
  const e = s.SAMPLE_EXECUTOR
  const c = s.SAMPLE_CUSTOMER
  const html = buildAVRHtml({
    showWatermark: true,
    number: s.SAMPLE_NUMBER,
    date: s.SAMPLE_DATE,
    contractNumber: s.SAMPLE_CONTRACT_NUMBER,
    contractDate: s.SAMPLE_CONTRACT_DATE,
    clientName: c.name,
    clientBin: c.bin,
    clientAddress: c.address,
    services: documentRows(s.SAMPLE_ROWS),
    total: s.SAMPLE_TOTAL,
    vatType: s.SAMPLE_VAT_TYPE,
    profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
  })
  if (!html) throw new Error('avr: пустой документ')
  return { file: 'obrazec-akta-vypolnennyh-rabot.pdf', html }
}

const BUILDERS: Record<string, () => Promise<{ file: string; html: string }>> = { avr }

const only = process.argv[2]
const names = only ? [only] : Object.keys(BUILDERS)
mkdirSync(OUT_DIR, { recursive: true })
for (const name of names) {
  const build = BUILDERS[name]
  if (!build) throw new Error(`Неизвестный инструмент: ${name}`)
  const { file, html } = await build()
  const tmp = mkdtempSync(join(tmpdir(), 'ikz-sample-'))
  try {
    const htmlPath = join(tmp, 'doc.html')
    writeFileSync(htmlPath, forPrint(html), 'utf8')
    const pdfPath = join(OUT_DIR, file)
    execFileSync(CHROME!, [
      '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
      `--user-data-dir=${join(tmp, 'profile')}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ], { stdio: 'ignore', timeout: 60000 })
    console.log(`${name}: ${file} ${statSync(pdfPath).size} bytes`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
