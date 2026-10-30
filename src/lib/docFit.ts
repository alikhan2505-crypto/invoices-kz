// Окно готового документа (счёт, АВР, КП, накладная) на телефоне: лист сразу
// во всю ширину экрана (решение основателя 14.10.2026), без прокрутки вбок.
// Мета-тег viewport в окне, открытом через document.write, браузеры
// применяют ненадёжно, поэтому масштаб ставим скриптом через CSS zoom.
// Панель с кнопками компенсируется обратным zoom и остаётся обычного размера.
// Перед «Скачать PDF» масштаб снимается (html2canvas снимает лист 1:1), при
// печати — тоже (правило @media print ниже). На время скачивания у листа
// убираются экранные поля и тень (класс ikz-pdf): html2pdf снимает body вместе
// с margin, и эти 20–40px сверху и снизу выталкивали футер на вторую страницу.
// Заодно прячется полоса прокрутки окна: html2pdf центрирует лист в слое во всю
// ширину окна, а html2canvas снимает копию страницы уже без полосы — лист в PDF
// уезжал вправо на половину её ширины (белая полоса слева, правый край срезан).
// Окно на время снимка прокручивается наверх (иначе лист в PDF сползал вниз на
// величину прокрутки), после — возвращается, где было.
// При печати отступ под панелью кнопок не нужен — панели там нет.
export function docFitScript(docWidthPx: number): string {
  return `
<style>.toolbar button { white-space: nowrap; } @media print { body { zoom: 1 !important; } .toolbar { zoom: 1 !important; } .toolbar + div { display: none !important; } } html.ikz-pdf { overflow: hidden !important; } body.ikz-pdf { margin: 0 !important; box-shadow: none !important; }</style>
<script>
(function () {
  var W = ${Math.round(docWidthPx)} + 8;
  // Макет — по ширине экрана (старый meta «width=794/1123, initial-scale=1»
  // давал широкий макет, обрезанный по экрану), а сам лист ужимаем zoom.
  var meta = document.querySelector('meta[name=viewport]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
  meta.setAttribute('content', 'width=device-width, initial-scale=1');
  function fit() {
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var s = Math.min(1, vw / W);
    document.body.style.zoom = s < 1 ? String(s) : '';
    var tb = document.querySelector('.toolbar');
    if (tb) {
      // Панель и отступ под ней — обычного размера; номер документа на узком
      // экране прячем, чтобы три кнопки уместились в строку.
      tb.style.zoom = s < 1 ? String(1 / s) : '';
      var gap = tb.nextElementSibling;
      if (gap) gap.style.zoom = s < 1 ? String(1 / s) : '';
      var title = tb.querySelector('span');
      if (title) title.style.display = s < 1 && vw < 480 ? 'none' : '';
    }
  }
  var savedScroll = null;
  window.__ikzFit = function () {
    document.documentElement.classList.remove('ikz-pdf');
    document.body.classList.remove('ikz-pdf');
    fit();
    // После того как downloadPDF вернёт панель и отступ под ней — иначе
    // страница ещё короче и прокрутка упирается в низ.
    var back = savedScroll; savedScroll = null;
    if (back) setTimeout(function () { window.scrollTo(back[0], back[1]); }, 0);
  };
  window.__ikzUnfit = function () {
    savedScroll = [window.scrollX, window.scrollY];
    window.scrollTo(0, 0);
    document.documentElement.classList.add('ikz-pdf');
    document.body.classList.add('ikz-pdf');
    document.body.style.zoom = '';
    var tb = document.querySelector('.toolbar');
    if (tb) { tb.style.zoom = ''; if (tb.nextElementSibling) tb.nextElementSibling.style.zoom = ''; }
  };
  fit();
  requestAnimationFrame(fit);
  window.addEventListener('resize', fit);
})();
<\/script>`
}

// «Отправить» на документах бесплатного тарифа (30.10.2026, решение основателя): на телефоне
// PDF уходит клиенту через системное окно «Поделиться» (WhatsApp, Telegram, почта), без
// скачивания и поиска файла в загрузках. Кнопка показывается только там, где браузер умеет
// делиться ФАЙЛАМИ (navigator.canShare({files})): на компьютере её нет, а «Скачать PDF» и
// «Печать» остаются как были. Снимок листа тот же, что у «Скачать PDF» (те же шаги с
// __ikzUnfit/__ikzFit, панель прячется на время снимка), только PDF не сохраняется, а
// собирается в файл для окна «Поделиться». Платные документы без водяного знака не затронуты.
export function docShareButtonHtml(on: boolean | undefined): string {
  if (!on) return ''
  return `<button id="shBtn" onclick="ikzShare()" style="display:none; background:#1C2056; color:white; border:none; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:13px; white-space:nowrap;">📤 Отправить</button>`
}

export function docShareScript(
  on: boolean | undefined,
  opts: { filename: string; orientation: 'portrait' | 'landscape'; text: string },
): string {
  if (!on) return ''
  return `
<script>
(function () {
  var FILE = ${JSON.stringify(opts.filename)};
  var ORIENT = ${JSON.stringify(opts.orientation)};
  var TEXT = ${JSON.stringify(opts.text)};
  function canShareFiles() {
    try {
      if (!navigator.canShare || !navigator.share) return false;
      return navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] });
    } catch (e) { return false; }
  }
  var btn = document.getElementById('shBtn');
  if (btn && canShareFiles()) {
    btn.style.display = '';
    // На узком экране кнопки не помещаются в строку: печать с телефона нужна редко, её убираем.
    if (window.matchMedia && window.matchMedia('(max-width: 479px)').matches) {
      var pr = document.querySelector('.ikz-print');
      if (pr) pr.style.display = 'none';
    }
  }
  window.ikzShare = async function () {
    var b = document.getElementById('shBtn');
    if (!b || b.disabled) return;
    var label = b.textContent;
    b.textContent = '⏳ ...';
    b.disabled = true;
    if (window.__ikzUnfit) window.__ikzUnfit();
    var toolbar = document.querySelector('.toolbar');
    var spacer = toolbar && toolbar.nextElementSibling;
    if (toolbar) toolbar.style.display = 'none';
    if (spacer) spacer.style.display = 'none';
    var blob = null;
    try {
      blob = await html2pdf().set({
        margin: 0,
        filename: FILE,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: ORIENT }
      }).from(document.body).outputPdf('blob');
    } catch (e) { blob = null; }
    if (window.__ikzFit) window.__ikzFit();
    if (toolbar) toolbar.style.display = 'flex';
    if (spacer) spacer.style.display = 'block';
    b.textContent = label;
    b.disabled = false;
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], FILE, { type: 'application/pdf' })], title: FILE, text: TEXT });
    } catch (e) { /* человек закрыл окно «Поделиться» */ }
  };
})();
<\/script>`
}

