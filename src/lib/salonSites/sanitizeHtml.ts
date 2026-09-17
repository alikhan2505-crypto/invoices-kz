// Лендинг пишет модель, а отдаём мы его с поддомена invoices.kz — то есть в
// том же родительском домене, где живут сессии пользователей. Настоящая
// граница здесь — заголовок CSP в src/app/s/[slug]/route.ts (`script-src
// 'none'`): он выключает скрипты, даже если разметка их протащила. Эта
// функция — второй слой: она убирает то, что не должно доехать до браузера
// вообще, и заодно оставляет в базе чистый HTML.
const STRIPPED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base']

export function sanitizeLandingHtml(raw: string): string {
  let html = raw

  // <meta> целиком вырезать нельзя: без viewport лендинг перестаёт быть
  // мобильным, а половина клиентов салона открывает его с телефона. Убираем
  // только http-equiv -- там живёт refresh, то есть редирект посетителя.
  html = html.replace(/<meta\b[^>]*\bhttp-equiv\b[^>]*>/gi, '')

  for (const tag of STRIPPED_TAGS) {
    // Парные теги вместе с содержимым.
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
    // Одиночные и незакрытые.
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '')
  }

  // Обработчики событий: onclick=, onload=, on-что-угодно — в кавычках или без.
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')

  // javascript:-ссылки в href/src.
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')

  return html.trim()
}

// Модель почти всегда возвращает документ в ```html-заборе; иногда добавляет
// строку-другую пояснения до или после. Берём то, что между <!DOCTYPE/<html и
// концом документа.
export function extractHtmlDocument(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1] : text

  const start = body.search(/<!DOCTYPE html|<html\b/i)
  if (start === -1) return body.trim()

  const end = body.toLowerCase().lastIndexOf('</html>')
  return (end === -1 ? body.slice(start) : body.slice(start, end + '</html>'.length)).trim()
}
