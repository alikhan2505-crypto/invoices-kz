import { describe, it, expect } from 'vitest'
import {
  splitPlanPayment, MIN_KASPI_REMAINDER_TENGE,
  walletChoiceBounds, resolveWalletPart, snapWalletAmount, defaultWalletAmount, walletQuickAmounts,
} from './planActivation'

describe('walletChoiceBounds', () => {
  it('floors the balance and treats junk as zero', () => {
    expect(walletChoiceBounds(5990, 1164.9)).toEqual({ balance: 1164, price: 5990, maxPartial: 1164, canPayFull: false, max: 1164 })
    for (const bad of [0, -5, null, undefined, 'abc', NaN]) {
      const b = walletChoiceBounds(5990, bad as never)
      expect(b.balance).toBe(0)
      expect(b.maxPartial).toBe(0)
      expect(b.canPayFull).toBe(false)
    }
  })

  it('keeps the Kaspi minimum when the balance is just under the price', () => {
    expect(walletChoiceBounds(5990, 5950)).toMatchObject({ maxPartial: 5890, canPayFull: false, max: 5890 })
  })

  it('lets the wallet cover the whole price', () => {
    expect(walletChoiceBounds(5990, 5990)).toMatchObject({ maxPartial: 5890, canPayFull: true, max: 5990 })
    expect(walletChoiceBounds(5990, 20000)).toMatchObject({ maxPartial: 5890, canPayFull: true, max: 5990 })
  })
})

describe('resolveWalletPart', () => {
  const price = 5990
  const ok = (balance: number, requested: unknown) => resolveWalletPart(price, balance, requested)

  it('zero means Kaspi only, whatever the balance', () => {
    expect(ok(1164, 0)).toEqual({ ok: true, mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
    expect(ok(0, 0)).toEqual({ ok: true, mode: 'kaspi_only', wallet: 0, kaspi: 5990 })
  })

  it('accepts any whole amount from 1 up to price minus the Kaspi minimum', () => {
    expect(ok(1164, 1)).toEqual({ ok: true, mode: 'partial', wallet: 1, kaspi: 5989 })
    expect(ok(1164, 500)).toEqual({ ok: true, mode: 'partial', wallet: 500, kaspi: 5490 })
    expect(ok(1164, 1164)).toEqual({ ok: true, mode: 'partial', wallet: 1164, kaspi: 4826 })
    expect(ok(20000, 5890)).toEqual({ ok: true, mode: 'partial', wallet: 5890, kaspi: 100 })
  })

  it('a user whose balance covers the price may still choose less (the point of the feature)', () => {
    expect(ok(20000, 2000)).toEqual({ ok: true, mode: 'partial', wallet: 2000, kaspi: 3990 })
  })

  it('the full price is wallet_full only when the balance covers it', () => {
    expect(ok(5990, 5990)).toEqual({ ok: true, mode: 'wallet_full', wallet: 5990, kaspi: 0 })
    expect(ok(20000, 5990)).toEqual({ ok: true, mode: 'wallet_full', wallet: 5990, kaspi: 0 })
    expect(ok(5989, 5990)).toMatchObject({ ok: false, reason: 'too_much' })
  })

  it('rejects the gap where Kaspi would get less than the minimum', () => {
    for (const w of [5891, 5900, 5989]) {
      expect(ok(20000, w)).toEqual({ ok: false, reason: 'remainder_too_small', max: 5890, canPayFull: true })
    }
    expect(ok(5960, 5950)).toEqual({ ok: false, reason: 'remainder_too_small', max: 5890, canPayFull: false })
  })

  it('rejects more than the balance or more than the price, never clamps', () => {
    expect(ok(1164, 1165)).toEqual({ ok: false, reason: 'too_much', max: 1164, canPayFull: false })
    expect(ok(20000, 5991)).toMatchObject({ ok: false, reason: 'too_much' })
    expect(ok(20000, 1e9)).toMatchObject({ ok: false, reason: 'too_much' })
  })

  it('balance is floored: 1164.9 allows 1164 but not 1165', () => {
    expect(resolveWalletPart(price, 1164.9, 1164)).toMatchObject({ ok: true, wallet: 1164 })
    expect(resolveWalletPart(price, 1164.9, 1165)).toMatchObject({ ok: false, reason: 'too_much' })
  })

  it('rejects anything that is not a whole non-negative number', () => {
    const junk: unknown[] = [-1, -0.5, 0.5, 1.5, 1000.0001, NaN, Infinity, -Infinity, '1000', '', '0', null, undefined, true, [], {}, 2 ** 53]
    for (const v of junk) {
      expect(ok(20000, v)).toMatchObject({ ok: false, reason: 'invalid' })
    }
  })

  it('a zero or negative balance only allows zero', () => {
    expect(ok(0, 1)).toMatchObject({ ok: false, reason: 'too_much' })
    expect(ok(-100, 1)).toMatchObject({ ok: false, reason: 'too_much' })
  })

  it('wallet + kaspi equals the price for every accepted amount', () => {
    for (const balance of [1, 100, 1164, 5889, 5890, 5950, 5990, 20000]) {
      for (let w = 0; w <= 6100; w += 7) {
        const r = resolveWalletPart(price, balance, w)
        if (r.ok) {
          expect(r.wallet + r.kaspi).toBe(price)
          expect(r.wallet).toBeLessThanOrEqual(Math.floor(balance))
          if (r.mode === 'partial') expect(r.kaspi).toBeGreaterThanOrEqual(MIN_KASPI_REMAINDER_TENGE)
        }
      }
    }
  })

  it('the default split from splitPlanPayment is always an accepted amount', () => {
    for (const balance of [1, 99, 1164, 5890, 5950, 5990, 20000]) {
      const split = splitPlanPayment(price, balance)
      expect(resolveWalletPart(price, balance, split.wallet)).toMatchObject({ ok: true, mode: split.mode, wallet: split.wallet, kaspi: split.kaspi })
      expect(defaultWalletAmount(price, balance)).toBe(split.wallet)
    }
  })

  it('works for the annual price too', () => {
    expect(resolveWalletPart(59900, 1164, 1164)).toEqual({ ok: true, mode: 'partial', wallet: 1164, kaspi: 58736 })
    expect(resolveWalletPart(59900, 60000, 59850)).toMatchObject({ ok: false, reason: 'remainder_too_small', max: 59800 })
  })
})

describe('snapWalletAmount', () => {
  it('clamps into [0, min(balance, price)]', () => {
    expect(snapWalletAmount(5990, 1164, -5)).toBe(0)
    expect(snapWalletAmount(5990, 1164, 99999)).toBe(1164)
    expect(snapWalletAmount(5990, 20000, 99999)).toBe(5990)
    expect(snapWalletAmount(5990, 1164, NaN)).toBe(0)
    expect(snapWalletAmount(5990, 1164, 500.9)).toBe(500)
  })

  it('moves a value from the gap to the nearer edge when the price is reachable', () => {
    expect(snapWalletAmount(5990, 20000, 5900)).toBe(5890)
    expect(snapWalletAmount(5990, 20000, 5960)).toBe(5990)
  })

  it('slider direction decides the jump over the gap (ArrowLeft/ArrowRight must never trap)', () => {
    // Баланс 6000, цена 5990: щель 5891..5989.
    // ArrowLeft от цены: 5989 раньше отскакивал обратно на 5990.
    expect(snapWalletAmount(5990, 6000, 5989, 5990)).toBe(5890)
    // ArrowRight от maxPartial: 5891 уходит на цену.
    expect(snapWalletAmount(5990, 6000, 5891, 5890)).toBe(5990)
    // Перетаскивание ползунка вниз/вверх через щель.
    expect(snapWalletAmount(5990, 6000, 5950, 5990)).toBe(5890)
    expect(snapWalletAmount(5990, 6000, 5930, 5890)).toBe(5990)
    // Без направления остаётся ближайший край, вне щели current ни на что не влияет.
    expect(snapWalletAmount(5990, 6000, 5900)).toBe(5890)
    expect(snapWalletAmount(5990, 6000, 5900, 5900)).toBe(5890)
    expect(snapWalletAmount(5990, 6000, 5000, 5990)).toBe(5000)
    // Цена недостижима: щель всегда к maxPartial, как раньше.
    expect(snapWalletAmount(5990, 5960, 5950, 5890)).toBe(5890)
  })

  it('repeated ArrowLeft from the full price walks down and never gets stuck', () => {
    let amount = defaultWalletAmount(5990, 6000)
    expect(amount).toBe(5990)
    const seen = [amount]
    for (let i = 0; i < 5; i++) {
      amount = snapWalletAmount(5990, 6000, amount - 1, amount)
      seen.push(amount)
    }
    expect(seen).toEqual([5990, 5890, 5889, 5888, 5887, 5886])
    // И обратно вверх: стрелка вправо с maxPartial доходит до цены, дальше упирается в максимум.
    amount = 5890
    amount = snapWalletAmount(5990, 6000, amount + 1, amount)
    expect(amount).toBe(5990)
    expect(snapWalletAmount(5990, 6000, amount + 1, amount)).toBe(5990)
  })

  it('falls back to the largest partial amount when the price is not reachable', () => {
    expect(snapWalletAmount(5990, 5960, 5950)).toBe(5890)
  })

  it('every snapped value is accepted by resolveWalletPart', () => {
    for (const balance of [1, 1164, 5950, 5990, 20000]) {
      for (let raw = -10; raw <= 6100; raw += 13) {
        expect(resolveWalletPart(5990, balance, snapWalletAmount(5990, balance, raw)).ok).toBe(true)
      }
    }
  })
})

describe('walletQuickAmounts', () => {
  it('offers 25% and 50% of the maximum, only valid and below the maximum', () => {
    expect(walletQuickAmounts(5990, 1164)).toEqual([291, 582])
    expect(walletQuickAmounts(5990, 20000)).toEqual([1498, 2995])
    for (const v of walletQuickAmounts(5990, 5950)) {
      expect(resolveWalletPart(5990, 5950, v).ok).toBe(true)
    }
  })

  it('has nothing to offer for an empty wallet', () => {
    expect(walletQuickAmounts(5990, 0)).toEqual([])
    expect(walletQuickAmounts(5990, 1)).toEqual([])
  })
})
