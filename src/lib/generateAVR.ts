interface AVRService {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
  type?: 'service' | 'product'
}

interface AVRData {
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
  }
}

export function generateAVR(data: AVRData) {
  const p = data.profile

  const companyName = p?.company_name || 'ИП First Project'
  const binIin = p?.bin_iin || ''
  const address = p?.address || ''
  const phone = p?.phone || ''
  const email = p?.email || ''
  const director = p?.director_name || ''
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''

  function formatMoney(n: number): string {
    return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Фильтруем только услуги
  const servicesOnly = data.services.filter(s => !s.type || s.type === 'service')

  // Если нет услуг - показываем предупреждение
  if (servicesOnly.length === 0) {
    alert('В счёте нет услуг. Акт выполненных работ формируется только для услуг.')
    return
  }

  const totalServicesAmount = servicesOnly.reduce((sum, s) => sum + s.qty * s.price, 0)

  // НДС расчёт
  const vatType = data.vatType || 'no_vat'
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(totalServicesAmount / 1.16) : totalServicesAmount
  const vatAmount = vatType === 'vat_16' ? Math.round(totalServicesAmount - totalServicesAmount / 1.16) : 0

  let totalsHTML = ''
  if (vatType === 'vat_16') {
    totalsHTML = `
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">Итого без НДС:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">${formatMoney(totalWithoutVat)} ₸</td>
      </tr>
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">НДС 16%:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">${formatMoney(vatAmount)} ₸</td>
      </tr>
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #000;">ИТОГО:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #000;">${formatMoney(totalServicesAmount)} ₸</td>
      </tr>
    `
  } else if (vatType === 'vat_0') {
    totalsHTML = `
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">Итого:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">${formatMoney(totalServicesAmount)} ₸</td>
      </tr>
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">НДС 0%:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; border: 1px solid #000;">0,00 ₸</td>
      </tr>
    `
  } else {
    totalsHTML = `
      <tr>
        <td colspan="6" style="text-align: right; padding: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #000;">ИТОГО:</td>
        <td style="text-align: right; padding: 8px; font-weight: bold; background: #f0f0f0; border: 1px solid #000;">${formatMoney(totalServicesAmount)} ₸</td>
      </tr>
    `
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=1123, initial-scale=1.0, maximum-scale=1.0">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-text-size-adjust: 100%; }
        html { background: #888; }
        body {
          font-family: Arial, sans-serif;
          font-size: 11px;
          color: #1a1a1a;
          width: 1123px;
          min-height: 794px;
          margin: 20px auto;
          background: white;
          box-shadow: 0 0 20px rgba(0,0,0,0.3);
          padding: 40px;
        }
        .header-right {
          text-align: right;
          font-size: 10px;
          margin-bottom: 20px;
          color: #666;
        }
        h1 {
          text-align: center;
          font-size: 16px;
          font-weight: bold;
          margin: 20px 0;
          text-transform: uppercase;
        }
        .parties {
          margin: 20px 0;
          font-size: 10px;
          line-height: 1.6;
        }
        .parties-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .party strong { font-weight: bold; }
        .contract-info {
          margin: 15px 0;
          font-size: 11px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 10px;
        }
        th {
          background: #f0f0f0;
          border: 1px solid #000;
          padding: 6px 4px;
          text-align: center;
          font-weight: bold;
          font-size: 9px;
        }
        td {
          border: 1px solid #000;
          padding: 6px 4px;
          vertical-align: top;
        }
        td.center { text-align: center; }
        td.right { text-align: right; }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 40px;
        }
        .sig-block {
          position: relative;
        }
        .sig-label {
          font-size: 10px;
          margin-bottom: 40px;
        }
        .sig-line {
          position: relative;
          min-height: 60px;
          border-bottom: 1px solid #333;
          margin-bottom: 5px;
        }
        .sig-name {
          font-size: 10px;
          color: #333;
        }
        @media print {
          .toolbar { display: none !important; }
          html { background: white; }
          body { margin: 0; box-shadow: none; }
        }
      </style>
    </head>
    <body>

      <!-- Toolbar -->
      <div class="toolbar" style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <button onclick="window.close()" style="background:#f3f4f6; color:#374151; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">← Назад</button>
        <span style="font-size:12px; color:#6b7280; font-weight:600;">АВР №${data.number}</span>
        <div style="display:flex; gap:6px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
          <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">💾 Скачать PDF</button>
        </div>
      </div>
      <div style="height:55px;"></div>

      <!-- Header -->
      <div class="header-right">
        Приложение 50<br>
        к приказу Министра финансов<br>
        Республики Казахстан<br>
        от 20 декабря 2012 года № 562<br><br>
        <strong>Форма Р-1</strong>
      </div>

      <div style="margin-bottom: 20px; font-size: 10px;">
        <table style="border: none;">
          <tr>
            <td style="border: none; width: 120px; padding: 4px 0;">Заказчик</td>
            <td style="border: none; padding: 4px 0;"><strong>${data.clientName}</strong></td>
            <td style="border: 1px solid #000; width: 100px; text-align: center;">ИИН/БИН</td>
            <td style="border: 1px solid #000; text-align: center;">${data.clientBin || ''}</td>
          </tr>
          <tr>
            <td style="border: none; padding: 4px 0;"></td>
            <td style="border: none; padding: 4px 0; font-size: 9px; color: #666;">${data.clientAddress || ''}</td>
            <td colspan="2" style="border: none;"></td>
          </tr>
          <tr style="height: 10px;"><td colspan="4" style="border: none;"></td></tr>
          <tr>
            <td style="border: none; padding: 4px 0;">Исполнитель</td>
            <td style="border: none; padding: 4px 0;"><strong>${companyName}</strong></td>
            <td style="border: 1px solid #000; text-align: center;">ИИН/БИН</td>
            <td style="border: 1px solid #000; text-align: center;">${binIin}</td>
          </tr>
          <tr>
            <td style="border: none; padding: 4px 0;"></td>
            <td style="border: none; padding: 4px 0; font-size: 9px; color: #666;">${address}${phone ? ', Тел: ' + phone : ''}</td>
            <td colspan="2" style="border: none;"></td>
          </tr>
        </table>
      </div>

      <div class="contract-info">
        <table style="border: none;">
          <tr>
            <td style="border: none; width: 150px; padding: 4px 0;">Договор (контракт)</td>
            <td style="border: 1px solid #000; width: 200px; text-align: center; padding: 4px;">
              Номер документа<br>
              <strong>${data.contractNumber || data.number}</strong>
            </td>
            <td style="border: 1px solid #000; width: 200px; text-align: center; padding: 4px;">
              Дата составления<br>
              <strong>${data.contractDate || data.date}</strong>
            </td>
          </tr>
        </table>
      </div>

      <h1>АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)</h1>

      <!-- Services Table -->
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">№</th>
            <th style="width: 35%;">Наименование работ (услуг)</th>
            <th style="width: 12%;">Дата выполнения</th>
            <th style="width: 8%;">Ед. изм.</th>
            <th style="width: 10%;">Кол-во</th>
            <th style="width: 15%;">Цена</th>
            <th style="width: 15%;">Стоимость</th>
          </tr>
          <tr>
            <th>1</th>
            <th>2</th>
            <th>3</th>
            <th>4</th>
            <th>5</th>
            <th>6</th>
            <th>7</th>
          </tr>
        </thead>
        <tbody>
          ${servicesOnly.map((s, i) => `
            <tr>
              <td class="center">${i + 1}</td>
              <td>${s.name}</td>
              <td class="center">${data.date}</td>
              <td class="center">${s.unit || 'шт'}</td>
              <td class="center">${s.qty}</td>
              <td class="right">${formatMoney(Number(s.price))} ₸</td>
              <td class="right">${formatMoney(s.qty * s.price)} ₸</td>
            </tr>
          `).join('')}
          ${totalsHTML}
        </tbody>
      </table>

      <!-- Signatures -->
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-label">Сдал (Исполнитель)</div>
          <div class="sig-line">
            ${signatureUrl ? `<img src="${signatureUrl}" style="position:absolute; bottom:8px; left:10px; height:45px; max-width:150px; object-fit:contain;">` : ''}
            ${stampUrl ? `<img src="${stampUrl}" style="position:absolute; bottom:-10px; left:60px; height:90px; width:90px; object-fit:contain; opacity:0.85;">` : ''}
          </div>
          <div class="sig-name">${director || ''}</div>
          <div style="margin-top: 10px; font-size: 9px;">М.П.</div>
        </div>
        <div class="sig-block">
          <div class="sig-label">Принял (Заказчик)</div>
          <div class="sig-line"></div>
          <div class="sig-name"></div>
          <div style="margin-top: 10px; font-size: 9px;">Дата подписания (принятия) работ (услуг): ${data.date}</div>
        </div>
      </div>

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
            margin: [10, 10, 10, 10],
            filename: 'АВР-${data.number}.pdf',
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

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}
