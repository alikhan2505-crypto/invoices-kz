// Разбор денежного поля, которое человек набрал руками. Нужен вместо Number(raw):
// Number('12,5') и Number('1 250') дают NaN, JSON.stringify(NaN) = null, а сервер
// читает null как «очистить значение» (аудит Kaspi 2026-11-06, K11/K16/K34).
// Заодно пустое поле больше не превращается в 0: Number('') === 0, и «минимальная
// цена» тихо становилась нулём.
export type MoneyParse =
  | { ok: true; value: number }
  | { ok: false; blank: boolean; reason: 'blank' | 'invalid' | 'ambiguous' | 'too_large' }

// Пробелы всех видов (обычный, неразрывный, узкий, тонкий) и знак тенге/«тг»
// убираем: «1 250 ₸» и «1250» - одно и то же.
const STRIP_RE = /[\s   ₸]|тг\.?/gi

export function parseMoneyInput(raw: string | null | undefined): MoneyParse {
  if (raw === null || raw === undefined) return { ok: false, blank: true, reason: 'blank' }
  const cleaned = String(raw).replace(STRIP_RE, '')
  if (cleaned === '') return { ok: false, blank: true, reason: 'blank' }

  // Только цифры и один разделитель (запятая или точка).
  if (!/^\d+([.,]\d+)?$/.test(cleaned)) return { ok: false, blank: false, reason: 'invalid' }

  // «12,500» / «12.500»: человек мог иметь в виду 12 500, а мог 12,5. Для
  // минимальной цены ошибка в тысячу раз опасна (бот уронил бы цену до 12 ₸),
  // поэтому такую запись не угадываем, а просим переписать.
  const sepMatch = cleaned.match(/^([1-9]\d{0,2})[.,](\d{3})$/)
  if (sepMatch) return { ok: false, blank: false, reason: 'ambiguous' }

  const value = Number(cleaned.replace(',', '.'))
  if (!Number.isFinite(value)) return { ok: false, blank: false, reason: 'invalid' }
  if (value > 1_000_000_000) return { ok: false, blank: false, reason: 'too_large' }
  return { ok: true, value }
}

// Короткое пояснение к отказу для подписи под полем.
export function moneyParseMessage(label: string, r: Extract<MoneyParse, { ok: false }>): string {
  if (r.reason === 'blank') return `${label}: заполните поле.`
  if (r.reason === 'ambiguous') return `${label}: непонятная запись числа. Введите 12500 или 12,5, без точки перед тысячами.`
  if (r.reason === 'too_large') return `${label}: слишком большое число.`
  return `${label}: введите число, например 12500 или 12,5.`
}
