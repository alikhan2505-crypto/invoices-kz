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
