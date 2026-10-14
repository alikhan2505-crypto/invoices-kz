interface AVRService {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
  type?: 'service' | 'product'
}

interface AVRData {
  // Бледный знак INVOICES.KZ фоном — бесплатные /tools (см. docWatermark.ts).
  showWatermark?: boolean
  number: string
  date: string
  contractNumber?: string
  contractDate?: string
  clientName: string
  clientBin?: string
  clientAddress?: string
  clientPhone?: string
  services: AVRService[]
  total: number
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
}

import { resizeToFit } from './imageResize'
import { watermarkCss, watermarkBodyClass } from './docWatermark'
import { escapeHtml, escapeAttr } from './htmlEscape'

export interface AVRImages {
  signature?: string
  stamp?: string
  logo?: string
}

// URL картинки (подпись/печать/логотип) идёт в src="…": пропускаем только
// http(s) и data:image/ (наш же canvas.toDataURL), остальное (javascript:,
// data:text/html и т.п.) отбрасываем, затем экранируем для атрибута.
function safeImageSrc(url: string | undefined): string {
  const u = (url || '').trim()
  if (!u) return ''
  if (!/^(https?:|data:image\/)/i.test(u)) return ''
  return escapeAttr(u)
}

// Значение для вставки внутрь inline-<script>: JSON-строка, из которой нельзя
// выйти ни кавычкой, ни '</script>'.
function jsString(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function formatMoney(n: number): string {
  return escapeHtml(n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

/**
 * Чистая сборка HTML акта (форма Р-1). Возвращает null, если в документе нет
 * услуг (АВР формируется только для услуг). Весь пользовательский текст
 * экранируется — документ открывается на домене invoices.kz.
 */
export function buildAVRHtml(data: AVRData, images: AVRImages = {}): string | null {
  const p = data.profile
  const companyName = escapeHtml(p?.company_name || '')
  const binIin = escapeHtml(p?.bin_iin || '')
  const address = escapeHtml(p?.address || '')
  const phone = escapeHtml(p?.phone || '')
  const director = escapeHtml(p?.director_name || '')

  const signatureBase64 = safeImageSrc(images.signature)
  const stampBase64 = safeImageSrc(images.stamp)
  const logoBase64 = safeImageSrc(images.logo)

  const number = escapeHtml(data.number)
  const date = escapeHtml(data.date)

  const servicesOnly = data.services.filter(s => !s.type || s.type === 'service')

  if (servicesOnly.length === 0) return null

  const totalAmount = servicesOnly.reduce((sum, s) => sum + s.qty * s.price, 0)
  const vatType = data.vatType || 'no_vat'
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(totalAmount / 1.16) : totalAmount
  const vatAmount = vatType === 'vat_16' ? Math.round(totalAmount - totalAmount / 1.16) : 0

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=1123, initial-scale=1.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { background: #888; }
        body {
          font-family: Arial, sans-serif;
          font-size: 10px;
          color: #000;
          width: 1123px;
          margin: 20px auto;
          background: white;
          padding: 20px 30px;
          box-shadow: 0 0 20px rgba(0,0,0,0.3);
        }
        table { border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
        .no-border td, .no-border th { border: none; }
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          html { background: white; }
          body { margin: 0; box-shadow: none; padding: 10mm; width: 100%; }
          .toolbar { display: none !important; }
        }
      ${watermarkCss(data.showWatermark)}
</style>
    </head>
    <body${watermarkBodyClass(data.showWatermark)}>

      <!-- Toolbar -->
      <div class="toolbar" style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:space-between;">
        <button onclick="window.close()" style="background:#f3f4f6; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">← Назад</button>
        <span style="font-size:12px; color:#6b7280; font-weight:600;">АВР №${number}</span>
        <div style="display:flex; gap:6px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
          <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">💾 Скачать PDF</button>
        </div>
      </div>
      <div style="height:50px;"></div>

      ${logoBase64 ? `
      <div style="text-align:center; margin:-6mm 0 6mm;">
        <img src="${logoBase64}" style="max-height:48px; max-width:180px; object-fit:contain; display:block; margin:0 auto;" />
      </div>
      ` : ''}

      <!-- Шапка справа -->
      <div style="display:flex; justify-content:flex-end; margin-bottom:8px;">
        <div style="text-align:center; font-size:9px; line-height:1.5;">
          Приложение 50<br>
          к приказу Министра финансов<br>
          Республики Казахстан<br>
          от 20 декабря 2012 года № 562<br>
          <strong>Форма Р-1</strong>
        </div>
      </div>

      <!-- Заказчик/Исполнитель -->
      <table style="width:100%; margin-bottom:6px; border:none;">
        <colgroup>
          <col style="width:100px;">
          <col style="width:auto;">
          <col style="width:20px;">
          <col style="width:80px;">
          <col style="width:130px;">
        </colgroup>
        <tr>
          <td style="border:none; font-weight:bold; vertical-align:middle;">Заказчик</td>
          <td style="border:none; border-bottom:1px solid #000; padding-right:20px;">${escapeHtml(data.clientName)}${data.clientAddress ? ', ' + escapeHtml(data.clientAddress) : ''}</td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center; font-size:9px;">ИИН/БИН</td>
          <td style="border:1px solid #000; text-align:center;">${escapeHtml(data.clientBin || '')}</td>
        </tr>
        <tr>
          <td style="border:none;"></td>
          <td style="border:none; font-size:8px; color:#666; text-align:center;">полное наименование, адрес, данные о средствах связи</td>
          <td colspan="3" style="border:none;"></td>
        </tr>
        <tr style="height:6px;"><td colspan="5" style="border:none;"></td></tr>
        <tr>
          <td style="border:none; font-weight:bold; vertical-align:middle;">Исполнитель</td>
          <td style="border:none; border-bottom:1px solid #000; padding-right:20px;">${companyName}, ${address}${phone ? ', тел: ' + phone : ''}</td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center; font-size:9px;">ИИН/БИН</td>
          <td style="border:1px solid #000; text-align:center;">${binIin}</td>
        </tr>
        <tr>
          <td style="border:none;"></td>
          <td style="border:none; font-size:8px; color:#666; text-align:center;">полное наименование, адрес, данные о средствах связи</td>
          <td colspan="3" style="border:none;"></td>
        </tr>
        <tr style="height:6px;"><td colspan="5" style="border:none;"></td></tr>
        <tr>
          <td style="border:none; font-weight:bold; vertical-align:top; line-height:1.4;">Договор<br>(контракт)</td>
          <td style="border:none; border-bottom:1px solid #000; padding-right:20px; vertical-align:middle;">${data.contractNumber ? '№' + escapeHtml(data.contractNumber) + (data.contractDate ? ' от ' + escapeHtml(data.contractDate) + ' года' : '') : ''}</td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center; font-size:9px; vertical-align:middle;">Номер<br>документа</td>
          <td style="border:1px solid #000; text-align:center; font-size:9px; vertical-align:middle;">Дата<br>составления</td>
        </tr>
        <tr>
          <td style="border:none;"></td>
          <td style="border:none;"></td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center;">${number}</td>
          <td style="border:1px solid #000; text-align:center;">${new Date().toLocaleDateString('ru-KZ')}</td>
        </tr>
      </table>

      <!-- Заголовок -->
      <div style="text-align:center; font-size:13px; font-weight:bold; text-transform:uppercase; margin:10px 0;">
        АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)
      </div>

      <!-- Таблица услуг -->
      <table style="width:100%; margin-bottom:8px; font-size:9px;">
        <thead>
          <tr>
            <th rowspan="2" style="width:4%; text-align:center;">№<br>п/п</th>
            <th rowspan="2" style="width:28%; text-align:center;">Наименование работ (услуг)<br><span style="font-weight:normal; font-size:8px;">(в разрезе их подвидов в соответствии с технической спецификацией, заданием, графиком выполнения работ (услуг) при их наличии)</span></th>
            <th rowspan="2" style="width:10%; text-align:center;">Дата выполнения работ<br>(оказания услуг)</th>
            <th rowspan="2" style="width:8%; text-align:center;">Сведения об отчёте о научных исследованиях, маркетинговых, консультационных и прочих услугах (дата, номер, количество страниц) (при их наличии)</th>
            <th rowspan="2" style="width:6%; text-align:center;">Единица измерения</th>
            <th colspan="3" style="text-align:center;">Выполнено работ (оказано услуг)</th>
          </tr>
          <tr>
            <th style="width:9%; text-align:center;">количество</th>
            <th style="width:13%; text-align:center;">цена за единицу</th>
            <th style="width:13%; text-align:center;">стоимость</th>
          </tr>
          <tr>
            <th style="text-align:center;">1</th>
            <th style="text-align:center;">2</th>
            <th style="text-align:center;">3</th>
            <th style="text-align:center;">4</th>
            <th style="text-align:center;">5</th>
            <th style="text-align:center;">6</th>
            <th style="text-align:center;">7</th>
            <th style="text-align:center;">8</th>
          </tr>
        </thead>
        <tbody>
          ${servicesOnly.map((s, i) => `
            <tr>
              <td style="text-align:center;">${i + 1}</td>
              <td>${escapeHtml(s.name)}</td>
              <td style="text-align:center;">${date}</td>
              <td style="text-align:center;">—</td>
              <td style="text-align:center;">${escapeHtml(s.unit || 'шт')}</td>
              <td style="text-align:center;">${escapeHtml(s.qty)}</td>
              <td style="text-align:right;">${formatMoney(Number(s.price))}</td>
              <td style="text-align:right;">${formatMoney(s.qty * s.price)}</td>
            </tr>
          `).join('')}
          <tr>
            <td colspan="5" style="text-align:right; font-weight:bold;">Итого</td>
            <td style="text-align:center;">x</td>
            <td style="text-align:center;">x</td>
            <td style="text-align:right; font-weight:bold;">${formatMoney(totalAmount)}</td>
          </tr>
          ${vatType === 'vat_16' ? `
          <tr>
            <td colspan="7" style="text-align:right; font-weight:bold;">В том числе НДС 16%:</td>
            <td style="text-align:right; font-weight:bold;">${formatMoney(vatAmount)}</td>
          </tr>` : ''}
          ${vatType === 'vat_0' ? `
          <tr>
            <td colspan="7" style="text-align:right; font-weight:bold;">НДС 0%:</td>
            <td style="text-align:right; font-weight:bold;">0,00</td>
          </tr>` : ''}
        </tbody>
      </table>

      <!-- Сведения об использовании запасов -->
      <div style="margin-bottom:6px; font-size:9px;">
        Сведения об использовании запасов, полученных от заказчик_______________________
        <span style="font-size:8px; color:#666;">наименование, количество, стоимость</span>
      </div>

      <!-- Приложение -->
      <div style="margin-bottom:12px; font-size:9px; line-height:1.6;">
        Приложение: Перечень документации, в том числе отчёт(ы) о маркетинговых, научных исследованиях, консультационных и прочих услугах (обязательны при их наличии) на _____ страниц
      </div>

      <!-- Подписи -->
      <table style="width:100%; border:none; margin-top:10px;">
        <tr>
          <td style="border:none; width:48%; vertical-align:top;">
            <div style="font-size:9px; margin-bottom:4px; font-weight:bold;">Сдал (Исполнитель)</div>
            <table style="width:100%; border:none;">
              <tr>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px; text-align:center; vertical-align:bottom; position:relative;">
                </td>
                <td style="border:none; width:5%;"></td>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px; text-align:center; vertical-align:bottom; position:relative;">
                  ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height:50px; max-width:90%; object-fit:contain; display:inline-block;">` : ''}
                </td>
                <td style="border:none; width:5%;"></td>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px; text-align:center; vertical-align:bottom;">${director}</td>
              </tr>
              <tr>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">должность</td>
                <td style="border:none;"></td>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">подпись</td>
                <td style="border:none;"></td>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">расшифровка подписи</td>
              </tr>
            </table>
            <div style="font-size:8px; margin-top:6px; display:flex; align-items:flex-start; gap:8px;">
              <div style="font-weight:bold; margin-top:5px;">М.П.</div>
              ${stampBase64 ? `<img src="${stampBase64}" style="height:100px; width:100px; object-fit:contain; opacity:0.85;">` : ''}
            </div>
          </td>
          <td style="border:none; width:4%;"></td>
          <td style="border:none; width:48%; vertical-align:top;">
            <div style="font-size:9px; margin-bottom:4px; font-weight:bold;">Принял (Заказчик)</div>
            <table style="width:100%; border:none;">
              <tr>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px;"></td>
                <td style="border:none; width:5%;"></td>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px;"></td>
                <td style="border:none; width:5%;"></td>
                <td style="border:none; border-bottom:1px solid #000; width:30%; height:60px;"></td>
              </tr>
              <tr>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">должность</td>
                <td style="border:none;"></td>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">подпись</td>
                <td style="border:none;"></td>
                <td style="border:none; text-align:center; font-size:8px; color:#666;">расшифровка подписи</td>
              </tr>
            </table>
            <div style="font-size:8px; margin-top:6px;">
              <div style="font-weight:bold;">М.П.</div>
              <div style="margin-top:12px;">Дата подписания (принятия) работ (услуг): ____________________</div>
            </div>
          </td>
        </tr>
      </table>

      <script>
        function downloadPDF() {
          const btn = document.getElementById('dlBtn')
          btn.textContent = '⏳ Загрузка...'
          btn.disabled = true
          const toolbar = document.querySelector('.toolbar')
          const spacer = toolbar?.nextElementSibling
          if (toolbar) toolbar.style.display = 'none'
          if (spacer) spacer.style.display = 'none'
          html2pdf().set({
            margin: [8, 8, 8, 8],
            filename: ${jsString('АВР-' + String(data.number ?? '') + '.pdf')},
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
          }).from(document.body).save().then(() => {
            if (toolbar) toolbar.style.display = 'flex'
            if (spacer) spacer.style.display = 'block'
            btn.textContent = '💾 Скачать PDF'
            btn.disabled = false
          })
        }
      <\/script>
    </body>
    </html>
  `
  return html
}

export async function generateAVR(data: AVRData, existingWin?: Window | null) {
  const win = existingWin || window.open('', '_blank')

  const p = data.profile
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''
  const logoUrl = p?.logo_url || ''

  const signature = signatureUrl ? await resizeToFit(signatureUrl, 200, 60) : ''
  const stamp = stampUrl ? await resizeToFit(stampUrl, 100, 100) : ''
  const logo = logoUrl ? await resizeToFit(logoUrl, 180, 48) : ''

  const html = buildAVRHtml(data, { signature, stamp, logo })

  if (html === null) {
    alert('В счёте нет услуг. АВР формируется только для услуг.')
    if (win) win.close()
    return
  }

  if (win) {
    win.document.write(html)
    win.document.close()
  }
}