import { describe, it, expect } from 'vitest'
import { SIZE_PRESETS, priceForSize } from './pricing'

describe('pricing', () => {
  it('has all three sizes with positive dimensions', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const p = SIZE_PRESETS[size]
      expect(p.fontSizeMm).toBeGreaterThan(0)
      expect(p.baseThicknessMm).toBeGreaterThan(0)
      expect(p.textThicknessMm).toBeGreaterThan(0)
      expect(p.borderMm).toBeGreaterThan(0)
      expect(p.ringHoleDiameterMm).toBeGreaterThan(0)
      expect(p.ringWallMm).toBeGreaterThan(0)
    }
  })

  it('prices strictly increase from S to M to L', () => {
    expect(priceForSize('S')).toBeLessThan(priceForSize('M'))
    expect(priceForSize('M')).toBeLessThan(priceForSize('L'))
  })
})
