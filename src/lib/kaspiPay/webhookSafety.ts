import dns from 'dns/promises'

// A customer's own callback_url (set via their own API-token request to
// /api/kaspi/pay) is entirely caller-controlled, and this cron is what
// actually fetches it from invoices.kz's own infrastructure — a classic
// SSRF vector unless the target is validated first: https-only, and reject
// any hostname that resolves (via real DNS lookup, not string matching) to
// a loopback/RFC1918-private/link-local/0.0.0.0 address.
export function isPrivateIp(rawIp: string): boolean {
  // IPv4-mapped IPv6 (::ffff:a.b.c.d, or the fully-expanded
  // 0:0:0:0:0:ffff:a.b.c.d form dns.lookup can also return) must be
  // unwrapped to its embedded IPv4 address BEFORE range-checking. Without
  // this, a literal like ::ffff:169.254.169.254 fails the dotted-quad
  // split (produces NaN, since the string still has "::ffff:" glued to the
  // first octet) and falls through as "not private" — a real, reachable
  // SSRF bypass to the cloud metadata IP and to loopback/RFC1918 targets.
  const mapped = rawIp.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d+\.\d+\.\d+\.\d+)$/i)
  const ip = mapped ? mapped[1] : rawIp

  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
  const [a, b] = parts
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0
}

export async function isSafeWebhookUrl(rawUrl: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.hostname === 'localhost') return false
  try {
    const { address } = await dns.lookup(url.hostname)
    return !isPrivateIp(address)
  } catch {
    return false // unresolvable hostname — fail closed
  }
}
