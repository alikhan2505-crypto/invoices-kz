// Служебный адрес человека, вошедшего по номеру WhatsApp (клиентский и серверный код, без node-модулей).
// Supabase Auth требует email, а у такого человека его ещё нет. Домен .invalid зарезервирован (RFC 2606):
// письмо туда не уйдёт никогда, и репутацию отправителя Resend мы не портим.

const PLACEHOLDER_DOMAIN = 'wa.invalid'

export function placeholderEmailFor(waId: string): string {
  return `wa${waId}@${PLACEHOLDER_DOMAIN}`
}

export function isPlaceholderEmail(email: unknown): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`)
}

/** Адрес для показа и рассылок: служебный превращается в null. */
export function realEmailOrNull(email: unknown): string | null {
  return typeof email === 'string' && email && !isPlaceholderEmail(email) ? email : null
}
