// Левое меню Kaspi Bot: что видно сразу, а что в свёрнутой группе «Ещё» (решение основателя D1, 16.11.2026).
// Чистая функция без React, чтобы правила проверялись тестами.
//
// Правила:
//  - пункт без `more` виден всегда;
//  - пункт с `more` лежит в «Ещё», но выходит наверх, если у него есть число «ждёт действия» (Возвраты, Нераспознанные);
//  - пункт «скоро» (витрина закрыта) обычному человеку не показывается совсем, админу показывается в «Ещё»
//    как обычная рабочая ссылка (он единственный, кто туда ходит);
//  - «Ещё» раскрыта сама, когда открыта страница из этой группы: человек не должен терять пункт, на котором стоит.

import { menuCountKeyForHref, type MenuCounts } from './menuCounts'

export interface MenuLink {
  href: string
  soon?: boolean
  more?: boolean
}

export interface SplitMenu<T extends MenuLink> {
  primary: T[]
  more: T[]
  /** Страница из группы «Ещё» открыта сейчас: группу раскрыть. */
  moreOpenByDefault: boolean
}

export function splitMenuLinks<T extends MenuLink>(
  links: T[],
  opts: { counts: MenuCounts; isAdmin: boolean; activeHref?: string | null },
): SplitMenu<T> {
  const primary: T[] = []
  const more: T[] = []
  for (const l of links) {
    if (l.soon) {
      if (opts.isAdmin) more.push(l)
      continue
    }
    if (!l.more) { primary.push(l); continue }
    const key = menuCountKeyForHref(l.href)
    const n = key ? opts.counts[key] : null
    if (typeof n === 'number' && n > 0) primary.push(l)
    else more.push(l)
  }
  const moreOpenByDefault = !!opts.activeHref && more.some(l => l.href === opts.activeHref)
  return { primary, more, moreOpenByDefault }
}
