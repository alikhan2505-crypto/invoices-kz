interface NakladnayaService {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
  type?: 'service' | 'product'
}

interface NakladnayaData {
  number: string
  date: string
  clientName: string
  clientBin?: string
  services: NakladnayaService[]
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
  }
}

async function resizeToFitNakl(url: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ratio = Math.min(maxW / img.width, maxH / img.height)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
}

async function resizeSquareNakl(url: string, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(url)
    img.src = url
  })
}

function numToWordsNakl(n: number): string {
  const ones = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять',
    'десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
    'шестнадцать','семнадцать','восемнадцать','девятнадцать']
  const tens = ['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']
  const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']
  if (n === 0) return 'ноль'
  if (n < 0) return 'минус ' + numToWordsNakl(-n)
  let result = ''
  const millions = Math.floor(n / 1000000)
  const thousands = Math.floor((n % 1000000) / 1000)
  const rest = n % 1000
  if (millions > 0) result += numToWordsNakl(millions) + ' миллионов '
  if (thousands > 0) {
    const tWords = ['','одна тысяча','две тысячи','три тысячи','четыре тысячи','пять тысяч','шесть тысяч','семь тысяч','восемь тысяч','девять тысяч']
    if (thousands < 10) result += tWords[thousands] + ' '
    else result += numToWordsNakl(thousands) + ' тысяч '
  }
  const h = Math.floor(rest / 100)
  const t = Math.floor((rest % 100) / 10)
  const o = rest % 10
  if (h > 0) result += hundreds[h] + ' '
  if (t === 1) result += ones[10 + o] + ' '
  else { if (t > 1) result += tens[t] + ' '; if (o > 0) result += ones[o] + ' ' }
  return result.trim()
}

function countToWords(n: number): string {
  const words = ['ноль','одна','две','три','четыре','пять','шесть','семь','восемь','девять','десять',
    'одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать','двадцать']
  return n <= 20 ? words[n] : String(n)
}

export async function generateNakladnaya(data: NakladnayaData, existingWin?: Window | null) {
  const win = existingWin || window.open('', '_blank')

  const p = data.profile
  const companyName = p?.company_name || ''
  const binIin = p?.bin_iin || ''
  const address = p?.address || ''
  const phone = p?.phone || ''
  const director = p?.director_name || ''
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''

  const signatureBase64 = signatureUrl ? await resizeToFitNakl(signatureUrl, 200, 55) : ''
  const stampBase64 = stampUrl ? await resizeSquareNakl(stampUrl, 110) : ''

  function formatMoney(n: number): string {
    return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const productsOnly = data.services.filter(s => s.type === 'product')

  if (productsOnly.length === 0) {
    alert('В счёте нет товаров. Накладная формируется только для товаров.')
    if (win) win.close()
    return
  }

  const totalAmount = productsOnly.reduce((sum, s) => sum + s.qty * s.price, 0)
  const vatType = data.vatType || 'no_vat'
  const vatAmount = vatType === 'vat_16' ? Math.round(totalAmount - totalAmount / 1.16) : 0
  const countStr = countToWords(productsOnly.length) + ' ' + (productsOnly.length === 1 ? 'позиция' : productsOnly.length < 5 ? 'позиции' : 'позиций')
  const totalStr = numToWordsNakl(Math.floor(totalAmount)) + ' тенге 00 тиын'

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
html { background:#888; }
body {
  font-family: Arial, sans-serif;
  font-size: 9px;
  color: #000;
  width: 1123px;
  margin: 20px auto;
  background: white;
  padding: 15px 25px 20px;
  box-shadow: 0 0 20px rgba(0,0,0,0.3);
  padding: 15px 25px 20px 25px;
  overflow: hidden;
}
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; word-wrap: break-word; }
.nb { border: none; }
@page { size: A4 landscape; margin: 8mm; }
@media print {
  html { background: white; }
  body { margin:0; box-shadow:none; padding:8mm; width:100%; }
  .toolbar { display:none !important; }
}
</style>
</head>
<body>

<!-- Toolbar -->
<div class="toolbar" style="position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e5e7eb;padding:8px 16px;z-index:999;display:flex;align-items:center;justify-content:space-between;">
  <button onclick="window.close()" style="background:#f3f4f6;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">← Назад</button>
  <span style="font-size:11px;color:#6b7280;font-weight:600;">Накладная №${data.number}</span>
  <div style="display:flex;gap:6px;">
    <button onclick="window.print()" style="background:#1C2056;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">🖨️ Печать</button>
    <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:12px;">💾 Скачать PDF</button>
  </div>
</div>
<div style="height:44px;"></div>

<!-- Шапка справа -->
<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
  <div style="text-align:center;font-size:9px;line-height:1.5;">
    Приложение 26<br>
    к приказу Министра финансов<br>
    Республики Казахстан<br>
    от 20 декабря 2012 года № 562<br><br>
    <strong>Форма З-2</strong>
  </div>
</div>

<!-- Организация и ИИН/БИН -->
<table style="margin-bottom:0; border-collapse:collapse;">
  <colgroup>
    <col style="width:180px;">
    <col>
    <col style="width:15px;">
    <col style="width:70px;">
    <col style="width:130px;">
  </colgroup>
  <tr>
    <td style="border:none; font-size:9px; line-height:1.3; vertical-align:top;">
      Организация (индивидуальный предприниматель)
    </td>
    <td style="border:none; border-bottom:1px solid #000;">
      ${companyName}${address ? ', ' + address : ''}${phone ? ', тел: ' + phone : ''}
    </td>
    <td style="border:none;"></td>
    <td style="border:1px solid #000; text-align:center; font-size:9px;">ИИН/БИН</td>
    <td style="border:1px solid #000; text-align:center;">${binIin}</td>
  </tr>
</table>

<!-- Номер и дата — отдельная таблица -->
<table style="margin-bottom:8px;margin-top:6px;">
  <colgroup>
    <col style="width:180px;">
    <col>
    <col style="width:70px;">
    <col style="width:130px;">
  </colgroup>
  <tr>
    <td class="nb"></td>
    <td class="nb"></td>
    <td style="text-align:center;font-size:9px;">Номер</td>
    <td style="text-align:center;font-size:9px;">Дата</td>
  </tr>
  <tr>
    <td class="nb"></td>
    <td class="nb"></td>
    <td style="text-align:center;">${data.number}</td>
    <td style="text-align:center;">${data.date ? new Date(data.date).toLocaleDateString('ru-KZ') : new Date().toLocaleDateString('ru-KZ')}</td>
  </tr>
</table>

<!-- Заголовок -->
<div style="text-align:center;font-size:12px;font-weight:bold;text-transform:uppercase;margin:8px 0;">
  НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ
</div>

<!-- Таблица организаций -->
<table style="margin-bottom:6px;font-size:9px;">
  <tr>
    <td style="text-align:center;width:20%;padding:4px;">Организация (индивидуальный предприниматель) — отправитель</td>
    <td style="text-align:center;width:20%;padding:4px;">Организация (индивидуальный предприниматель) — получатель</td>
    <td style="text-align:center;width:20%;padding:4px;">Ответственный за поставку (Ф.И.О.)</td>
    <td style="text-align:center;width:20%;padding:4px;">Транспортная организация</td>
    <td style="text-align:center;width:20%;padding:4px;">Товарно-транспортная накладная (номер, дата)</td>
  </tr>
  <tr>
    <td style="text-align:center;padding:4px;">${companyName}<br>${binIin ? 'БИН: ' + binIin : ''}</td>
    <td style="text-align:center;padding:4px;">${data.clientName}<br>${data.clientBin ? 'БИН: ' + data.clientBin : ''}</td>
    <td style="text-align:center;padding:4px;">${director}</td>
    <td></td>
    <td></td>
  </tr>
</table>

<!-- Таблица товаров -->
<table style="margin-bottom:6px;font-size:9px;">
  <thead>
    <tr>
      <th rowspan="2" style="width:4%;">Номер по порядку</th>
      <th rowspan="2" style="width:26%;">Наименование, характеристика</th>
      <th rowspan="2" style="width:8%;">Номенкла-турный номер</th>
      <th rowspan="2" style="width:7%;">Единица измерения</th>
      <th colspan="2" style="text-align:center;">Количество</th>
      <th rowspan="2" style="width:12%;">Цена за единицу, в KZT</th>
      <th rowspan="2" style="width:13%;">Сумма с НДС, в KZT</th>
      <th rowspan="2" style="width:11%;">Сумма НДС, в KZT</th>
    </tr>
    <tr>
      <th style="width:8%;">подлежит отпуску</th>
      <th style="width:8%;">отпущено</th>
    </tr>
    <tr>
      <th>1</th><th>2</th><th>3</th><th>4</th>
      <th>5</th><th>6</th><th>7</th><th>8</th><th>9</th>
    </tr>
  </thead>
  <tbody>
    ${productsOnly.map((s, i) => {
      const itemTotal = s.qty * s.price
      const itemVat = vatType === 'vat_16' ? Math.round(itemTotal - itemTotal / 1.16) : 0
      return `<tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${s.name}</td>
        <td style="text-align:center;">${s.code || (i + 1)}</td>
        <td style="text-align:center;">${s.unit || 'шт'}</td>
        <td style="text-align:center;">${s.qty}</td>
        <td style="text-align:center;">${s.qty}</td>
        <td style="text-align:right;">${formatMoney(Number(s.price))}</td>
        <td style="text-align:right;">${formatMoney(itemTotal)}</td>
        <td style="text-align:right;">${formatMoney(itemVat)}</td>
      </tr>`
    }).join('')}
    <tr>
      <td colspan="4" style="text-align:right;font-weight:bold;">Итого</td>
      <td style="text-align:center;">x</td>
      <td style="text-align:center;">x</td>
      <td style="text-align:center;">x</td>
      <td style="text-align:right;font-weight:bold;">${formatMoney(totalAmount)}</td>
      <td style="text-align:right;font-weight:bold;">${formatMoney(vatAmount)}</td>
    </tr>
  </tbody>
</table>

<!-- Всего отпущено -->
<div style="font-size:9px;margin-bottom:8px;line-height:1.8;">
  Всего отпущено количество запасов (прописью): <u>${countStr}</u>
  &nbsp;&nbsp;&nbsp;&nbsp; на сумму (прописью), в KZT: <u>${totalStr}</u>
</div>

<!-- Подписи -->
<table style="border:none;">
  <tr>
    <td class="nb" style="width:48%;vertical-align:top;">

      <!-- Отпуск разрешил -->
      <div style="font-size:9px;font-weight:bold;margin-bottom:3px;">Отпуск разрешил</div>
      <table style="border:none;margin-bottom:10px;">
        <tr>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:55px;text-align:center;vertical-align:bottom;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:55px;text-align:center;vertical-align:bottom;">
            ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height:48px;max-width:95%;object-fit:contain;display:inline-block;">` : ''}
          </td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:38%;height:55px;text-align:center;vertical-align:bottom;font-size:9px;">${director}</td>
        </tr>
        <tr>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">должность</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">подпись</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">расшифровка подписи</td>
        </tr>
      </table>

      <!-- Главный бухгалтер -->
      <div style="font-size:9px;font-weight:bold;margin-bottom:3px;">Главный бухгалтер</div>
      <table style="border:none;margin-bottom:10px;">
        <tr>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:40px;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:40px;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:38%;height:40px;"></td>
        </tr>
        <tr>
          <td class="nb" style="font-size:8px;color:#666;text-align:center;">подпись</td>
          <td class="nb"></td>
          <td class="nb" style="font-size:8px;color:#666;text-align:center;">расшифровка подписи</td>
          <td class="nb"></td>
          <td class="nb"></td>
        </tr>
      </table>

      <!-- М.П. + печать -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:9px;font-weight:bold;">М.П.</div>
        ${stampBase64 ? `<img src="${stampBase64}" style="height:95px;width:95px;object-fit:contain;opacity:0.85;">` : ''}
      </div>

      <!-- Отпустил -->
      <div style="font-size:9px;font-weight:bold;margin-bottom:3px;">Отпустил</div>
      <table style="border:none;">
        <tr>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:55px;text-align:center;vertical-align:bottom;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:55px;text-align:center;vertical-align:bottom;">
            ${signatureBase64 ? `<img src="${signatureBase64}" style="max-height:48px;max-width:95%;object-fit:contain;display:inline-block;">` : ''}
          </td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:38%;height:55px;text-align:center;vertical-align:bottom;font-size:9px;">${director}</td>
        </tr>
        <tr>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">должность</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">подпись</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">расшифровка подписи</td>
        </tr>
      </table>

    </td>
    <td class="nb" style="width:4%;"></td>
    <td class="nb" style="width:48%;vertical-align:top;">

      <!-- По доверенности -->
      <div style="font-size:9px;margin-bottom:6px;">
        <span style="font-weight:bold;">По доверенности</span>
        <div style="border-bottom:1px solid #000;margin-top:3px;height:16px;"></div>
      </div>

      <!-- Выданной -->
      <div style="font-size:9px;margin-bottom:16px;">
        <span style="font-weight:bold;">выданной</span>
        <div style="border-bottom:1px solid #000;margin-top:3px;height:16px;"></div>
      </div>

      <!-- Запасы получил -->
      <div style="font-size:9px;font-weight:bold;margin-bottom:3px;">Запасы получил</div>
      <table style="border:none;">
        <tr>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:40px;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:28%;height:40px;"></td>
          <td class="nb" style="width:3%;"></td>
          <td class="nb" style="border-bottom:1px solid #000 !important;width:38%;height:40px;"></td>
        </tr>
        <tr>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">должность</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">подпись</td>
          <td class="nb"></td>
          <td class="nb" style="text-align:center;font-size:8px;color:#666;">расшифровка подписи</td>
        </tr>
      </table>

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
    margin: 0,
    filename: 'Накладная-${data.number}.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 1123, scrollX: 0, scrollY: 0, x: 0, y: 0 },
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
</html>`

  if (win) {
    win.document.write(html)
    win.document.close()
  }
}