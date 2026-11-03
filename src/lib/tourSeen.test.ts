import { describe, it, expect } from 'vitest'
import { isTourSeen, markTourSeen, type TourSeenEnv } from './tourSeen'

function env(over: Partial<TourSeenEnv> & { store?: Record<string, string>; jar?: { value: string } } = {}) {
  const store = over.store ?? {}
  const jar = over.jar ?? { value: '' }
  const writes: string[] = []
  const e: TourSeenEnv = {
    storage: over.storage === undefined ? { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v } } : over.storage,
    cookie: over.cookie === undefined
      ? { get: () => jar.value, set: c => { writes.push(c); const [pair] = c.split(';'); jar.value = pair } }
      : over.cookie,
    hostname: over.hostname ?? 'invoices.kz',
    secure: over.secure ?? true,
  }
  return { e, store, jar, writes }
}

describe('isTourSeen / markTourSeen', () => {
  it('новый посетитель: тур не показывали; после отметки - показывали', () => {
    const { e } = env()
    expect(isTourSeen('kaspi', [], e)).toBe(false)
    markTourSeen('kaspi', e)
    expect(isTourSeen('kaspi', [], e)).toBe(true)
    expect(isTourSeen('agent', [], e)).toBe(false)
  })

  it('прежний ключ localStorage считается: кто тур уже проходил, второй раз его не увидит', () => {
    const { e } = env({ store: { 'kaspi-tour-done': '2026-10-01T00:00:00Z' } })
    expect(isTourSeen('kaspi', ['kaspi-tour-done'], e)).toBe(true)
    expect(isTourSeen('kaspi', [], e)).toBe(false)
  })

  it('cookie на .invoices.kz общая для поддоменов: отметка с одного адреса видна на другом', () => {
    const jar = { value: '' }
    const first = env({ jar, hostname: 'kaspi.invoices.kz' })
    markTourSeen('kaspi', first.e)
    expect(first.writes[0]).toContain('domain=.invoices.kz')
    // другой адрес: свой localStorage (пустой), cookie та же
    const second = env({ jar, hostname: 'invoices.kz' })
    expect(isTourSeen('kaspi', [], second.e)).toBe(true)
  })

  it('несколько туров в одной cookie, повторная отметка не дублирует', () => {
    const { e, jar } = env()
    markTourSeen('kaspi', e)
    markTourSeen('agent', e)
    markTourSeen('kaspi', e)
    expect(jar.value).toBe('tours_seen=kaspi.agent')
  })

  it('cookie: год, SameSite=Lax, Secure только на https, домен только у invoices.kz', () => {
    const a = env({ hostname: 'invoices.kz', secure: true })
    markTourSeen('kaspi', a.e)
    expect(a.writes[0]).toMatch(/max-age=31536000; SameSite=Lax; domain=\.invoices\.kz; Secure$/)
    const b = env({ hostname: 'localhost', secure: false })
    markTourSeen('kaspi', b.e)
    expect(b.writes[0]).toBe('tours_seen=kaspi; path=/; max-age=31536000; SameSite=Lax')
  })

  it('чужая cookie с похожим именем не принимается за отметку', () => {
    const { e } = env({ jar: { value: 'not_tours_seen=kaspi; other=1' } })
    expect(isTourSeen('kaspi', [], e)).toBe(false)
  })

  it('localStorage бросает (приватный режим), cookie работает: отметка живёт в cookie', () => {
    const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    const { e } = env({ storage: throwing })
    expect(isTourSeen('kaspi', [], e)).toBe(false)
    markTourSeen('kaspi', e)
    expect(isTourSeen('kaspi', [], e)).toBe(true)
  })

  it('хранить негде вообще: считаем «показывали», чтобы подсказка не лезла при каждом заходе', () => {
    expect(isTourSeen('kaspi', [], { storage: null, cookie: null })).toBe(true)
    expect(() => markTourSeen('kaspi', { storage: null, cookie: null })).not.toThrow()
  })
})
