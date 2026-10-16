// Код вставки чата для сайта, который продавец копирует к себе на сайт.
// Отдельный файл без серверных зависимостей (widget.ts тянет node:crypto),
// чтобы его могла импортировать клиентская страница настроек.
//
// Только apex: www.invoices.kz отвечает 308-редиректом на любой запрос, и
// браузер не идёт по редиректу на CORS-preflight -- из-за этого виджет
// не мог отправить ни одного сообщения со стороннего сайта (15.10.2026).
// Сам скрипт по www тоже загрузился бы (обычный GET идёт по редиректу),
// но новый код вставки не должен зависеть от этого лишнего прыжка.
export const WIDGET_SCRIPT_URL = 'https://invoices.kz/widget.js'

export function buildWidgetSnippet(widgetKey: string): string {
  return `<script src="${WIDGET_SCRIPT_URL}" data-key="${widgetKey}" async></script>`
}
