import { describe, it, expect } from 'vitest'
import { formatDigest, type DigestData } from './dailyDigest'

// Intl.NumberFormat('ru-KZ') separates thousands with U+00A0 (non-breaking
// space), not a plain space. Normalizing here keeps the expectations below
// readable instead of hiding an invisible character inside every literal.
function plain(text: string | null): string {
  return (text || '').replace(/ /g, ' ')
}

const quiet: DigestData = {
  pricesUpdated: 0,
  heldAtFloor: 0,
  storefrontOrders: 0,
  storefrontRevenue: 0,
  walletSpent: 0,
  walletBalance: 5000,
}

describe('formatDigest', () => {
  it('stays silent on a genuinely quiet day with a healthy balance', () => {
    expect(formatDigest(quiet)).toBeNull()
  })

  it('still speaks up on a quiet day when the balance is about to stop everything', () => {
    const result = formatDigest({ ...quiet, walletBalance: 40 })
    expect(result).toContain('Баланс кошелька')
    expect(plain(result)).toContain('40 ₸')
    expect(result).toContain('останавливаются')
  })

  it('reports repricer activity', () => {
    const result = formatDigest({ ...quiet, pricesUpdated: 12, heldAtFloor: 3 })
    expect(result).toContain('изменено цен: <b>12</b>')
    expect(result).toContain('упёрлись в минимум: <b>3</b>')
  })

  it('omits the held-at-floor half when nothing hit the floor', () => {
    const result = formatDigest({ ...quiet, pricesUpdated: 5 })
    expect(result).toContain('изменено цен: <b>5</b>')
    expect(result).not.toContain('упёрлись в минимум')
  })

  it('reports storefront orders with their revenue', () => {
    const result = formatDigest({ ...quiet, storefrontOrders: 2, storefrontRevenue: 6400 })
    expect(result).toContain('заказов: <b>2</b>')
    expect(plain(result)).toContain('6 400 ₸')
  })

  it('reports wallet spend', () => {
    const result = formatDigest({ ...quiet, walletSpent: 85 })
    expect(plain(result)).toContain('Списано с кошелька: <b>85 ₸</b>')
  })

  it('shows the balance as a plain line when it is healthy', () => {
    const result = formatDigest({ ...quiet, pricesUpdated: 1, walletBalance: 5000 })
    expect(plain(result)).toContain('Баланс кошелька: 5 000 ₸')
    expect(result).not.toContain('останавливаются')
  })

  it('combines every section into one message', () => {
    const result = formatDigest({
      pricesUpdated: 7,
      heldAtFloor: 1,
      storefrontOrders: 3,
      storefrontRevenue: 12000,
      walletSpent: 35,
      walletBalance: 465,
    })
    expect(result).toContain('Демпинг')
    expect(result).toContain('Витрина')
    expect(result).toContain('Списано с кошелька')
    expect(result).toContain('Ваш магазин за сутки')
  })
})
