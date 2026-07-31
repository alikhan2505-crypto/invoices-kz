import { describe, it, expect, vi, afterEach } from 'vitest'
import dns from 'dns/promises'
import { isPrivateIp, isSafeWebhookUrl } from './webhookSafety'

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
