// Проверка ИИН человека без серверных зависимостей: нужна и браузеру (форма
// подсказывает опечатку сразу), и серверу (маршрут не доверяет браузеру).

import { isIndividualId } from '@/lib/aisoip'
import { isValidBinIin } from '@/lib/kzIdentifiers'

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * ИИН человека: 12 цифр, верная контрольная цифра, в начале настоящие ГГММДД
 * (месяц 01-12, день по календарю; 29 февраля пропускаем без проверки года, чтобы
 * не отвергнуть настоящий ИИН) и 7-я цифра века и пола не больше 6. В БИН на 5-м
 * месте стоит 4, 5 или 6, поэтому его эта проверка отсекает. Контрольная цифра
 * ловит лишь 10 из 11 опечаток: без проверки даты опечатка в ней уходила бы в
 * реестры, а ответ «не найдено» выглядел бы как «чисто».
 */
export function isPersonIin(value: string): boolean {
  if (!/^\d{12}$/.test(value) || !isIndividualId(value) || !isValidBinIin(value)) return false
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return false
  return Number(value[6]) <= 6
}
