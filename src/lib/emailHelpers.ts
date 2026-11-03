// Помощники страницы входа (03.11.2026): подсказка про опечатку в почте и кнопка «Открыть почту».
// Чистые функции без сети. Опечатка в адресе это вечный замок: письмо молча не приходит
// (email_deliverability_lockout, четыре аккаунта не могли войти), поэтому лучше спросить до отправки.

const KNOWN_DOMAINS = [
  'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.kz', 'ya.ru', 'outlook.com', 'hotmail.com', 'icloud.com',
  'bk.ru', 'list.ru', 'inbox.ru', 'yahoo.com', 'rambler.ru', 'live.com', 'me.com', 'proton.me', 'protonmail.com',
] as const

// Частые ошибки, которые по расстоянию не поймать (чужая зона или переставленные буквы).
const TYPO_MAP: Record<string, string> = {
  'gmail.ru': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.comm': 'gmail.com',
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'mail.ry': 'mail.ru', 'mail.rn': 'mail.ru', 'mial.ru': 'mail.ru', 'mail.com.ru': 'mail.ru', 'maill.ru': 'mail.ru',
  'yandex.ry': 'yandex.ru', 'yadex.ru': 'yandex.ru', 'yande.ru': 'yandex.ru', 'yandex.com': 'yandex.ru', 'yandx.ru': 'yandex.ru',
  'outlok.com': 'outlook.com', 'hotmial.com': 'hotmail.com', 'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com',
}

function distance(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

function split(email: string): { local: string; domain: string } | null {
  const at = email.trim().lastIndexOf('@')
  if (at <= 0 || at === email.trim().length - 1) return null
  const t = email.trim()
  return { local: t.slice(0, at), domain: t.slice(at + 1).toLowerCase() }
}

/**
 * Адрес с исправленным доменом, если похоже на опечатку в известном почтовом домене; иначе null.
 * Известный домен не трогаем. Расстояние 1 берём только для доменов от 7 знаков (иначе «mail.ru» и
 * «bk.ru» цеплялись бы к чужим коротким доменам), плюс таблица частых ошибок.
 */
export function suggestEmailFix(email: string): string | null {
  const parts = split(email)
  if (!parts) return null
  const { local, domain } = parts
  if ((KNOWN_DOMAINS as readonly string[]).includes(domain)) return null
  const mapped = TYPO_MAP[domain]
  if (mapped) return `${local}@${mapped}`
  if (domain.length >= 7) {
    const near = KNOWN_DOMAINS.filter(d => d.length >= 7 && distance(domain, d) === 1)
    if (near.length === 1) return `${local}@${near[0]}`
  }
  return null
}

export interface MailProviderLink { name: string; href: string }

/** Куда вести «Открыть почту» для этого адреса; null для неизвестного домена. */
export function mailProviderLink(email: string): MailProviderLink | null {
  const parts = split(email)
  if (!parts) return null
  const d = parts.domain
  if (d === 'gmail.com' || d === 'googlemail.com') return { name: 'Gmail', href: 'https://mail.google.com/' }
  if (['mail.ru', 'bk.ru', 'list.ru', 'inbox.ru'].includes(d)) return { name: 'Mail.ru', href: 'https://e.mail.ru/inbox' }
  if (d === 'ya.ru' || d.startsWith('yandex.')) return { name: 'Яндекс Почта', href: 'https://mail.yandex.ru/' }
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(d)) return { name: 'Outlook', href: 'https://outlook.live.com/mail/' }
  if (['icloud.com', 'me.com', 'mac.com'].includes(d)) return { name: 'iCloud', href: 'https://www.icloud.com/mail' }
  if (d === 'yahoo.com') return { name: 'Yahoo', href: 'https://mail.yahoo.com/' }
  if (d === 'proton.me' || d === 'protonmail.com') return { name: 'Proton', href: 'https://mail.proton.me/' }
  return null
}
