import { describe, expect, it } from 'vitest'
import { aggregateToolFunnel, type ToolEventDbRow } from '@/lib/toolEvents/funnel'
import { buildDailyFunnelText } from './report'

const NOW = Date.parse('2026-11-01T18:59:00Z') // конец 01.11 по Алматы
const AT = '2026-11-01T09:00:00Z'

function ev(event: string, tool: string, visitor: string, extra: Partial<ToolEventDbRow> = {}): ToolEventDbRow {
  return { created_at: AT, event, tool, visitor, user_id: null, internal: false, medium: null, ...extra }
}
const funnel = (rows: ToolEventDbRow[]) => aggregateToolFunnel(rows, { days: 1, includeInternal: false, now: NOW })
const base = { label: '01.11 (вс)', signups: 0, signupsPrev: 1, invoices: 0, binWatch: 0, igPosts: [] as { kind: string; at: string }[] }

describe('buildDailyFunnelText', () => {
  it('says plainly when nothing happened', () => {
    const t = buildDailyFunnelText({ ...base, funnel: funnel([]) })
    expect(t).toContain('Сводка за 01.11 (вс)')
    expect(t).toContain('Регистрации: 0 (днём раньше 1)')
    expect(t).toContain('посетителей не было')
    expect(t).toContain('Страница входа: никто не открывал')
    expect(t).toContain('Instagram: публикаций не было')
  })

  it('lists active tools, sources, login steps and the repeat-browser note', () => {
    const rows = [
      ev('view', 'zarplata', 'a', { utm_source: 'chatgpt.com' }), ev('doc', 'zarplata', 'a', { utm_source: 'chatgpt.com' }),
      ev('view', 'avr', 'b'),
      ev('login_open', 'none', 'h'), ev('login_google', 'none', 'h'),
      ...['bot', 'bot', 'bot'].map(() => ev('login_open', 'none', 'bot')),
    ]
    const t = buildDailyFunnelText({ ...base, funnel: funnel(rows), igPosts: [{ kind: 'картинка', at: '17:47' }] })
    expect(t).toContain('2 посетителей, документов 1')
    expect(t).toContain('zarplata: 1 пос., 1 док.')
    expect(t).toContain('avr: 1 пос., 0 док.')
    expect(t).toContain('chatgpt.com 1')
    expect(t).toContain('открыли 1')
    expect(t).toContain('Google 1')
    expect(t).toContain('1 браузеров с 3+ открытиями')
    expect(t).toContain('опубликовано: картинка в 17:47')
  })

  it('shows н/д instead of zero when a count is unavailable', () => {
    const t = buildDailyFunnelText({ ...base, funnel: funnel([]), signups: null, igPosts: null })
    expect(t).toContain('Регистрации: н/д')
    expect(t).toContain('Instagram: н/д')
  })
})
