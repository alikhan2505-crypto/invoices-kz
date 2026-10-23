import { timingSafeEqual } from 'crypto'

// Защита маршрутов /api/hooks/*, которые зовёт pg_net из базы (триггер
// notify_new_signup_trigger, pg_cron welcome-instant). Заголовка с секретом
// SQL-часть пока не шлёт, поэтому проверка включается только когда в окружении
// задан HOOKS_PG_NET_SECRET: сначала основатель правит SQL (добавляет заголовок
// x-internal-secret в net.http_post), потом задаёт переменную. Пока её нет —
// поведение прежнее, а от зацикленных вызовов защищает throttle ниже.

export function hookSecretOk(headers: Headers, expected = process.env.HOOKS_PG_NET_SECRET): boolean {
  if (!expected) return true
  const got = headers.get('x-internal-secret') || ''
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const lastRun = new Map<string, number>()

/**
 * true — вызов надо пропустить: этот ключ уже срабатывал меньше minGapMs назад
 * (в пределах одного инстанса; крон раз в 5 минут от паузы в минуту не страдает).
 */
export function throttled(key: string, minGapMs: number, now = Date.now()): boolean {
  const prev = lastRun.get(key)
  if (prev !== undefined && now - prev < minGapMs) return true
  lastRun.set(key, now)
  return false
}

/** Только для тестов. */
export function resetThrottle(): void {
  lastRun.clear()
}
