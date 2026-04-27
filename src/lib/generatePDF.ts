interface Service {
  name: string
  qty: number
  price: number
}

interface ProfileData {
  company_name: string
  bin_iin: string
  address: string
  phone: string
  bank_name: string
  iik: string
  bik: string
  kbe: string
  director_name: string
}

interface InvoiceData {
  number: string
  date: string
  clientName: string
  clientBin: string
  clientEmail: string
  services: Service[]
  total: number
  profile?: ProfileData
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
  const companyName = p?.company_name || 'ИП First Project'
  const binIin = p?.bin_iin || '890525350143'
  const address = p?.address || 'г. Астана, ул. Ш.Косшыгулулы 25-153'
  const phone = p?.phone || '+7 776 355 51 77'
  const bankName = p?.bank_name || '—'
  const iik = p?.iik || 'KZ__________________________'
  const bik = p?.bik || '—'
  const kbe = p?.kbe || '19'
  const director = p?.director_name || ''

  const totalWords = numberToWords(Math.floor(data.total)) + ' тенге 00 тиын'

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
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
        }
        .notice { font-size: 9px; text-align: center; margin-bottom: 16px; line-height: 1.5; }
        .bank-label { font-weight: bold; font-size: 10px; margin-bottom: 4px; }
        .bank-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        .bank-table td { border: 1px solid #000; padding: 5px 8px; vertical-align: top; }
        .title { font-size: 14px; font-weight: bold; margin: 16px 0 10px; }
        .info-row { margin-bottom: 6px; }
        .info-row b { margin-right: 6px; }
        .items-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .items-table th, .items-table td { border: 1px solid #000; padding: 4px 6px; text-align: center; }
        .items-table th { background: #f0f0f0; font-weight: bold; }
        .items-table td.left { text-align: left; }
        .totals { text-align: right; margin: 4px 0; line-height: 1.8; }
        .total-words { margin: 10px 0; font-weight: bold; line-height: 1.6; }
        hr { border: none; border-top: 1px solid #000; margin: 16px 0; }
        .signature { margin-top: 20px; }
        .sig-line { display: inline-block; border-bottom: 1px solid #000; width: 220px; margin: 0 8px; }
        @page { size: A4; margin: 0; }
        @media print {
          html { background: white; }
          body { margin: 0; box-shadow: none; padding: 15mm; }
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
          <td style="width:35%;text-align:center"><b>ИИК</b><br><br>${iik}</td>
          <td style="width:20%;text-align:center"><b>КБе</b><br><br>${kbe}</td>
        </tr>
        <tr>
          <td><b>Банк бенефициара:</b><br>${bankName}</td>
          <td style="text-align:center"><b>БИК</b><br>${bik}</td>
          <td style="text-align:center"><b>Код назначения платежа</b><br>—</td>
        </tr>
      </table>

      <div class="title">Счет на оплату №${data.number} от ${data.date}</div>

      <div class="info-row"><b>Поставщик:</b> ${companyName}, ${address}${phone ? ', тел: ' + phone : ''}</div>
      <div class="info-row"><b>Покупатель:</b> ${data.clientBin ? 'ИИН/БИН: ' + data.clientBin + ', ' : ''}${data.clientName}</div>
      <div class="info-row"><b>Договор:</b> —</div>

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
              <td>${i + 1}</td>
              <td class="left">${s.name}</td>
              <td>${s.qty}</td>
              <td>шт</td>
              <td>${Number(s.price).toLocaleString('ru-KZ')}</td>
              <td>${(s.qty * s.price).toLocaleString('ru-KZ')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        Итого: ${data.total.toLocaleString('ru-KZ')}<br>
        В том числе НДС: 0.00
      </div>

      <div class="total-words">
        Всего наименований ${data.services.length}, на сумму ${data.total.toLocaleString('ru-KZ')} KZT<br>
        Всего к оплате: ${totalWords}
      </div>

      <hr>
      <div class="signature">
        Руководитель <span class="sig-line"></span> ${director ? '/ ' + director : '//'}
      </div>

      <script>window.onload = () => window.print()</script>
    </body>
    </html>
  `

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}