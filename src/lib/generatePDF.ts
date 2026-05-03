interface Service {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
}

interface ProfileData {
  company_name: string
  bin_iin: string
  address: string
  director_name: string
  phone?: string
  bank_name?: string
  iik?: string
  bik?: string
  kbe?: string
  signature_url?: string
  stamp_url?: string
}

interface BankData {
  bank_name: string
  iik: string
  bik: string
  kbe?: string
}

interface InvoiceData {
  number: string
  date: string
  clientName: string
  clientBin: string
  clientEmail: string
  clientAddress?: string
  services: Service[]
  total: number
  note?: string
  profile?: ProfileData
  bank?: BankData
  knp?: string
  autoPrint?: boolean
}

function numberToWords(n: number): string {
  const ones = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять',
    'десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
    'шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const tens = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']
  const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']

  if (n === 0) return 'ноль'
  if (n < 0) return 'минус ' + numberToWords(-n)

  let result = ''
  const th = Math.floor(n / 1000)
  const rest = n % 1000

  if (th > 0 && th < 10) {
    const tWords = ['','одна тысяча','две тысячи','три тысячи','четыре тысячи','пять тысяч','шесть тысяч','семь тысяч','восемь тысяч','девять тысяч']
    result += tWords[th] + ' '
  } else if (th >= 10) {
    result += numberToWords(th) + ' тысяч '
  }

  const h = Math.floor(rest / 100)
  const t = Math.floor((rest % 100) / 10)
  const o = rest % 10

  if (h > 0) result += hundreds[h] + ' '
  if (t === 1) result += ones[10 + o] + ' '
  else {
    if (t > 1) result += tens[t] + ' '
    if (o > 0) result += ones[o] + ' '
  }

  return result.trim()
}

export function generateInvoicePDF(data: InvoiceData) {
  const p = data.profile
  const b = data.bank

  const companyName = p?.company_name || 'ИП First Project'
  const binIin = p?.bin_iin || '890525350143'
  const address = p?.address || 'г. Астана'
  const phone = p?.phone || ''
  const director = p?.director_name || ''
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''

  const bankName = b?.bank_name || p?.bank_name || '—'
  const iik = b?.iik || p?.iik || '—'
  const bik = b?.bik || p?.bik || '—'
  const kbe = b?.kbe || p?.kbe || '19'

  function formatMoney(n: number): string {
    return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',')
  }

  const totalWords = numberToWords(Math.floor(data.total)) + ' тенге 00 тиын'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=794, initial-scale=1.0, maximum-scale=1.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        html { background: #888; }
        body {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #000;
          width: 794px;
          min-height: 1123px;
          margin: 20px auto;
          background: white;
          padding: 25mm 15mm 20mm;
          box-shadow: 0 0 20px rgba(0,0,0,0.3);
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        .notice { font-size: 9px; text-align: center; margin-bottom: 16px; line-height: 1.5; }
        .bank-label { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
        .bank-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .bank-table td { border: 1px solid #000; padding: 5px 8px; vertical-align: top; }
        .title { font-size: 14px; font-weight: bold; margin: 16px 0 10px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .items-table th, .items-table td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
        .items-table th { background: #f0f0f0; font-weight: bold; }
        .items-table td.left { text-align: left; }
        .totals { text-align: right; margin: 4px 0; line-height: 1.8; }
        .total-words { margin: 10px 0; font-weight: bold; line-height: 1.6; }
        .note { margin: 10px 0; font-size: 11px; color: #333; }
        hr { border: none; border-top: 1px solid #000; margin: 16px 0; }
        .toolbar { display: none; }
        @page { size: A4; margin: 0; }
        @media print {
          html { background: white; }
          body { margin: 0; box-shadow: none; padding: 15mm; }
          .toolbar { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="notice">
        Внимание! Оплата данного счета означает согласие с условиями поставки товара.<br>
        Уведомление об оплате обязательно, в противном случае не гарантируется наличие товара на складе.<br>
        Товар отпускается по факту прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и документов удостоверяющих личность.
      </div>

      <div class="bank-label">Образец платежного поручения</div>
      <table class="bank-table">
        <tr>
          <td style="width:45%">
            <b>Бенефициар:</b><br>
            ${companyName}<br>
            БИН: ${binIin}
          </td>
          <td style="width:35%;text-align:center">
            <b>ИИК</b><br><br>${iik}
          </td>
          <td style="width:20%;text-align:center"><b>КБе</b><br><br>${kbe}</td>
        </tr>
        <tr>
          <td><b>Банк бенефициара:</b><br>${bankName}</td>
          <td style="text-align:center"><b>БИК</b><br><br>${bik}</td>
          <td style="text-align:center"><b>Код назначения платежа</b><br>${data.knp || '849'}</td>
        </tr>
      </table>

      <div class="title">Счет на оплату №${data.number} от ${data.date}</div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">
        <tr>
          <td style="font-weight:bold; width:90px; vertical-align:top; padding:3px 0;">Поставщик:</td>
          <td style="padding:3px 0;">${companyName}, ${address}${phone ? ', тел: ' + phone : ''}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; vertical-align:top; padding:3px 0;">Покупатель:</td>
          <td style="padding:3px 0;">${data.clientBin ? 'ИИН/БИН: ' + data.clientBin + ', ' : ''}${data.clientName}${data.clientAddress ? ', ' + data.clientAddress : ''}</td>
        </tr>
        <tr>
          <td style="font-weight:bold; vertical-align:top; padding:3px 0;">Договор:</td>
          <td style="padding:3px 0;">—</td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:5%">№</th>
            <th style="width:8%">Код</th>
            <th style="width:37%">Наименование</th>
            <th style="width:10%">Кол-во</th>
            <th style="width:8%">Ед.</th>
            <th style="width:16%">Цена</th>
            <th style="width:16%">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${data.services.map((s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${s.code || (i + 1)}</td>
              <td class="left">${s.name}</td>
              <td>${s.qty}</td>
              <td>${s.unit || 'шт'}</td>
              <td style="text-align:right">${formatMoney(Number(s.price))}</td>
              <td style="text-align:right">${formatMoney(s.qty * s.price)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        Итого: ${formatMoney(data.total)}<br>
        В том числе НДС: 0.00
      </div>

      <div class="total-words">
        Всего наименований ${data.services.length}, на сумму ${formatMoney(data.total)} KZT<br>
        Всего к оплате: ${totalWords}
      </div>

      ${data.note ? `<div class="note"><b>Примечание:</b> ${data.note}</div>` : ''}

      <hr>
      <div style="position:relative; margin-top:20px; min-height:110px;">
        <div style="display:flex; align-items:flex-end; gap:8px; width:50%;">
          <span>Руководитель</span>
          <div style="position:relative; flex:1;">
            ${signatureUrl ? `
              <img src="${signatureUrl}"
                style="position:absolute; bottom:4px; left:25%; height:45px; max-width:160px; object-fit:contain;"
              />
            ` : ''}
            <div style="border-bottom:1px solid #000; width:100%; margin-top:50px;"></div>
          </div>
          <span>${director ? '/ ' + director : '//'}</span>
        </div>
        ${stampUrl ? `
          <img src="${stampUrl}"
            style="position:absolute; left:30%; bottom:-15px; height:110px; width:110px; object-fit:contain; opacity:0.85;"
          />
        ` : ''}
      </div>

      ${data.autoPrint !== false ? `
        <div class="toolbar" style="position:fixed; top:10px; right:10px; z-index:999; display:flex; gap:8px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
        </div>
        <script>
          window.onload = function() {
            const images = document.querySelectorAll('img')
            if (images.length === 0) { window.print(); return }
            let loaded = 0
            images.forEach(img => {
              if (img.complete) { loaded++; if (loaded === images.length) window.print() }
              else {
                img.onload = () => { loaded++; if (loaded === images.length) window.print() }
                img.onerror = () => { loaded++; if (loaded === images.length) window.print() }
              }
            })
          }
        <\/script>
      ` : `
        <div style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <button onclick="window.close()" style="background:#f3f4f6; color:#374151; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; white-space:nowrap;">← Назад</button>
          <span style="font-size:12px; color:#6b7280; font-weight:600; flex:1; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Счёт №${data.number}</span>
          <div style="display:flex; gap:6px; flex-shrink:0;">
            <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; white-space:nowrap;">🖨️ Печать</button>
            <button id="downloadBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; white-space:nowrap;">💾 Скачать PDF</button>
          </div>
        </div>
        <div style="height:55px;"></div>
        <script>
          function downloadPDF() {
            const btn = document.getElementById('downloadBtn')
            btn.textContent = '⏳ Загрузка...'
            btn.disabled = true
            const toolbar = btn.closest('div[style*="position:fixed"]')
            if (toolbar) toolbar.style.display = 'none'
            const opt = {
              margin: 0,
              filename: 'Счёт-${data.number}.pdf',
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, logging: false },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }
            html2pdf().set(opt).from(document.body).save().then(() => {
              if (toolbar) toolbar.style.display = 'flex'
              btn.textContent = '💾 Скачать PDF'
              btn.disabled = false
            })
          }
        <\/script>
      `}
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}