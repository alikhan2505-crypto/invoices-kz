// Экранирование пользовательского текста перед вставкой в HTML-строку
// (печатные формы счетов/актов/накладных собираются шаблонными строками и
// открываются на домене invoices.kz, в том числе на публичной /view/[token]).
// Трогает только & < > " ' — кириллица, «», №, ₸ остаются как есть.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Для значений в атрибутах в кавычках достаточно того же экранирования.
export const escapeAttr = escapeHtml
