// Собирает статические PDF-образцы для бесплатных /tools (кнопка «Скачать образец PDF»).
// Запуск вручную: npx --yes tsx scripts/build-sample-pdfs.mts [avr|kp|schet|nakladnaya]
// Берёт те же данные образца, что показывает страница (sample.ts), и тот же генератор
// документа, что печатает инструмент, поэтому PDF совпадает с тем, что человек получил бы
// сам. Данные вымышленные. Для каждого документа два файла: без НДС и с НДС 16%
// (переключатель НДС над образцом). Имена файлов берутся из sampleDownload.ts, чтобы
// страница и скрипт не разошлись. Печать идёт через установленный Chrome (headless),
// результат кладётся в public/samples и коммитится: на сборке и в рантайме ничего
// не генерируется.
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

/**
 * Убираем из HTML то, что нужно только на экране: скрипты (html2pdf, подгонка
 * масштаба), панель кнопок и её отступ-«распорку» (соседний элемент панели).
 */
function forPrint(html: string, extraCss = ''): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace('</head>', '<style>.toolbar, .toolbar + * { display: none !important; }' + extraCss + '</style></head>')
}

/** extraCss: поправка вёрстки только для печати PDF (например, чтобы лист не распался на два). */
type Built = { file: string; html: string; extraCss?: string }
type Vat = 'no_vat' | 'vat_16'
const VATS: Vat[] = ['no_vat', 'vat_16']

async function names() {
  const { SAMPLE_DOWNLOADS } = await import('../src/lib/tools-i18n/sampleDownload')
  return SAMPLE_DOWNLOADS
}
const stem = (fileName: string) => fileName

async function avr(): Promise<Built[]> {
  const s = await import('../src/app/tools/avr/sample')
  const { buildAVRHtml } = await import('../src/lib/generateAVR')
  const { documentRows } = await import('../src/app/tools/avr/calc')
  const N = (await names()).avr
  const e = s.SAMPLE_EXECUTOR
  const c = s.SAMPLE_CUSTOMER
  return VATS.map(vat => {
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
      vatType: vat,
      profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
    })
    if (!html) throw new Error('avr: пустой документ')
    return { file: stem(N.ru[vat].fileName), html }
  })
}

async function kp(): Promise<Built[]> {
  const s = await import('../src/app/tools/kp/sample')
  const { buildKPHtml } = await import('../src/lib/generateKP')
  const { kpLines } = await import('../src/app/tools/kp/calc')
  const N = (await names()).kp
  const out: Built[] = []
  for (const lang of ['ru', 'en', 'kk'] as const) {
    for (const vat of VATS) {
      const d = s.SAMPLE_BY_LANG[lang]
      const html = buildKPHtml({
        lang,
        showWatermark: true,
        number: s.SAMPLE_NUMBER,
        date: s.SAMPLE_DATE,
        validUntil: s.SAMPLE_VALID_UNTIL,
        clientName: d.buyerName,
        clientBin: s.SAMPLE_BUYER.bin,
        note: d.note,
        services: kpLines(d.rows),
        total: s.SAMPLE_TOTAL,
        vatType: vat,
        profile: {
          company_name: d.supplier.name,
          bin_iin: s.SAMPLE_SUPPLIER.bin,
          address: d.supplier.address,
          phone: s.SAMPLE_SUPPLIER.phone,
          email: s.SAMPLE_SUPPLIER.email,
          director_name: d.supplier.director,
        },
      })
      out.push({ file: stem(N[lang]![vat].fileName), html })
    }
  }
  return out
}

async function schet(): Promise<Built[]> {
  const s = await import('../src/app/tools/schet/sample')
  const { generateInvoicePDF } = await import('../src/lib/generatePDF')
  const { documentRows } = await import('../src/app/tools/schet/calc')
  const N = (await names()).schet
  const e = s.SAMPLE_SUPPLIER
  const out: Built[] = []
  for (const vat of VATS) {
    const html = await generateInvoicePDF({
      autoPrint: false,
      number: s.SAMPLE_NUMBER,
      date: s.SAMPLE_DATE,
      clientName: s.SAMPLE_BUYER.name,
      clientBin: s.SAMPLE_BUYER.bin,
      clientEmail: '',
      services: documentRows(s.SAMPLE_ROWS),
      total: s.SAMPLE_TOTAL,
      vatType: vat,
      profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
      bank: { bank_name: e.bankName, iik: e.iik, bik: e.bik, kbe: e.kbe },
      showWatermark: true,
    } as Parameters<typeof generateInvoicePDF>[0])
    out.push({ file: stem(N.ru[vat].fileName), html })
  }
  return out
}

async function nakladnaya(): Promise<Built[]> {
  const s = await import('../src/app/tools/nakladnaya/sample')
  const { buildNakladnayaHtml } = await import('../src/lib/generateNakladnaya')
  const { documentRows } = await import('../src/app/tools/nakladnaya/calc')
  const N = (await names()).nakladnaya
  const e = s.SAMPLE_SUPPLIER
  return VATS.map(vat => {
    const html = buildNakladnayaHtml({
      showWatermark: true,
      number: s.SAMPLE_NUMBER,
      date: s.SAMPLE_DATE,
      clientName: s.SAMPLE_BUYER.name,
      clientBin: s.SAMPLE_BUYER.bin,
      services: documentRows(s.SAMPLE_ROWS).map(r => ({ ...r, type: 'product' as const })),
      total: s.SAMPLE_TOTAL,
      vatType: vat,
      profile: { company_name: e.name, bin_iin: e.bin, address: e.address, director_name: e.director },
    })
    if (!html) throw new Error('nakladnaya: пустой документ')
    // Без уменьшения подписи уходят на вторую страницу и образец выглядит оборванным.
    return { file: stem(N.ru[vat].fileName), html, extraCss: 'html { zoom: 0.9; }' }
  })
}

const BUILDERS: Record<string, () => Promise<Built[]>> = { avr, kp, schet, nakladnaya }

const only = process.argv[2]
const toolNames = only ? [only] : Object.keys(BUILDERS)
mkdirSync(OUT_DIR, { recursive: true })
for (const name of toolNames) {
  const build = BUILDERS[name]
  if (!build) throw new Error(`Неизвестный инструмент: ${name}`)
  for (const { file, html, extraCss } of await build()) {
    const tmp = mkdtempSync(join(tmpdir(), 'ikz-sample-'))
    try {
      const htmlPath = join(tmp, 'doc.html')
      writeFileSync(htmlPath, forPrint(html, extraCss), 'utf8')
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
}
