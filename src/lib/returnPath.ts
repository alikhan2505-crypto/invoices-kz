// Куда вернуть человека после того, как он заполнил то, без чего /create не
// выпускает счёт (реквизиты, банковский счёт).
//
// /create отправляет на /profile/requisites и /profile/banks с ?next=/create,
// а эти страницы после сохранения возвращают обратно — туда, где лежит
// припаркованный черновик счёта. Раньше после сохранения человек попадал в
// /profile и должен был сам догадаться вернуться к счёту.
//
// Разрешён ровно один адрес, сравнение строгое: никаких «начинается с /»,
// иначе ?next=//evil.example увёл бы со страницы реквизитов на чужой сайт.

export const ALLOWED_RETURN_PATHS = ['/create'] as const
export type ReturnPath = (typeof ALLOWED_RETURN_PATHS)[number]

/** Значение ?next=, если оно из белого списка; иначе null. */
export function safeReturnPath(raw: string | null | undefined): ReturnPath | null {
  if (typeof raw !== 'string') return null
  return (ALLOWED_RETURN_PATHS as readonly string[]).includes(raw) ? (raw as ReturnPath) : null
}

/** ?next= из строки адреса (window.location.search). */
export function returnPathFromSearch(search: string): ReturnPath | null {
  try {
    return safeReturnPath(new URLSearchParams(search).get('next'))
  } catch {
    return null
  }
}

/** `/profile/requisites` + `/create` → `/profile/requisites?next=%2Fcreate`. */
export function withReturnPath(href: string, next: ReturnPath): string {
  return `${href}${href.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`
}
