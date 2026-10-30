interface KPService {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
  description?: string
}

export interface KPData {
  /** Язык печатного документа: 'ru' (по умолчанию), 'kk' или 'en'. Пользовательский ввод не переводится. */
  lang?: KpLang
  // Бледный знак INVOICES.KZ фоном — бесплатные /tools (см. docWatermark.ts).
  showWatermark?: boolean
  number: string
  date: string
  validUntil?: string
  clientName: string
  clientBin?: string
  clientAddress?: string
  clientPhone?: string
  clientEmail?: string
  services: KPService[]
  total: number
  note?: string
  vatType?: 'no_vat' | 'vat_0' | 'vat_16'
  profile?: {
    company_name: string
    bin_iin: string
    address: string
    phone?: string
    email?: string
    director_name?: string
    signature_url?: string
    stamp_url?: string
    logo_url?: string
  }
  bank?: {
    bank_name: string
    iik: string
    bik: string
    kbe?: string
  }
}

import { resizeToFit } from './imageResize'
import { docFitScript, docShareButtonHtml, docShareScript } from './docFit'
import { watermarkCss, watermarkBodyClass } from './docWatermark'
import { escapeHtml, escapeAttr } from './htmlEscape'
import { kpStrings, kpUnitLabel, kpFileName, isKpLang, type KpLang } from './kpI18n'

/** Картинки (подпись/печать/логотип) после resizeToFit: обычно data:image/png, но при ошибке загрузки — исходный URL из профиля. */
export interface KPImages {
  signature?: string
  stamp?: string
  logo?: string
}

// В src="" пускаем только http(s) и наши data:image/ — всё остальное
// (javascript:, data:text/html, мусор) выбрасываем. Плюс экранирование атрибута.
function safeImageSrc(url: string | undefined): string {
  const u = (url || '').trim()
  if (!u) return ''
  if (!/^(https?:|data:image\/)/i.test(u)) return ''
  return escapeAttr(u)
}

// Значение для строкового литерала внутри инлайн-<script>: JSON.stringify
// закрывает кавычки/обратные слэши, а «<» превращается в JS-эскейп
// (обратный слэш + u003c), чтобы текст не закрыл </script> и не открыл <!--.
const JS_LT = String.fromCharCode(92) + 'u003c'
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, JS_LT)
}

export async function generateKP(data: KPData, existingWin?: Window | null) {
  const p = data.profile
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''
  const logoUrl = p?.logo_url || ''

  // Подпись — сохраняем пропорции, максимум 200x60
  const signatureBase64 = signatureUrl ? await resizeToFit(signatureUrl, 200, 60) : ''
  // Печать — квадрат 110x110
  const stampBase64 = stampUrl ? await resizeToFit(stampUrl, 110, 110) : ''
  const logoBase64 = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''

  const html = buildKPHtml(data, { signature: signatureBase64, stamp: stampBase64, logo: logoBase64 })

  const win = existingWin || window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

/**
 * Чистая сборка HTML коммерческого предложения. Весь пользовательский текст
 * (профиль продавца, клиент — в т.ч. из госреестра, позиции, банк) экранируется.
 */
export function buildKPHtml(data: KPData, images: KPImages = {}): string {
  const p = data.profile
  const b = data.bank
  const lang: KpLang = isKpLang(data.lang) ? data.lang : 'ru'
  const L = kpStrings(lang)

  const companyName = escapeHtml(p?.company_name || L.defaultCompany)
  const binIin = escapeHtml(p?.bin_iin || '')
  const address = escapeHtml(p?.address || '')
  const phone = escapeHtml(p?.phone || '')
  const email = escapeHtml(p?.email || '')
  const director = escapeHtml(p?.director_name || '')
  const kpNumber = escapeHtml(data.number)
  const kpDate = escapeHtml(data.date)

  const signatureBase64 = safeImageSrc(images.signature)
  const stampBase64 = safeImageSrc(images.stamp)
  const logoBase64 = safeImageSrc(images.logo)

  function formatMoney(n: number): string {
    return escapeHtml(n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  const validDate = escapeHtml(data.validUntil || (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('ru-KZ')
  })())

  // НДС расчёт
  const vatType = data.vatType || 'no_vat'
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(data.total / 1.16) : data.total
  const vatAmount = vatType === 'vat_16' ? Math.round(data.total - data.total / 1.16) : 0

  const hasCodes = data.services.some(s => String(s.code ?? '').trim() !== '')

  let totalsHTML = ''
  if (vatType === 'vat_16') {
    totalsHTML = `
      <div class="totals-row">
        <label>${L.subtotalNoVat}</label>
        <span>${formatMoney(totalWithoutVat)} ₸</span>
      </div>
      <div class="totals-row">
        <label>${L.vat16}</label>
        <span>${formatMoney(vatAmount)} ₸</span>
      </div>
      <div class="totals-row total-final">
        <label>${L.totalDue}</label>
        <span>${formatMoney(data.total)} ₸</span>
      </div>
    `
  } else if (vatType === 'vat_0') {
    totalsHTML = `
      <div class="totals-row">
        <label>${L.total}</label>
        <span>${formatMoney(data.total)} ₸</span>
      </div>
      <div class="totals-row">
        <label>${L.vat0}</label>
        <span>0,00 ₸</span>
      </div>
      <div class="totals-row total-final">
        <label>${L.totalDue}</label>
        <span>${formatMoney(data.total)} ₸</span>
      </div>
    `
  } else {
    totalsHTML = `
      <div class="totals-row">
        <label>${L.total}</label>
        <span>${formatMoney(data.total)} ₸</span>
      </div>
      <div class="totals-row">
        <label>${L.vatLabel}</label>
        <span>${L.noVat}</span>
      </div>
      <div class="totals-row total-final">
        <label>${L.totalDue}</label>
        <span>${formatMoney(data.total)} ₸</span>
      </div>
    `
  }

  const html = `
    <!DOCTYPE html>
    <html${L.htmlLang ? ` lang="${L.htmlLang}"` : ''}>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=794, initial-scale=1.0, maximum-scale=1.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-text-size-adjust: 100%; }
        html { background: #888; }
        body {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #1a1a1a;
          width: 794px;
          min-height: 1123px;
          display: flex;
          flex-direction: column;
          margin: 20px auto;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.3);
        }
        .header {
          background: #1C2056;
          padding: 30px 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .header-left .company { font-size: 20px; font-weight: bold; color: white; margin-bottom: 6px; }
        .header-left .company-details { font-size: 10px; color: rgba(255,255,255,0.7); line-height: 1.8; }
        .header-right { text-align: right; }
        .header-right .kp-label { font-size: 11px; color: rgba(255,255,255,0.6); margin-bottom: 4px; }
        .header-right .kp-number { font-size: 22px; font-weight: bold; color: white; }
        .header-right .kp-date { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 4px; }
        .accent-bar { background: #2DC48D; height: 6px; }
        .content { padding: 30px 40px; flex: 1 0 auto; }
        .title-block { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #f0f0f0; }
        .title-block h1 { font-size: 18px; color: #1C2056; margin-bottom: 6px; }
        .title-block .subtitle { font-size: 11px; color: #666; }
        .parties { display: flex; gap: 20px; margin-bottom: 24px; }
        .party {
          flex: 1;
          background: #f8f9fa;
          border-left: 3px solid #1C2056;
          padding: 12px 14px;
          border-radius: 0 6px 6px 0;
        }
        .party.client { border-left-color: #2DC48D; }
        .party-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
        .party-name { font-size: 12px; font-weight: bold; color: #1C2056; margin-bottom: 3px; }
        .party-detail { font-size: 10px; color: #555; line-height: 1.6; }
        .section-title {
          font-size: 13px;
          font-weight: bold;
          color: #1C2056;
          margin-bottom: 10px;
          padding-left: 10px;
          border-left: 3px solid #2DC48D;
        }
        .services-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
        .services-table thead tr { background: #1C2056; color: white; }
        .services-table thead th { padding: 8px 10px; text-align: center; font-weight: bold; font-size: 10px; }
        .services-table thead th.name { text-align: left; }
        .services-table tbody tr:nth-child(even) { background: #f8f9fa; }
        .services-table tbody tr:nth-child(odd) { background: white; }
        .services-table tbody td {
          padding: 8px 10px;
          border-bottom: 1px solid #e9ecef;
          text-align: center;
          vertical-align: top;
        }
        .services-table tbody td.name { text-align: left; }
        .services-table tbody td.right { text-align: right; }
        .totals-block { display: flex; justify-content: flex-end; margin-bottom: 24px; }
        .totals-inner { width: 280px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 14px;
          font-size: 10px;
          border-bottom: 1px solid #f0f0f0;
        }
        .totals-row:last-child { border-bottom: none; }
        .totals-row.total-final {
          background: #1C2056;
          color: white;
          font-weight: bold;
          font-size: 12px;
        }
        .totals-row label { color: #666; }
        .totals-row.total-final label { color: rgba(255,255,255,0.8); }
        .bank-block {
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 14px;
          margin-bottom: 24px;
        }
        /* Примечание (условия, сроки, доставка) — до 14.10.2026 поле было в форме,
           но в документ не попадало. */
        .note-block {
          background: #f8f9fa;
          border-left: 3px solid #2DC48D;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 24px;
          font-size: 11px;
          color: #333;
          line-height: 1.5;
          white-space: pre-line;
          overflow-wrap: anywhere;
        }
        .bank-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .bank-item label { font-size: 9px; color: #888; display: block; margin-bottom: 2px; }
        .bank-item span { font-size: 10px; color: #1C2056; font-weight: 500; }
        .signature-block {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
        }
        .sig-left { width: 45%; }
        /* Подпись — сразу под заголовком (правка основателя 14.10: строка и ФИО
           были далеко от «Руководитель / Представитель»). Место под картинку
           подписи/печати — только когда она есть. */
        .sig-label { font-size: 10px; color: #888; margin-bottom: 6px; }
        .sig-line { position: relative; min-height: 28px; border-bottom: 1px solid #333; }
        .sig-line.has-img { min-height: 56px; }
        .sig-name { font-size: 10px; color: #333; padding-top: 4px; }
        .footer {
          background: #1C2056;
          padding: 12px 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 30px;
        }
        .footer-brand { font-size: 11px; font-weight: bold; color: white; }
        .footer-sub { font-size: 10px; color: rgba(255,255,255,0.6); }
        @media print {
          .toolbar { display: none !important; }
          html { background: white; }
          /* Как в «Скачать PDF»: лист без полей принтера, шапка и футер до краёв,
             футер внизу листа; чуть ниже A4 — без лишней страницы. Без полей
             браузер не печатает и свои колонтитулы (about:blank, дата). */
          @page { size: A4; margin: 0; }
          body { margin: 0; box-shadow: none; min-height: 296mm; }
        }
        /* Скачивание PDF: лист чуть ниже A4 (1122,5px) — ровно 1123px давали
           полпикселя на вторую страницу. */
        body.ikz-pdf { min-height: 1118px; }
      ${watermarkCss(data.showWatermark)}
</style>
    </head>
    <body${watermarkBodyClass(data.showWatermark)}>

      <!-- Toolbar -->
      <div class="toolbar" style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:flex-start; gap:8px;">
        <!-- Кнопки слева: на телефоне документ не масштабируется, и правый
             край панели (где были «Печать» и «Скачать PDF») уходил за экран. -->
        <button onclick="window.close()" style="background:#f3f4f6; color:#374151; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">${L.back}</button>
        <button class="ikz-print" onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">${L.print}</button>
        <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">${L.downloadPdf}</button>
        ${docShareButtonHtml(data.showWatermark)}
        <span style="margin-left:auto; white-space:nowrap; font-size:12px; color:#6b7280; font-weight:600;">${L.toolbarNo}${kpNumber}</span>
      </div>
      <div style="height:55px;"></div>

      ${logoBase64 ? `
      <div style="text-align:center; padding:8px 0;">
        <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain; display:block; margin:0 auto;" />
      </div>
      ` : ''}

      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <div class="company">${companyName}</div>
          <div class="company-details">
            ${L.bin}${binIin}<br>
            ${address}<br>
            ${phone ? L.tel + phone : ''}${phone && email ? ' · ' : ''}${email ? email : ''}
          </div>
        </div>
        <div class="header-right">
          <div class="kp-label">${L.headerLabel}</div>
          <div class="kp-number">${L.numberSign}${kpNumber}</div>
          <div class="kp-date">${escapeHtml(L.dateLine(data.date))}</div>
        </div>
      </div>
      <div class="accent-bar"></div>

      <div class="content">

        <!-- Title -->
        <div class="title-block">
          <h1>${L.title}</h1>
          <div class="subtitle">${L.subtitle}</div>
        </div>

        <!-- Parties -->
        <div class="parties">
          <div class="party">
            <div class="party-label">${L.supplier}</div>
            <div class="party-name">${companyName}</div>
            <div class="party-detail">
              ${[binIin ? L.bin + binIin : '', address, phone ? L.tel + phone : '', email ? L.email + email : ''].filter(Boolean).join('<br>')}
            </div>
          </div>
          <div class="party client">
            <div class="party-label">${L.buyer}</div>
            <div class="party-name">${escapeHtml(data.clientName)}</div>
            <div class="party-detail">
              ${[
                data.clientBin ? L.bin + escapeHtml(data.clientBin) : '',
                escapeHtml(data.clientAddress || ''),
                data.clientPhone ? L.tel + escapeHtml(data.clientPhone) : '',
                data.clientEmail ? L.email + escapeHtml(data.clientEmail) : '',
              ].filter(Boolean).join('<br>')}
            </div>
          </div>
        </div>

        <!-- Services. Колонка «Код» — только если у позиций есть настоящие коды
             (из справочника услуг в кабинете). Раньше без кода в ней печатался
             номер строки ещё раз — дубль «№» (правка основателя 15.10.2026). -->
        <div class="section-title">${L.itemsTitle}</div>
        <table class="services-table">
          <thead>
            <tr>
              <th style="width:5%">${L.colNo}</th>
              ${hasCodes ? `<th style="width:8%">${L.colCode}</th>` : ''}
              <th class="name" style="width:${hasCodes ? 40 : 48}%">${L.colName}</th>
              <th style="width:10%">${L.colQty}</th>
              <th style="width:8%">${L.colUnit}</th>
              <th style="width:14%">${L.colPrice}</th>
              <th style="width:15%">${L.colSum}</th>
            </tr>
          </thead>
          <tbody>
            ${data.services.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                ${hasCodes ? `<td>${escapeHtml(s.code || '')}</td>` : ''}
                <td class="name">${escapeHtml(s.name)}</td>
                <td>${escapeHtml(s.qty)}</td>
                <td>${escapeHtml(kpUnitLabel(s.unit, lang))}</td>
                <td class="right">${formatMoney(Number(s.price))} ₸</td>
                <td class="right">${formatMoney(s.qty * s.price)} ₸</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-block">
          <div class="totals-inner">
            ${totalsHTML}
          </div>
        </div>

        ${data.note && data.note.trim() ? `
        <!-- Note -->
        <div class="section-title">${L.note}</div>
        <div class="note-block">${escapeHtml(data.note.trim())}</div>
        ` : ''}

        ${b ? `
        <!-- Bank -->
        <div class="section-title">${L.bankTitle}</div>
        <div class="bank-block">
          <div class="bank-grid">
            <div class="bank-item">
              <label>${L.bank}</label>
              <span>${escapeHtml(b.bank_name)}</span>
            </div>
            <div class="bank-item">
              <label>${L.iik}</label>
              <span>${escapeHtml(b.iik)}</span>
            </div>
            <div class="bank-item">
              <label>${L.bik}</label>
              <span>${escapeHtml(b.bik)}</span>
            </div>
            <div class="bank-item">
              <label>${L.kbe}</label>
              <span>${escapeHtml(b.kbe || '19')}</span>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Signature -->
        <div class="signature-block">
          <div class="sig-left">
            <div class="sig-label">${L.signer}</div>
            <div class="sig-line${signatureBase64 || stampBase64 ? ' has-img' : ''}">
              ${signatureBase64 ? `<img src="${signatureBase64}" style="position:absolute; bottom:8px; left:10px; height:45px; max-width:150px; object-fit:contain;">` : ''}
              ${stampBase64 ? `<img src="${stampBase64}" style="position:absolute; bottom:-10px; left:60px; height:90px; width:90px; object-fit:contain; opacity:0.85;">` : ''}
            </div>
            <div class="sig-name">${director ? director : ''}</div>
          </div>
          <div style="width:45%; text-align:right;">
            <div style="font-size:10px; color:#888; margin-bottom:8px;">${L.dateIssued}</div>
            <div style="font-size:12px; font-weight:bold; color:#1C2056;">${kpDate}</div>
            <div style="font-size:10px; color:#888; margin-top:12px;">${L.validUntil}</div>
            <div style="font-size:12px; font-weight:bold; color:#2DC48D;">${validDate}</div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="footer">
        <div>
          <div class="footer-brand">INVOICES.KZ</div>
          <div class="footer-sub">${L.footerSub}</div>
        </div>
        <div class="footer-sub">invoices.kz</div>
      </div>

      <script>
        function downloadPDF() {
          const btn = document.getElementById('dlBtn')
          btn.textContent = '${L.loading}'
          btn.disabled = true
          // Сначала снимок прокрутки (__ikzUnfit), потом прятать панель — иначе
          // страница короче и после скачивания окно не возвращается на место.
          if (window.__ikzUnfit) window.__ikzUnfit()
          const toolbar = document.querySelector('.toolbar')
          const spacer = toolbar?.nextElementSibling
          if (toolbar) toolbar.style.display = 'none'
          if (spacer) spacer.style.display = 'none'
          html2pdf().set({
            margin: 0,
            filename: ${jsString(kpFileName(lang, data.number))},
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          }).from(document.body).save().then(() => {
            if (window.__ikzFit) window.__ikzFit()
            if (toolbar) toolbar.style.display = 'flex'
            if (spacer) spacer.style.display = 'block'
            btn.textContent = '${L.downloadPdf}'
            btn.disabled = false
          })
        }
      <\/script>
    ${docFitScript(794)}
    ${docShareScript(data.showWatermark, { filename: kpFileName(lang, data.number), orientation: 'portrait', text: 'Коммерческое предложение сформировано на invoices.kz: https://invoices.kz/tools/kp?utm_source=share&utm_medium=doc&utm_campaign=kp_share' })}
    </body>
    </html>
  `

  return html
}
