import { parseMoneyInput } from './moneyInput'

// Разбор числа из тела запроса (себестоимость, комиссия, расходы). Раньше маршруты
// делали Number(raw): пустая строка превращалась в 0, а NaN, пришедший с клиента
// как null (JSON.stringify(NaN)), читался как «очистить значение» (аудит K34).
// Здесь «очистить» -- только явный null (если поле допускает), всё нечисловое --
// отказ, а не тихий ноль.
export type MoneyBodyValue =
  | { ok: true; value: number | null }
  | { ok: false; reason: 'missing' | 'invalid' }

export function readMoneyBody(
  raw: unknown,
  opts: { nullable?: boolean; min?: number; max?: number } = {},
): MoneyBodyValue {
  const { nullable = false, min = 0, max = 1_000_000_000 } = opts
  if (raw === undefined) return { ok: false, reason: 'missing' }
  if (raw === null) return nullable ? { ok: true, value: null } : { ok: false, reason: 'invalid' }

  let value: number
  if (typeof raw === 'number') {
    value = raw
  } else if (typeof raw === 'string') {
    const parsed = parseMoneyInput(raw)
    if (!parsed.ok) return { ok: false, reason: 'invalid' }
    value = parsed.value
  } else {
    return { ok: false, reason: 'invalid' }
  }
  if (!Number.isFinite(value) || value < min || value > max) return { ok: false, reason: 'invalid' }
  return { ok: true, value }
}
