import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getUsdKzt, nbrkDate, parseNbrkUsd, resetUsdRateState } from './usdRate'

// Форма ленты взята из живого ответа nationalbank.kz 31.10.2026; числа вымышленные.
const item = (code: string, rate: string, quant = '1') =>
  `<item><fullname>X</fullname><title>${code}</title><description>${rate}</description><quant>${quant}</quant><index></index><change>0.00</change></item>`
const feed = (...items: string[]) => `<?xml version="1.0"?><rates><date>01.11.2026</date>${items.join('')}</rates>`

describe('parseNbrkUsd', () => {
  it('курс USD из ленты', () => {
    expect(parseNbrkUsd(feed(item('AUD', '319.34'), item('USD', '505.5'), item('EUR', '560')))).toBe(505.5)
  })
  it('делит на номинал', () => {
    expect(parseNbrkUsd(feed(item('USD', '5055', '10')))).toBe(505.5)
  })
  it.each([[undefined], [''], ['<rates></rates>'], [feed(item('EUR', '560'))], [feed(item('USD', 'abc'))], [feed(item('USD', '5'))], [feed(item('USD', '99999'))]])(
    'нет или неправдоподобно (%j): null', v => { expect(parseNbrkUsd(v)).toBeNull() })
})

describe('nbrkDate', () => {
  it('дата по Алматы (UTC+5): после 19:00 UTC уже следующий день', () => {
    expect(nbrkDate(Date.UTC(2026, 10, 1, 12, 0))).toBe('01.11.2026')
    expect(nbrkDate(Date.UTC(2026, 10, 1, 20, 0))).toBe('02.11.2026')
    expect(nbrkDate(Date.UTC(2026, 11, 31, 20, 0))).toBe('01.01.2027')
  })
})

describe('getUsdKzt', () => {
  const fetchMock = vi.fn()
  beforeEach(() => { resetUsdRateState(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
  afterEach(() => vi.unstubAllGlobals())

  it('получает и кэширует на несколько часов', async () => {
    fetchMock.mockImplementation(async () => new Response(feed(item('USD', '505.5')), { status: 200 }))
    expect(await getUsdKzt()).toBe(505.5)
    expect(await getUsdKzt()).toBe(505.5)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/nationalbank\.kz\/rss\/get_rates\.cfm\?fdate=\d{2}\.\d{2}\.\d{4}$/)
  })
  it('сбой: null, и минуту не долбим ленту повторно', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
    expect(await getUsdKzt()).toBeNull()
    expect(await getUsdKzt()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('после истечения срока и сбоя отдаёт прежний курс (до 48 часов), а не «нет курса»', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-01T10:00:00Z'))
      fetchMock.mockImplementationOnce(async () => new Response(feed(item('USD', '505.5')), { status: 200 }))
      expect(await getUsdKzt()).toBe(505.5)
      vi.setSystemTime(new Date('2026-11-01T20:00:00Z')) // срок 6 ч истёк
      fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
      expect(await getUsdKzt()).toBe(505.5)
      vi.setSystemTime(new Date('2026-11-04T10:00:00Z')) // старше 48 ч: не показываем
      expect(await getUsdKzt()).toBeNull()
    } finally { vi.useRealTimers() }
  })
  it('исключение сети: null', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('down') })
    expect(await getUsdKzt()).toBeNull()
  })
})
