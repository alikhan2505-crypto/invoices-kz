import { describe, it, expect, vi, afterEach } from 'vitest'
import dns from 'dns/promises'
import { isBlockedHostname, isPrivateIp, isSafeWebhookUrl, isWebhookUrlShapeSafe } from './webhookSafety'

describe('isPrivateIp', () => {
  it('rejects loopback', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('::1')).toBe(true)
  })

  it('rejects RFC1918 private ranges', () => {
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('172.31.255.255')).toBe(true)
    expect(isPrivateIp('192.168.1.5')).toBe(true)
  })

  it('rejects link-local, including the cloud metadata IP', () => {
    expect(isPrivateIp('169.254.169.254')).toBe(true)
  })

  it('rejects unique-local IPv6 (fc00::/7)', () => {
    expect(isPrivateIp('fd12:3456:789a:1::1')).toBe(true)
  })

  it('allows a public IPv4 address', () => {
    expect(isPrivateIp('93.184.216.34')).toBe(false)
  })

  it('does not crash on a non-loopback IPv6 global address, and treats it as not private', () => {
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false)
  })

  it('unwraps IPv4-mapped IPv6 loopback/private/link-local addresses instead of letting them slip through', () => {
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIp('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateIp('::ffff:192.168.1.5')).toBe(true)
    expect(isPrivateIp('0:0:0:0:0:ffff:10.0.0.1')).toBe(true)
  })

  it('still allows an IPv4-mapped IPv6 address whose embedded IPv4 is public', () => {
    expect(isPrivateIp('::ffff:93.184.216.34')).toBe(false)
  })
})

describe('isSafeWebhookUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects non-https URLs', async () => {
    expect(await isSafeWebhookUrl('http://example.com/webhook')).toBe(false)
  })

  it('rejects an unparseable URL', async () => {
    expect(await isSafeWebhookUrl('not a url')).toBe(false)
  })

  it('rejects localhost by hostname without needing a DNS lookup', async () => {
    expect(await isSafeWebhookUrl('https://localhost/webhook')).toBe(false)
  })

  it('rejects a hostname that resolves to a private IP', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '192.168.1.5', family: 4 } as any)
    expect(await isSafeWebhookUrl('https://internal.example.com/webhook')).toBe(false)
  })

  it('rejects a hostname that resolves to an IPv4-mapped IPv6 metadata address', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '::ffff:169.254.169.254', family: 6 } as any)
    expect(await isSafeWebhookUrl('https://sneaky.example.com/webhook')).toBe(false)
  })

  it('allows a hostname that resolves to a public IP', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '93.184.216.34', family: 4 } as any)
    expect(await isSafeWebhookUrl('https://example.com/webhook')).toBe(true)
  })

  it('fails closed when the hostname cannot be resolved', async () => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('ENOTFOUND'))
    expect(await isSafeWebhookUrl('https://does-not-exist.invalid/webhook')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Табличные проверки аудита 02.11.2026 (SSRF в callback_url): граница каждого
// диапазона (первый/последний адрес и сосед снаружи) и каждая форма записи.
// Строки таблиц: [значение, ожидание, пояснение].
// ─────────────────────────────────────────────────────────────────────────────

type Row = [input: string, blocked: boolean, note: string]

describe('isPrivateIp: IPv4, границы диапазонов', () => {
  const rows: Row[] = [
    ['0.0.0.0', true, '0/8 первый (unspecified)'],
    ['0.255.255.255', true, '0/8 последний'],
    ['1.0.0.0', false, 'сразу за 0/8'],
    ['9.255.255.255', false, 'перед 10/8'],
    ['10.0.0.0', true, '10/8 первый'],
    ['10.255.255.255', true, '10/8 последний'],
    ['11.0.0.0', false, 'за 10/8'],
    ['100.63.255.255', false, 'перед CGNAT'],
    ['100.64.0.0', true, 'CGNAT первый'],
    ['100.100.100.200', true, 'metadata Alibaba внутри CGNAT'],
    ['100.127.255.255', true, 'CGNAT последний'],
    ['100.128.0.0', false, 'за CGNAT'],
    ['126.255.255.255', false, 'перед loopback'],
    ['127.0.0.0', true, 'loopback первый'],
    ['127.0.0.1', true, 'loopback'],
    ['127.255.255.255', true, 'loopback последний'],
    ['128.0.0.0', false, 'за loopback'],
    ['169.253.255.255', false, 'перед link-local'],
    ['169.254.0.0', true, 'link-local первый'],
    ['169.254.169.254', true, 'облачный metadata'],
    ['169.254.255.255', true, 'link-local последний'],
    ['169.255.0.0', false, 'за link-local'],
    ['172.15.255.255', false, 'перед 172.16/12'],
    ['172.16.0.0', true, '172.16/12 первый'],
    ['172.31.255.255', true, '172.16/12 последний'],
    ['172.32.0.0', false, 'за 172.16/12'],
    ['191.255.255.255', false, 'перед 192.0.0/24'],
    ['192.0.0.0', true, '192.0.0/24 первый'],
    ['192.0.0.192', true, 'metadata Oracle'],
    ['192.0.0.255', true, '192.0.0/24 последний'],
    ['192.0.1.0', false, 'за 192.0.0/24'],
    ['192.0.2.0', true, 'TEST-NET-1 первый'],
    ['192.0.2.255', true, 'TEST-NET-1 последний'],
    ['192.0.3.0', false, 'за TEST-NET-1'],
    ['192.88.98.255', false, 'перед 6to4-relay'],
    ['192.88.99.0', true, '6to4-relay первый'],
    ['192.88.99.255', true, '6to4-relay последний'],
    ['192.88.100.0', false, 'за 6to4-relay'],
    ['192.167.255.255', false, 'перед 192.168/16'],
    ['192.168.0.0', true, '192.168/16 первый'],
    ['192.168.255.255', true, '192.168/16 последний'],
    ['192.169.0.0', false, 'за 192.168/16'],
    ['198.17.255.255', false, 'перед benchmarking'],
    ['198.18.0.0', true, 'benchmarking первый'],
    ['198.19.255.255', true, 'benchmarking последний'],
    ['198.20.0.0', false, 'за benchmarking'],
    ['198.51.99.255', false, 'перед TEST-NET-2'],
    ['198.51.100.0', true, 'TEST-NET-2 первый'],
    ['198.51.100.255', true, 'TEST-NET-2 последний'],
    ['198.51.101.0', false, 'за TEST-NET-2'],
    ['203.0.112.255', false, 'перед TEST-NET-3'],
    ['203.0.113.0', true, 'TEST-NET-3 первый'],
    ['203.0.113.255', true, 'TEST-NET-3 последний'],
    ['203.0.114.0', false, 'за TEST-NET-3'],
    ['223.255.255.255', false, 'перед multicast'],
    ['224.0.0.0', true, 'multicast первый'],
    ['239.255.255.255', true, 'multicast последний'],
    ['240.0.0.0', true, 'reserved первый'],
    ['255.255.255.254', true, 'reserved предпоследний'],
    ['255.255.255.255', true, 'broadcast'],
    ['1.1.1.1', false, 'публичный'],
    ['8.8.8.8', false, 'публичный'],
    ['93.184.216.34', false, 'публичный'],
  ]
  it.each(rows)('%s -> blocked=%s (%s)', (ip, blocked) => {
    expect(isPrivateIp(ip)).toBe(blocked)
  })
})

describe('isPrivateIp: нестандартные записи IPv4 (inet_aton)', () => {
  const rows: Row[] = [
    ['2130706433', true, 'десятичное 127.0.0.1'],
    ['0177.0.0.1', true, 'восьмеричный первый октет'],
    ['0x7f.1', true, 'hex + короткая запись'],
    ['127.1', true, 'короткая запись 127.0.0.1'],
    ['0x7f000001', true, 'одно hex-число'],
    ['017700000001', true, 'одно восьмеричное число'],
    ['0x7f.0.0.1', true, 'hex в первом октете'],
    ['0', true, '0.0.0.0'],
    ['0x', true, 'пустой hex = 0'],
    ['2852039166', true, 'десятичное 169.254.169.254'],
    ['0251.0376.0251.0376', true, 'восьмеричное 169.254.169.254'],
    ['167772161', true, 'десятичное 10.0.0.1'],
    ['3232235777', true, 'десятичное 192.168.1.1'],
    ['10.1', true, '10.0.0.1 в две части'],
    ['172.16.1', true, '172.16.0.1 в три части'],
    ['1.1', false, 'публичный 1.0.0.1'],
    ['010.8.8.8', false, 'восьмеричный 010 = 8, публичный 8.8.8.8'],
    ['0x08.8.8.8', false, 'hex 0x08 = 8, публичный 8.8.8.8'],
    ['0x08080808', false, 'публичный 8.8.8.8 одним hex'],
    ['134744072', false, 'публичный 8.8.8.8 одним числом'],
  ]
  it.each(rows)('%s -> blocked=%s (%s)', (ip, blocked) => {
    expect(isPrivateIp(ip)).toBe(blocked)
  })
})

describe('isPrivateIp: закрывается на том, что не удалось разобрать', () => {
  const garbage = [
    '', 'not-an-ip', 'example.com', '1.2.3.4.5', '256.0.0.1', '1.2.3.256', '4294967296',
    '08.1.1.1', '1..2.3', '127.0.0.1.', ' 127.0.0.1', '0xzz', '-1',
    ':::', '1::2::3', '12345::1', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8::',
    ':1:2:3:4:5:6:7', '::ffff:1.2.3', '::ffff:256.0.0.1', '::ffff:1.2.3.04', '::ffff:127.0.0.1.5',
    // Если бы такие записи «как-то» разбирались, они дали бы ПУБЛИЧНЫЙ адрес:
    '264.8.8.8', // 264 * 2^24 переполняет 32 бита и оборачивается в 8.8.8.8
    '8.8.8.8.0', // пятая часть: inet_aton такое не принимает
    '2606:4700:4700:0:0:0:1111', // 7 групп без ::
    '2606:4700:4700:0:0:0:0:1111::', // 8 групп и ::
    '2606:4700:4700::1:2:3:4:5:6', // 9 групп
    '2606:4700:4700:0:0:0:0:1111::9::a', // два ::
    '2606:4700:4700::1111%eth0', // zone id не поддерживается
  ]
  it.each(garbage)('%j -> blocked', (value) => {
    expect(isPrivateIp(value)).toBe(true)
  })

  it('не падает на не-строке и тоже закрывается', () => {
    expect(isPrivateIp(undefined as unknown as string)).toBe(true)
    expect(isPrivateIp(null as unknown as string)).toBe(true)
  })
})

describe('isPrivateIp: IPv6', () => {
  const rows: Row[] = [
    // unspecified / loopback / зарезервированный ::/8
    ['::', true, 'unspecified'],
    ['0:0:0:0:0:0:0:0', true, 'unspecified полной записью'],
    ['::1', true, 'loopback'],
    ['0:0:0:0:0:0:0:1', true, 'loopback полной записью'],
    ['::2', true, 'зарезервированный ::/8'],
    // IPv4-compatible (устарело)
    ['::7f00:1', true, 'IPv4-compatible 127.0.0.1'],
    ['::127.0.0.1', true, 'IPv4-compatible dotted'],
    ['::8.8.8.8', true, 'IPv4-compatible публичный v4 всё равно закрыт'],
    // IPv4-mapped
    ['::ffff:127.0.0.1', true, 'mapped dotted'],
    ['::ffff:7f00:1', true, 'mapped hex'],
    ['::ffff:7F00:1', true, 'mapped hex в верхнем регистре'],
    ['::FFFF:7f00:0001', true, 'mapped с ведущими нулями'],
    ['0:0:0:0:0:ffff:7f00:1', true, 'mapped полной записью'],
    ['::ffff:169.254.169.254', true, 'mapped metadata dotted'],
    ['::ffff:a9fe:a9fe', true, 'mapped metadata hex'],
    ['::ffff:10.0.0.1', true, 'mapped 10/8 dotted'],
    ['::ffff:0a00:0001', true, 'mapped 10/8 hex'],
    ['::ffff:192.168.1.5', true, 'mapped 192.168/16'],
    ['::ffff:100.64.0.1', true, 'mapped CGNAT dotted'],
    ['::ffff:6440:1', true, 'mapped CGNAT hex'],
    ['::ffff:0.0.0.0', true, 'mapped 0.0.0.0'],
    ['::ffff:224.0.0.1', true, 'mapped multicast'],
    ['::ffff:255.255.255.255', true, 'mapped broadcast'],
    ['::ffff:8.8.8.8', false, 'mapped публичный dotted'],
    ['::ffff:808:808', false, 'mapped публичный hex'],
    ['::ffff:0:8.8.8.8', true, 'SIIT ::ffff:0:a.b.c.d закрыт по умолчанию'],
    // NAT64
    ['64:ff9b::', true, 'NAT64 с вшитым 0.0.0.0'],
    ['64:ff9b::7f00:1', true, 'NAT64 127.0.0.1 hex'],
    ['64:ff9b::127.0.0.1', true, 'NAT64 127.0.0.1 dotted'],
    ['64:ff9b::a00:1', true, 'NAT64 10.0.0.1'],
    ['64:ff9b::a9fe:a9fe', true, 'NAT64 metadata'],
    ['64:ff9b::5db8:d822', false, 'NAT64 публичный 93.184.216.34'],
    ['64:ff9b::8.8.8.8', false, 'NAT64 публичный dotted'],
    ['64:ff9b:1::1', true, 'NAT64 local-use 64:ff9b:1::/48'],
    // 6to4
    ['2002::', true, '6to4 с вшитым 0.0.0.0'],
    ['2002:7f00:1::', true, '6to4 127.0.0.1'],
    ['2002:7f00:0001::1', true, '6to4 127.0.0.1 с хвостом'],
    ['2002:a00:1::', true, '6to4 10.0.0.1'],
    ['2002:a9fe:a9fe::', true, '6to4 metadata'],
    ['2002:c0a8:101::', true, '6to4 192.168.1.1'],
    ['2002:6440:1::', true, '6to4 CGNAT'],
    ['2002:5db8:d822::', false, '6to4 с публичным v4'],
    // ULA / link-local / site-local / multicast / discard
    ['fc00::', true, 'ULA первый'],
    ['fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true, 'ULA последний'],
    ['fd00:ec2::254', true, 'metadata AWS IPv6'],
    ['fbff::1', true, 'перед ULA (вне 2000::/3)'],
    ['fe80::1', true, 'link-local'],
    ['febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true, 'link-local последний'],
    ['fe80::1%eth0', true, 'link-local с zone id'],
    ['fec0::1', true, 'site-local (устарел)'],
    ['ff00::', true, 'multicast первый'],
    ['ff02::1', true, 'multicast all-nodes'],
    ['ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', true, 'последний адрес'],
    ['100::', true, 'discard-only'],
    ['100::1', true, 'discard-only'],
    // специальные блоки внутри 2000::/3
    ['2001::', true, 'Teredo / IETF 2001::/23 первый'],
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', true, 'Teredo'],
    ['2001:2::1', true, 'benchmarking'],
    ['2001:10::1', true, 'ORCHID'],
    ['2001:1ff:ffff::1', true, '2001::/23 последний'],
    ['2001:200::', false, 'сразу за 2001::/23 (выдан APNIC)'],
    ['2001:db7::1', false, 'перед документацией'],
    ['2001:db8::', true, 'документация первый'],
    ['2001:db8:ffff:ffff:ffff:ffff:ffff:ffff', true, 'документация последний'],
    ['2001:db9::1', false, 'за документацией'],
    ['3fff::', true, 'документация 3fff::/20 первый'],
    ['3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff', true, 'документация 3fff::/20 последний'],
    ['3fff:1000::', false, 'за 3fff::/20'],
    // за пределами 2000::/3 (default deny)
    ['1fff:ffff::', true, 'перед 2000::/3'],
    ['4000::', true, 'за 2000::/3'],
    // публичные
    ['2000::', false, '2000::/3 первый'],
    ['2001:4860:4860::8888', false, 'Google DNS'],
    ['2606:4700:4700::1111', false, 'Cloudflare DNS'],
    ['2a00:1450:4001:81b::200e', false, 'публичный'],
    ['2400:cb00::1', false, 'публичный'],
    // квадратные скобки (как в hostname URL)
    ['[::1]', true, 'в скобках loopback'],
    ['[2606:4700:4700::1111]', false, 'в скобках публичный'],
  ]
  it.each(rows)('%s -> blocked=%s (%s)', (ip, blocked) => {
    expect(isPrivateIp(ip)).toBe(blocked)
  })
})

describe('isBlockedHostname', () => {
  const blocked = [
    'localhost', 'LOCALHOST', 'localhost.', 'foo.localhost', 'a.b.localhost',
    'metadata.google.internal', 'metadata.google.internal.', 'x.internal', 'printer.local', 'router.lan',
    'host.localdomain', 'router.home.arpa', 'home.arpa', 'x.intranet', 'x.corp', 'x.home', 'x.private',
    'metadata.goog', 'metadata', 'intranet', 'a..b', '.example.com', '',
    'METADATA.GOOGLE.INTERNAL', 'Foo.LOCALHOST', 'Printer.Local',
  ]
  it.each(blocked)('%j закрыт', (name) => {
    expect(isBlockedHostname(name)).toBe(true)
  })

  const allowed = [
    'example.com', 'EXAMPLE.COM.', 'local.example.com', 'internal.example.com', 'localhost.example.com',
    'notlocalhost.com', 'mylocal.com', 'lan.kz', 'shop.home-store.kz', 'metadata.example.com',
    'x.corporate.kz', 'api.privately.kz', 'google.internal.example.org',
    // суффикс совпадает только как часть метки, не как целая метка
    'a.notlocalhost', 'a.notinternal', 'a.nolocal', 'a.mylan', 'a.myhome', 'a.xcorp',
  ]
  it.each(allowed)('%j разрешён (суффикс совпадает только по границе метки)', (name) => {
    expect(isBlockedHostname(name)).toBe(false)
  })
})

describe('isSafeWebhookUrl: форма URL', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // DNS подменён на ПУБЛИЧНЫЙ адрес: если защита формы пропадёт, URL пройдёт
  // как безопасный, и тест упадёт. Плюс проверяем, что до DNS дело не дошло.
  const rejectedWithoutDns: Array<[string, string]> = [
    ['http://example.com/hook', 'http вместо https'],
    ['ftp://example.com/hook', 'ftp'],
    ['file:///etc/passwd', 'file'],
    ['gopher://example.com/', 'gopher'],
    ['javascript:alert(1)', 'javascript'],
    ['//example.com/hook', 'без схемы, с //'],
    ['example.com/hook', 'без схемы'],
    ['', 'пустая строка'],
    ['https://user:pass@example.com/hook', 'логин и пароль'],
    ['https://user@example.com/hook', 'только логин'],
    ['https://:pass@example.com/hook', 'только пароль'],
    ['https://example.com:80/hook', 'порт 80'],
    ['https://example.com:8080/hook', 'порт 8080'],
    ['https://example.com:22/hook', 'порт 22'],
    ['https://example.com:5432/hook', 'порт Postgres'],
    ['https://example.com:6379/hook', 'порт Redis'],
    ['https://example.com:444/hook', 'рядом с 443'],
    ['https://example.com:4430/hook', 'начинается как 443'],
    ['https://example.com:65535/hook', 'максимальный порт'],
    ['https://localhost/hook', 'localhost'],
    ['https://LOCALHOST/hook', 'localhost в верхнем регистре'],
    ['https://localhost./hook', 'localhost с точкой на конце'],
    ['https://app.localhost/hook', '*.localhost'],
    ['https://metadata.google.internal/computeMetadata/v1/', 'metadata GCP'],
    ['https://metadata.google.internal./computeMetadata/v1/', 'metadata GCP с точкой на конце'],
    ['https://metadata.goog/', 'metadata.goog'],
    ['https://db.internal/', '*.internal'],
    ['https://printer.local/', '*.local'],
    ['https://router.lan/', '*.lan'],
    ['https://intranet/', 'имя без точки'],
    ['https://metadata/', 'metadata без точки'],
    ['https://2130706433.', 'числовое имя с точкой на конце, это не домен'],
  ]
  it.each(rejectedWithoutDns)('%j отклонён (%s)', async (url) => {
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any)
    expect(await isSafeWebhookUrl(url)).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  // Каждое значение обёрнуто в строку таблицы: иначе it.each развернул бы
  // массив в аргументы, и последний случай стал бы обычной строкой.
  it.each([[undefined], [null], [123], [true], [{}], [['https://example.com/hook']]])(
    'не-строка %j отклоняется (массив new URL() иначе превратил бы в строку)',
    async (value) => {
      const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any)
      expect(await isSafeWebhookUrl(value)).toBe(false)
      expect(lookup).not.toHaveBeenCalled()
    },
  )
})

describe('isSafeWebhookUrl: IP-литералы в URL, без обращения к DNS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const blockedLiterals: Array<[string, string]> = [
    ['https://127.0.0.1/', 'loopback'],
    ['https://127.255.255.255/', 'loopback последний'],
    ['https://0.0.0.0/', 'unspecified'],
    ['https://10.0.0.1/', '10/8'],
    ['https://100.64.0.1/', 'CGNAT'],
    ['https://100.100.100.200/', 'metadata Alibaba'],
    ['https://169.254.169.254/latest/meta-data/', 'metadata AWS/GCP/Azure'],
    ['https://172.16.0.1/', '172.16/12'],
    ['https://192.168.0.1/', '192.168/16'],
    ['https://192.0.0.192/', 'metadata Oracle'],
    ['https://198.18.0.1/', 'benchmarking'],
    ['https://224.0.0.1/', 'multicast'],
    ['https://255.255.255.255/', 'broadcast'],
    ['https://2130706433/', 'десятичная запись 127.0.0.1'],
    ['https://0177.0.0.1/', 'восьмеричная запись'],
    ['https://0x7f.1/', 'hex + короткая запись'],
    ['https://127.1/', 'короткая запись'],
    ['https://0x7f000001/', 'одно hex-число'],
    ['https://017700000001/', 'одно восьмеричное число'],
    ['https://127.0.0.1./', 'точка на конце'],
    ['https://%31%32%37.0.0.1/', 'percent-encoding в хосте'],
    ['https://１２７.０.０.１/', 'полноширинные цифры'],
    ['https://0/', 'ноль'],
    ['https://0x/', 'пустой hex'],
    ['https://2852039166/', 'metadata десятичной записью'],
    ['https://0251.0376.0251.0376/', 'metadata восьмеричной записью'],
    ['https://10.1/', '10.0.0.1 короткой записью'],
    ['https://172.16.1/', '172.16.0.1 в три части'],
    ['https://127.0.0.1:8443/', 'loopback на разрешённом порту'],
    ['https://[::1]/', 'IPv6 loopback'],
    ['https://[0:0:0:0:0:0:0:1]/', 'IPv6 loopback полной записью'],
    ['https://[::1]:8443/', 'IPv6 loopback на разрешённом порту'],
    ['https://[::]/', 'IPv6 unspecified'],
    ['https://[::ffff:127.0.0.1]/', 'mapped dotted'],
    ['https://[::ffff:7f00:1]/', 'mapped hex'],
    ['https://[::FFFF:7F00:1]/', 'mapped hex в верхнем регистре'],
    ['https://[0:0:0:0:0:ffff:7f00:1]/', 'mapped полной записью'],
    ['https://[::ffff:169.254.169.254]/', 'mapped metadata'],
    ['https://[::127.0.0.1]/', 'IPv4-compatible'],
    ['https://[64:ff9b::127.0.0.1]/', 'NAT64 dotted'],
    ['https://[64:ff9b::7f00:1]/', 'NAT64 hex'],
    ['https://[2002:7f00:1::]/', '6to4 с loopback'],
    ['https://[fc00::1]/', 'ULA'],
    ['https://[fd00:ec2::254]/', 'metadata AWS IPv6'],
    ['https://[fe80::1]/', 'link-local'],
    ['https://[fe80::1%25eth0]/', 'link-local с zone id'],
    ['https://[ff02::1]/', 'multicast'],
    ['https://[2001:db8::1]/', 'документация'],
    ['https://[100::1]/', 'discard-only'],
  ]
  it.each(blockedLiterals)('%j отклонён (%s)', async (url) => {
    const lookup = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS не должен вызываться'))
    expect(await isSafeWebhookUrl(url)).toBe(false)
    expect(lookup).not.toHaveBeenCalled()
  })

  const publicLiterals: Array<[string, string]> = [
    ['https://8.8.8.8/', 'публичный IPv4'],
    ['https://93.184.216.34/hook', 'публичный IPv4 с путём'],
    ['https://1.1.1.1:8443/', 'публичный IPv4, порт 8443'],
    ['https://010.8.8.8/', 'восьмеричный 010 = 8, публичный 8.8.8.8'],
    ['https://0x08080808/', 'публичный 8.8.8.8 одним hex'],
    ['https://134744072/', 'публичный 8.8.8.8 одним числом'],
    ['https://[2606:4700:4700::1111]/', 'публичный IPv6'],
    ['https://[2001:4860:4860::8888]/', 'публичный IPv6'],
    ['https://[::ffff:8.8.8.8]/', 'mapped публичный'],
    ['https://[64:ff9b::808:808]/', 'NAT64 публичный'],
    ['https://[2002:5db8:d822::]/', '6to4 с публичным v4'],
  ]
  it.each(publicLiterals)('%j разрешён (%s)', async (url) => {
    const lookup = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS не должен вызываться'))
    expect(await isSafeWebhookUrl(url)).toBe(true)
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('isSafeWebhookUrl: имена хостов и порты, адрес из DNS публичный', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const allowed: Array<[string, string, string]> = [
    ['https://example.com/webhook', 'example.com', 'обычный URL'],
    ['https://example.com:443/hook', 'example.com', 'явный порт 443'],
    ['https://example.com:8443/hook', 'example.com', 'порт 8443'],
    ['https://EXAMPLE.com./hook', 'example.com.', 'регистр и точка на конце'],
    ['https://local.example.com/', 'local.example.com', 'local не в конце имени'],
    ['https://localhost.example.com/', 'localhost.example.com', 'localhost не в конце имени'],
    ['https://internal.example.com/', 'internal.example.com', 'internal не в конце имени'],
    ['https://shop.example.kz/api/pay?x=1#frag', 'shop.example.kz', 'путь, запрос и фрагмент'],
  ]
  it.each(allowed)('%j разрешён (%s)', async (url, hostname) => {
    const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any)
    expect(await isSafeWebhookUrl(url)).toBe(true)
    // all: true, иначе проверялся бы только первый из адресов хоста
    expect(lookup).toHaveBeenCalledWith(hostname, { all: true })
  })
})

describe('isSafeWebhookUrl: ответ DNS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const URL_UNDER_TEST = 'https://shop.example.kz/hook'
  const answers: Array<[string, string[], boolean]> = [
    ['только публичный v4', ['93.184.216.34'], true],
    ['публичный v4 и публичный v6', ['93.184.216.34', '2606:4700:4700::1111'], true],
    ['mapped публичный', ['::ffff:8.8.8.8'], true],
    ['только приватный', ['10.0.0.5'], false],
    ['публичный, затем приватный', ['93.184.216.34', '10.0.0.5'], false],
    ['приватный, затем публичный', ['10.0.0.5', '93.184.216.34'], false],
    ['публичный v4 и loopback v6', ['93.184.216.34', '::1'], false],
    ['публичный v4 и CGNAT', ['93.184.216.34', '100.64.0.1'], false],
    ['публичный v4 и metadata', ['93.184.216.34', '169.254.169.254'], false],
    ['публичный v4 и ULA v6', ['93.184.216.34', 'fd00:ec2::254'], false],
    ['mapped metadata hex', ['::ffff:a9fe:a9fe'], false],
    ['mapped loopback hex', ['::ffff:7f00:1'], false],
    ['NAT64 с приватным v4', ['64:ff9b::a00:1'], false],
    ['6to4 с loopback', ['2002:7f00:1::'], false],
    ['адрес не разобрался', ['not-an-ip'], false],
    ['пустой ответ', [], false],
  ]
  it.each(answers)('%s -> safe=%s', async (_note, addresses, safe) => {
    vi.spyOn(dns, 'lookup').mockResolvedValue(
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as any,
    )
    expect(await isSafeWebhookUrl(URL_UNDER_TEST)).toBe(safe)
  })

  it('старая форма ответа (один объект, не массив) тоже разбирается', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '10.0.0.5', family: 4 } as any)
    expect(await isSafeWebhookUrl(URL_UNDER_TEST)).toBe(false)
    vi.spyOn(dns, 'lookup').mockResolvedValue({ address: '93.184.216.34', family: 4 } as any)
    expect(await isSafeWebhookUrl(URL_UNDER_TEST)).toBe(true)
  })

  it.each(['ENOTFOUND', 'ETIMEOUT', 'ESERVFAIL'])('ошибка DNS %s -> закрыто', async (code) => {
    vi.spyOn(dns, 'lookup').mockRejectedValue(Object.assign(new Error(code), { code }))
    expect(await isSafeWebhookUrl(URL_UNDER_TEST)).toBe(false)
  })
})

describe('isWebhookUrlShapeSafe: проверка формы без DNS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const rows: Array<[unknown, boolean]> = [
    ['https://example.com/hook', true],
    ['https://example.com:8443/hook', true],
    ['https://8.8.8.8/', true],
    ['https://[2606:4700:4700::1111]/', true],
    ['http://example.com/hook', false],
    ['127.0.0.1', false],
    ['https://u:p@example.com/', false],
    ['https://example.com:8080/', false],
    ['https://foo.internal/', false],
    ['https://127.1/', false],
    ['https://[::ffff:7f00:1]/', false],
    [undefined, false],
    [['https://example.com/hook'], false],
  ]
  it.each(rows)('%j -> %s, DNS не вызывается', (value, expected) => {
    const lookup = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('DNS не должен вызываться'))
    expect(isWebhookUrlShapeSafe(value)).toBe(expected)
    expect(lookup).not.toHaveBeenCalled()
  })
})
