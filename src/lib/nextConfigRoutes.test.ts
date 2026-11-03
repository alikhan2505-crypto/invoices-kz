import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

type Header = { key: string; value: string }

describe('next.config: заголовок языка и адреса CFO', () => {
  it('языковые страницы по адресу получают Content-Language, остальные - нет', async () => {
    const rules = (await nextConfig.headers!()) as Array<{ source: string; headers: Header[] }>
    const lang = (source: string) => rules.find(r => r.source === source)?.headers.find(h => h.key === 'Content-Language')?.value
    expect(lang('/tools/kk/:path*')).toBe('kk')
    expect(lang('/tools/en/:path*')).toBe('en')
    expect(lang('/guides/kk/:path*')).toBe('kk')
    // общие заголовки безопасности остались на месте
    const all = rules.find(r => r.source === '/:path*')!
    expect(all.headers.map(h => h.key)).toEqual(expect.arrayContaining(['X-Content-Type-Options', 'Referrer-Policy']))
    expect(all.headers.some(h => h.key === 'Content-Language')).toBe(false)
  })

  it('на cfo.invoices.kz адрес без /cfo ведёт в нужный раздел и только на этом хосте', async () => {
    const redirects = await nextConfig.redirects!()
    const r = redirects.find(x => x.destination === '/cfo/:section')!
    expect(r).toBeTruthy()
    expect(r.has).toEqual([{ type: 'host', value: 'cfo.invoices.kz' }])
    const re = new RegExp(`^${r.source.replace('/:section', '/(?<section>')}$`.replace('(overview|settings|plan|operations|calendar|import)', 'overview|settings|plan|operations|calendar|import)'))
    for (const p of ['overview', 'settings', 'plan', 'operations', 'calendar', 'import']) expect(re.test(`/${p}`)).toBe(true)
    for (const p of ['cfo', 'login', 'settings/x', 'api']) expect(re.test(`/${p}`)).toBe(false)
    expect(r.permanent).toBe(false)
  })
})
