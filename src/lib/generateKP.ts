interface KPService {
  name: string
  qty: number
  price: number
  code?: string
  unit?: string
  description?: string
}

interface KPData {
  number: string
  date: string
  validUntil?: string
  clientName: string
  clientBin?: string
  services: KPService[]
  total: number
  note?: string
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
  bank?: {
    bank_name: string
    iik: string
    bik: string
    kbe?: string
  }
}

export function generateKP(data: KPData) {
  const p = data.profile
  const b = data.bank

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

  const validDate = data.validUntil || (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('ru-KZ')
  })()

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
        .content { padding: 30px 40px; }
        .title-block {
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 2px solid #f0f0f0;
        }
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
        .services-table thead th:nth-child(3) { text-align: left; }
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
        .sig-label { font-size: 10px; color: #888; margin-bottom: 40px; }
        .sig-line { position: relative; min-height: 60px; border-bottom: 1px solid #333; }
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
          body { margin: 0; box-shadow: none; }
        }
      </style>
    </head>
    <body>

      <!-- Toolbar -->
      <div class="toolbar" style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <button onclick="window.close()" style="background:#f3f4f6; color:#374151; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">← Назад</button>
        <span style="font-size:12px; color:#6b7280; font-weight:600;">КП №${data.number}</span>
        <div style="display:flex; gap:6px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
          <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">💾 Скачать PDF</button>
        </div>
      </div>
      <div style="height:55px;"></div>

      <!-- Header -->
      <div class="header">
        <div class="header-left">
          <div class="company">${companyName}</div>
          <div class="company-details">
            БИН: ${binIin}<br>
            ${address}<br>
            ${phone ? 'Тел: ' + phone : ''}${phone && email ? ' · ' : ''}${email ? email : ''}
          </div>
        </div>
        <div class="header-right">
          <div class="kp-label">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</div>
          <div class="kp-number">№ ${data.number}</div>
          <div class="kp-date">от ${data.date}</div>
        </div>
      </div>
      <div class="accent-bar"></div>

      <div class="content">

        <!-- Title -->
        <div class="title-block">
          <h1>Коммерческое предложение</h1>
          <div class="subtitle">Уважаемые партнёры, предлагаем вашему вниманию следующие товары и услуги:</div>
        </div>

        <!-- Parties -->
        <div class="parties">
          <div class="party">
            <div class="party-label">Поставщик</div>
            <div class="party-name">${companyName}</div>
            <div class="party-detail">
              БИН: ${binIin}<br>
              ${address}<br>
              ${phone ? 'Тел: ' + phone : ''}
            </div>
          </div>
          <div class="party client">
            <div class="party-label">Покупатель</div>
            <div class="party-name">${data.clientName}</div>
            <div class="party-detail">
              ${data.clientBin ? 'БИН/ИИН: ' + data.clientBin : ''}
            </div>
          </div>
        </div>

        <!-- Services -->
        <div class="section-title">Перечень товаров / услуг</div>
        <table class="services-table">
          <thead>
            <tr>
              <th style="width:5%">№</th>
              <th style="width:8%">Код</th>
              <th style="width:40%">Наименование</th>
              <th style="width:10%">Кол-во</th>
              <th style="width:8%">Ед.</th>
              <th style="width:14%">Цена</th>
              <th style="width:15%">Сумма</th>
            </tr>
          </thead>
          <tbody>
            ${data.services.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${s.code || (i + 1)}</td>
                <td class="name">${s.name}</td>
                <td>${s.qty}</td>
                <td>${s.unit || 'шт'}</td>
                <td class="right">${formatMoney(Number(s.price))} ₸</td>
                <td class="right">${formatMoney(s.qty * s.price)} ₸</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="totals-block">
          <div class="totals-inner">
            <div class="totals-row">
              <label>Итого без НДС:</label>
              <span>${formatMoney(data.total)} ₸</span>
            </div>
            <div class="totals-row">
              <label>НДС:</label>
              <span>0,00 ₸</span>
            </div>
            <div class="totals-row total-final">
              <label>ИТОГО К ОПЛАТЕ:</label>
              <span>${formatMoney(data.total)} ₸</span>
            </div>
          </div>
        </div>

        ${b ? `
        <!-- Bank -->
        <div class="section-title">Банковские реквизиты</div>
        <div class="bank-block">
          <div class="bank-grid">
            <div class="bank-item">
              <label>Банк</label>
              <span>${b.bank_name}</span>
            </div>
            <div class="bank-item">
              <label>ИИК</label>
              <span>${b.iik}</span>
            </div>
            <div class="bank-item">
              <label>БИК</label>
              <span>${b.bik}</span>
            </div>
            <div class="bank-item">
              <label>КБе</label>
              <span>${b.kbe || '19'}</span>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- Signature -->
        <div class="signature-block">
          <div class="sig-left">
            <div class="sig-label">Руководитель / Представитель</div>
            <div class="sig-line">
              ${signatureUrl ? `<img src="${signatureUrl}" style="position:absolute; bottom:8px; left:10px; height:45px; max-width:150px; object-fit:contain;">` : ''}
              ${stampUrl ? `<img src="${stampUrl}" style="position:absolute; bottom:-10px; left:60px; height:90px; width:90px; object-fit:contain; opacity:0.85;">` : ''}
            </div>
            <div class="sig-name">${director ? director : ''}</div>
          </div>
          <div style="width:45%; text-align:right;">
            <div style="font-size:10px; color:#888; margin-bottom:8px;">Дата составления</div>
            <div style="font-size:12px; font-weight:bold; color:#1C2056;">${data.date}</div>
            <div style="font-size:10px; color:#888; margin-top:12px;">Действителен до</div>
            <div style="font-size:12px; font-weight:bold; color:#2DC48D;">${validDate}</div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="footer">
        <div>
          <div class="footer-brand">INVOICES.KZ</div>
          <div class="footer-sub">Профессиональные счета для казахстанского бизнеса</div>
        </div>
        <div class="footer-sub">invoices.kz</div>
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
            margin: 0,
            filename: 'КП-${data.number}.pdf',
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