import { setPostLoginRedirect } from '@/lib/postLoginRedirect'

// Протухший вход на странице Kaspi Bot (M22, прогон воронки 07.11.2026): раньше страница молча уводила на /login, а после
// входа человек оказывался в Счетах и терял, где был. Теперь запоминаем «вернуть в Kaspi Bot» (/kaspi-shop из белого
// списка, 30 минут) и просим /login показать фразу «Вход устарел» (параметр session=expired).
export function kaspiLoginUrl(): string {
  setPostLoginRedirect('/kaspi-shop')
  return '/login?session=expired'
}
