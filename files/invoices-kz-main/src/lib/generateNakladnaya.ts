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

export function generateNakladnaya(data: NakladnayaData) {
  const p = data.profile

  const companyName = p?.company_name || 'ИП First Project'
  const binIin = p?.bin_iin || ''
  const address = p?.address || ''
  const phone = p?.phone || ''
  const director = p?.director_name || ''
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''

  function formatMoney(n: number): string {
    return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Фильтруем только товары
  const productsOnly = data.services.filter(s => s.type === 'product')

  // Если нет товаров - показываем предупреждение
  if (productsOnly.length === 0) {
    alert('В счёте нет товаров. Накладная формируется только для товаров.')
    return
  }

  const totalProductsAmount = productsOnly.reduce((sum, s) => sum + s.qty * s.price, 0)

  // НДС расчёт
  const vatType = data.vatType || 'no_vat'
  const totalWithVat = totalProductsAmount
  const vatAmount = vatType === 'vat_16' ? Math.round(totalProductsAmount - totalProductsAmount / 1.16) : 0

  const html = `
    <!DOCTYPE html>
    <html>
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
        .doc-header {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 20px;
          font-size: 10px;
        }
        .doc-header-item {
          border: 1px solid #000;
          padding: 5px 8px;
          text-align: center;
        }
        .doc-header-item strong {
          display: block;
          margin-top: 5px;
        }
        h1 {
          text-align: center;
          font-size: 16px;
          font-weight: bold;
          margin: 20px 0;
          text-transform: uppercase;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
          margin: 20px 0;
          font-size: 10px;
        }
        .info-block {
          line-height: 1.6;
        }
        .info-block strong {
          display: block;
          margin-bottom: 3px;
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
        .summary {
          margin: 20px 0;
          font-size: 10px;
          line-height: 1.8;
        }
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
        <span style="font-size:12px; color:#6b7280; font-weight:600;">Накладная №${data.number}</span>
        <div style="display:flex; gap:6px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
          <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">💾 Скачать PDF</button>
        </div>
      </div>
      <div style="height:55px;"></div>

      <!-- Header -->
      <div class="header-right">
        Приложение 26<br>
        к приказу Министра финансов<br>
        Республики Казахстан<br>
        от 20 декабря 2012 года № 562<br><br>
        <strong>Форма З-2</strong>
      </div>

      <div class="doc-header">
        <div class="doc-header-item">
          Организация (индивидуальный предприниматель)<br>
          <strong>${companyName}</strong>
        </div>
        <div class="doc-header-item">
          ИИН/БИН<br>
          <strong>${binIin}</strong>
        </div>
        <div class="doc-header-item"></div>
      </div>

      <div class="doc-header">
        <div class="doc-header-item" style="grid-column: span 2;"></div>
        <div class="doc-header-item">
          Номер документа<br>
          <strong>${data.number}</strong>
        </div>
        <div class="doc-header-item">
          Дата составления<br>
          <strong>${data.date}</strong>
        </div>
      </div>

      <h1>НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ</h1>

      <div class="info-grid">
        <div class="info-block">
          <strong>Организация (индивидуальный предприниматель) — отправитель:</strong>
          ${companyName}<br>
          ${address}<br>
          ${phone ? 'Тел: ' + phone : ''}
        </div>
        <div class="info-block">
          <strong>Организация (индивидуальный предприниматель) — получатель:</strong>
          ${data.clientName}<br>
          ${data.clientBin ? 'БИН/ИИН: ' + data.clientBin : ''}
        </div>
      </div>

      <!-- Products Table -->
      <table>
        <thead>
          <tr>
            <th style="width: 5%;">№</th>
            <th style="width: 30%;">Наименование, характеристика</th>
            <th style="width: 10%;">Номенкл. номер</th>
            <th style="width: 10%;">Ед. изм.</th>
            <th style="width: 8%;">Кол-во</th>
            <th style="width: 15%;">Цена за ед., KZT</th>
            <th style="width: 15%;">Сумма с НДС, KZT</th>
            <th style="width: 12%;">Сумма НДС, KZT</th>
          </tr>
          <tr>
            <th>1</th>
            <th>2</th>
            <th>3</th>
            <th>4</th>
            <th>5</th>
            <th>6</th>
            <th>7</th>
            <th>8</th>
          </tr>
        </thead>
        <tbody>
          ${productsOnly.map((s, i) => {
            const itemTotal = s.qty * s.price
            const itemVat = vatType === 'vat_16' ? Math.round(itemTotal - itemTotal / 1.16) : 0
            return `
            <tr>
              <td class="center">${i + 1}</td>
              <td>${s.name}</td>
              <td class="center">${s.code || (i + 1)}</td>
              <td class="center">${s.unit || 'шт'}</td>
              <td class="center">${s.qty}</td>
              <td class="right">${formatMoney(Number(s.price))}</td>
              <td class="right">${formatMoney(itemTotal)}</td>
              <td class="right">${formatMoney(itemVat)}</td>
            </tr>
          `}).join('')}
          <tr>
            <td colspan="6" class="right" style="font-weight: bold; background: #f0f0f0;">Итого</td>
            <td class="right" style="font-weight: bold; background: #f0f0f0;">${formatMoney(totalWithVat)}</td>
            <td class="right" style="font-weight: bold; background: #f0f0f0;">${formatMoney(vatAmount)}</td>
          </tr>
        </tbody>
      </table>

      <div class="summary">
        Всего отпущено количество запасов (прописью): ${productsOnly.length} позиций<br>
        на сумму (прописью), в KZT: ${formatMoney(totalWithVat)} ₸
      </div>

      <!-- Signatures -->
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-label">Отпуск разрешил</div>
          <div class="sig-line">
            ${signatureUrl ? `<img src="${signatureUrl}" style="position:absolute; bottom:8px; left:10px; height:45px; max-width:150px; object-fit:contain;">` : ''}
          </div>
          <div class="sig-name">${director || ''}</div>
        </div>
        <div class="sig-block">
          <div class="sig-label">По доверенности выданной</div>
          <div class="sig-line"></div>
          <div class="sig-name"></div>
        </div>
      </div>

      <div class="signatures" style="margin-top: 30px;">
        <div class="sig-block">
          <div class="sig-label">Главный бухгалтер</div>
          <div class="sig-line"></div>
          <div class="sig-name"></div>
          <div style="margin-top: 10px; font-size: 9px;">М.П.</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div class="sig-block">
            <div class="sig-label">Отпустил</div>
            <div class="sig-line"></div>
            <div class="sig-name"></div>
          </div>
          <div class="sig-block">
            <div class="sig-label">Запасы получил</div>
            <div class="sig-line"></div>
            <div class="sig-name"></div>
          </div>
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
            filename: 'Накладная-${data.number}.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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
