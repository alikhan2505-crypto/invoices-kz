// Комиссия платформы с каждой подтверждённой Kaspi-оплаты. Вынесена из
// wallet.ts, чтобы чистой арифметикой могли пользоваться модули без клиента
// Supabase (ночная сверка платежей, тесты): wallet.ts создаёт клиент при
// импорте и без переменных окружения падает.
export const COMMISSION_RATE = 0.02

export function computeCommission(amount: number): number {
  return Math.round(amount * COMMISSION_RATE)
}
