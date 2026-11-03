import dns from 'dns/promises'
import type { LookupAddress } from 'dns'

// callback_url клиента целиком задаёт сам клиент (своим API-токеном на
// /api/kaspi/pay), а дёргает его уже наш сервер: пока адрес не проверен,
// это SSRF в облачный metadata-сервис, loopback и внутреннюю сеть. Проверка
// идёт тремя слоями: форма URL (https, без логина/пароля, порт 443/8443),
// имя хоста (localhost/.internal/…) и сам IP: и для литерала в URL, и для
// КАЖДОГО адреса из реального DNS-ответа (не по строкам имени).

// ───── IPv4 ─────

// Разбор по правилам inet_aton: 1-4 части, каждая десятичная, восьмеричная
// (0177) или hex (0x7f); последняя часть добирает оставшиеся байты, поэтому
// 2130706433, 0177.0.0.1, 0x7f.1 и 127.1 — всё это 127.0.0.1. new URL()
// такие записи уже нормализует, но getaddrinfo понимает их сам, и
// полагаться на одну лишь нормализацию парсера нельзя.
function parseIpv4(raw: string): number | null {
  const parts = raw.split('.')
  if (parts.length > 4) return null
  const nums: number[] = []
  for (const p of parts) {
    let n: number
    if (/^0x[0-9a-f]*$/i.test(p)) n = p.length === 2 ? 0 : parseInt(p.slice(2), 16)
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8)
    else if (/^(?:0|[1-9]\d*)$/.test(p)) n = parseInt(p, 10)
    else return null
    nums.push(n)
  }
  const last = nums[nums.length - 1]
  if (last >= 256 ** (5 - nums.length)) return null
  let value = last
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] > 255) return null
    value += nums[i] * 256 ** (3 - i)
  }
  return value
}

// Диапазоны из IANA special-purpose registry, куда наш сервер ходить не должен.
const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], //        «эта сеть», в т.ч. 0.0.0.0
  ['10.0.0.0', 8], //       RFC1918
  ['100.64.0.0', 10], //    CGNAT (metadata Alibaba 100.100.100.200 тоже здесь)
  ['127.0.0.0', 8], //      loopback
  ['169.254.0.0', 16], //   link-local + облачный metadata 169.254.169.254
  ['172.16.0.0', 12], //    RFC1918
  ['192.0.0.0', 24], //     IETF protocol assignments (metadata Oracle 192.0.0.192)
  ['192.0.2.0', 24], //     TEST-NET-1
  ['192.88.99.0', 24], //   6to4 relay anycast (устарел)
  ['192.168.0.0', 16], //   RFC1918
  ['198.18.0.0', 15], //    benchmarking
  ['198.51.100.0', 24], //  TEST-NET-2
  ['203.0.113.0', 24], //   TEST-NET-3
  ['224.0.0.0', 4], //      multicast
  ['240.0.0.0', 4], //      reserved + broadcast 255.255.255.255
]
const BLOCKED_V4: ReadonlyArray<readonly [number, number]> = BLOCKED_V4_CIDRS.map(
  ([ip, bits]) => [parseIpv4(ip) as number, bits] as const,
)

function isBlockedIpv4(n: number): boolean {
  return BLOCKED_V4.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits))
}

// ───── IPv6 ─────

// Каноничный dotted-quad внутри IPv6 (::ffff:1.2.3.4): ровно 4 десятичных
// октета без ведущих нулей.
const DOTTED_QUAD = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

// 8 групп по 16 бит или null, если запись невалидна (тогда вызывающий
// закрывает доступ). Понимает «::» и хвост a.b.c.d. Zone id (%eth0) не
// разбирается: он бывает только у fe80::/10, а это и так закрыто.
function parseIpv6(raw: string): number[] | null {
  let s = raw
  const lastColon = s.lastIndexOf(':')
  const tail = s.slice(lastColon + 1)
  if (tail.includes('.')) {
    if (!DOTTED_QUAD.test(tail)) return null
    const [a, b, c, d] = tail.split('.').map(Number)
    s = `${s.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  const compressed = halves.length === 2
  const head = halves[0] === '' ? [] : halves[0].split(':')
  const rest = compressed && halves[1] !== '' ? halves[1].split(':') : []
  if (compressed ? head.length + rest.length > 7 : head.length !== 8) return null
  const fill: string[] = compressed ? Array(8 - head.length - rest.length).fill('0') : []
  const groups = [...head, ...fill, ...rest]
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.map((g) => parseInt(g, 16))
}

function isBlockedIpv6(g: number[]): boolean {
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0)
  const embeddedV4 = (hi: number, lo: number) => ((hi << 16) | lo) >>> 0

  // IPv4-mapped ::ffff:a.b.c.d (и hex-вид ::ffff:7f00:1): судим по вшитому
  // IPv4, иначе ::ffff:169.254.169.254 проскакивает как «не приватный».
  if (zeros(0, 5) && g[5] === 0xffff) return isBlockedIpv4(embeddedV4(g[6], g[7]))
  // NAT64 64:ff9b::/96: так же по вшитому IPv4. Локальный 64:ff9b:1::/48
  // сюда не попадает и закрывается правилом «не 2000::/3» ниже.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return isBlockedIpv4(embeddedV4(g[6], g[7]))

  // Default deny: публичные адреса бывают только в 2000::/3. Всё остальное
  // (::, ::1, IPv4-compatible ::a.b.c.d, fc00::/7, fe80::/10, fec0::/10,
  // ff00::/8, 100::/64 и ещё не выданные блоки) наружу не ходит.
  if ((g[0] & 0xe000) !== 0x2000) return true

  if (g[0] === 0x2001 && g[1] < 0x0200) return true // 2001::/23: IETF-протоколы, Teredo, ORCHID
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true // документация 2001:db8::/32
  if (g[0] === 0x3fff && g[1] < 0x1000) return true // документация 3fff::/20
  // 6to4 2002::/16: IPv4 лежит в группах 1-2, судим по нему.
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedV4(g[1], g[2]))
  return false
}

// true, если на этот IP наш сервер ходить НЕЛЬЗЯ. Невалидная запись тоже
// true: закрываемся, а не пропускаем то, что не смогли разобрать.
export function isPrivateIp(rawIp: string): boolean {
  let ip = typeof rawIp === 'string' ? rawIp : ''
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1)
  if (ip.includes(':')) {
    const groups = parseIpv6(ip)
    return groups === null ? true : isBlockedIpv6(groups)
  }
  const v4 = parseIpv4(ip)
  return v4 === null ? true : isBlockedIpv4(v4)
}

// ───── имя хоста ─────

// Суффиксы, которые никогда не бывают публичным сайтом клиента: локальные и
// корпоративные зоны (+ metadata.google.internal через .internal).
const BLOCKED_NAME_SUFFIXES = ['localhost', 'internal', 'local', 'lan', 'localdomain', 'home.arpa', 'intranet', 'corp', 'home', 'private']
const BLOCKED_EXACT_NAMES = new Set(['metadata.goog'])

// Имя без точки (intranet, metadata) резолвер достраивает search-доменом и
// уводит во внутреннюю сеть; у настоящего сайта всегда есть точка.
export function isBlockedHostname(rawName: string): boolean {
  const name = rawName.toLowerCase().replace(/\.+$/, '')
  if (!name.includes('.')) return true
  if (name.split('.').some((label) => label === '')) return true
  if (BLOCKED_EXACT_NAMES.has(name)) return true
  return BLOCKED_NAME_SUFFIXES.some((s) => name === s || name.endsWith(`.${s}`))
}

// ───── URL ─────

// https доступен только на 443, поэтому порт 80 не нужен. 8443 оставлен для
// клиентов на Plesk/cPanel/Cloudflare-прокси. Дефолтный порт new URL()
// отдаёт пустой строкой, поэтому '' = 443. Остальные порты закрыты: чтобы
// через нас нельзя было стучаться в Redis/Postgres/Docker на чужих публичных IP.
const ALLOWED_PORTS = new Set(['', '443', '8443'])

type UrlVerdict = { kind: 'unsafe' } | { kind: 'literal' } | { kind: 'resolve'; hostname: string }

// Всё, что решается без сети. 'literal': хост это IP и он публичный (DNS не
// нужен); 'resolve': это имя, и адреса надо ещё проверить через DNS.
function inspectWebhookUrl(rawUrl: unknown): UrlVerdict {
  const unsafe: UrlVerdict = { kind: 'unsafe' }
  // Не строка (массив ['https://…'] new URL() превращает в строку через toString).
  if (typeof rawUrl !== 'string') return unsafe
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return unsafe
  }
  if (url.protocol !== 'https:') return unsafe
  if (url.username !== '' || url.password !== '') return unsafe
  if (!ALLOWED_PORTS.has(url.port)) return unsafe

  const host = url.hostname
  if (host.startsWith('[')) return isPrivateIp(host) ? unsafe : { kind: 'literal' }

  // Хост, оканчивающийся числом (127.1, 0x7f.1, 2130706433.), парсер URL либо
  // приводит к канонической четвёрке, либо отвергает целиком, поэтому до DNS
  // «числовое имя» дойти не может. Остальное разбираем как обычное имя.
  const v4 = parseIpv4(host)
  if (v4 !== null) return isBlockedIpv4(v4) ? unsafe : { kind: 'literal' }
  if (isBlockedHostname(host)) return unsafe
  return { kind: 'resolve', hostname: host }
}

// Дешёвая проверка без DNS, чтобы отвергнуть заведомо плохой URL сразу при
// создании. Авторитетной остаётся isSafeWebhookUrl прямо перед отправкой.
export function isWebhookUrlShapeSafe(rawUrl: unknown): boolean {
  return inspectWebhookUrl(rawUrl).kind !== 'unsafe'
}

export async function isSafeWebhookUrl(rawUrl: unknown): Promise<boolean> {
  const verdict = inspectWebhookUrl(rawUrl)
  if (verdict.kind === 'unsafe') return false
  if (verdict.kind === 'literal') return true
  try {
    // all: true: у хоста может быть несколько A/AAAA, и fetch подключится к
    // любому из них. Достаточно одного приватного адреса, чтобы отказать
    // (хост с записями «публичный + 10.0.0.5» иначе проходит по первой).
    const res: LookupAddress | LookupAddress[] = await dns.lookup(verdict.hostname, { all: true })
    const addresses = Array.isArray(res) ? res : [res]
    return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a.address))
  } catch {
    return false // имя не резолвится — закрываемся
  }
}
