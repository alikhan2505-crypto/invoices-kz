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

async function resizeToFit(url: string, maxW: number, maxH: number): Promise<string> {
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

async function resizeSquare(url: string, size: number): Promise<string> {
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

export async function generateAVR(data: AVRData) {
  // Открываем окно ДО async операций — иначе iOS блокирует
  const win = window.open('', '_blank')

  const p = data.profile
  const companyName = p?.company_name || ''
  const binIin = p?.bin_iin || ''
  const address = p?.address || ''
  const phone = p?.phone || ''
  const director = p?.director_name || ''
  const signatureUrl = p?.signature_url || ''
  const stampUrl = p?.stamp_url || ''

  const signatureBase64 = signatureUrl ? await resizeToFit(signatureUrl, 200, 60) : ''
  const stampBase64 = stampUrl ? await resizeSquare(stampUrl, 100) : ''

  function formatMoney(n: number): string {
    return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const servicesOnly = data.services.filter(s => !s.type || s.type === 'service')

  if (servicesOnly.length === 0) {
    alert('В счёте нет услуг. АВР формируется только для услуг.')
    if (win) win.close()
    return
  }

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
      </style>
    </head>
    <body>

      <!-- Toolbar -->
      <div class="toolbar" style="position:fixed; top:0; left:0; right:0; background:white; border-bottom:1px solid #e5e7eb; padding:10px 16px; z-index:999; display:flex; align-items:center; justify-content:space-between;">
        <button onclick="window.close()" style="background:#f3f4f6; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">← Назад</button>
        <span style="font-size:12px; color:#6b7280; font-weight:600;">АВР №${data.number}</span>
        <div style="display:flex; gap:6px;">
          <button onclick="window.print()" style="background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">🖨️ Печать</button>
          <button id="dlBtn" onclick="downloadPDF()" style="background:#2DC48D; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px;">💾 Скачать PDF</button>
        </div>
      </div>
      <div style="height:50px;"></div>

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
          <td style="border:none; border-bottom:1px solid #000; padding-right:20px;">${data.clientName}${data.clientAddress ? ', ' + data.clientAddress : ''}</td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center; font-size:9px;">ИИН/БИН</td>
          <td style="border:1px solid #000; text-align:center;">${data.clientBin || ''}</td>
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
          <td style="border:none; border-bottom:1px solid #000; padding-right:20px; vertical-align:middle;">${data.contractNumber ? '№' + data.contractNumber + (data.contractDate ? ' от ' + data.contractDate + ' года' : '') : ''}</td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center; font-size:9px; vertical-align:middle;">Номер<br>документа</td>
          <td style="border:1px solid #000; text-align:center; font-size:9px; vertical-align:middle;">Дата<br>составления</td>
        </tr>
        <tr>
          <td style="border:none;"></td>
          <td style="border:none;"></td>
          <td style="border:none;"></td>
          <td style="border:1px solid #000; text-align:center;">${data.number}</td>
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
              <td>${s.name}</td>
              <td style="text-align:center;">${data.date}</td>
              <td style="text-align:center;">—</td>
              <td style="text-align:center;">${s.unit || 'шт'}</td>
              <td style="text-align:center;">${s.qty}</td>
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
              ${stampBase64 ? `<img src="${stampBase64}" style="height:50px; width:50px; object-fit:contain; opacity:0.85; margin-top:2px;">` : ''}
              <div>М.П.</div>
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
              М.П.<br>
              <span style="margin-top:4px; display:block;">
                Дата подписания (принятия) работ (услуг): ____________________
              </span>
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

  if (win) {
    win.document.write(html)
    win.document.close()
  }
}