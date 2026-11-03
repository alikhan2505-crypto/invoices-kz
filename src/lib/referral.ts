// Правила реферальной программы. Сами правила держит база (функции
// claim_referral_bonus и credit_referrer_bonus, supabase/migrations/
// audit_2026_11_03_referral_limits.sql); здесь те же числа для страницы,
// логов и сверки с миграцией (referral.test.ts падает, если они разошлись).

/** Сколько дней бонуса получает каждая сторона. */
export const REFERRAL_BONUS_DAYS = 7

/** За скольких приглашённых друзей реферер получает бонус. 11-й и дальше ему ничего не дают. */
export const REFERRAL_MAX_FRIENDS = 10

/** Бонус по реферальной ссылке получает только аккаунт не старше этого числа суток. */
export const REFERRAL_NEW_ACCOUNT_DAYS = 2
