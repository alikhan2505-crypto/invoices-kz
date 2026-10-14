// Бледный водяной знак INVOICES.KZ на документах с бесплатного тарифа и из
// бесплатных /tools (решение основателя 14.10.2026, вариант «бледный логотип
// фоном»). Плитка SVG фоном <body>: одинаково ложится на экран, на печать
// (каждая страница — print-color-adjust: exact, иначе Chrome не печатает фон)
// и в html2pdf (html2canvas рисует фоны). Таблицы со своей заливкой знак
// перекрывают — так и задумано, текст документа всегда читается.
const TILE_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="300" viewBox="0 0 460 300">` +
  `<text x="230" y="160" text-anchor="middle" transform="rotate(-28 230 150)" ` +
  `font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="46" letter-spacing="6" ` +
  `fill="rgba(28,32,86,0.07)">INVOICES.KZ</text></svg>`

const TILE_URL = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(TILE_SVG)}")`

/** CSS-правило; подключать в <style> документа, а на <body> ставить class="ikz-wm". */
export const WATERMARK_CSS =
  `body.ikz-wm { background-image: ${TILE_URL}; background-repeat: repeat; ` +
  `-webkit-print-color-adjust: exact; print-color-adjust: exact; }`

export function watermarkCss(on: boolean | undefined): string {
  return on ? WATERMARK_CSS : ''
}

export function watermarkBodyClass(on: boolean | undefined): string {
  return on ? ' class="ikz-wm"' : ''
}
