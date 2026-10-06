import { describe, it, expect } from 'vitest'
import { SIZE_PRESETS, priceForSize, RING_SIZE_PRESETS, DEFAULT_RING_SIZE } from './pricing'

describe('pricing', () => {
  it('has all three sizes with positive dimensions', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const p = SIZE_PRESETS[size]
      expect(p.fontSizeMm).toBeGreaterThan(0)
      expect(p.baseThicknessMm).toBeGreaterThan(0)
      expect(p.textThicknessMm).toBeGreaterThan(0)
      expect(p.borderMm).toBeGreaterThan(0)
      expect(p.ringDistanceMm).toBeGreaterThan(0)
    }
  })

  it('prices strictly increase from S to M to L', () => {
    expect(priceForSize('S')).toBeLessThan(priceForSize('M'))
    expect(priceForSize('M')).toBeLessThan(priceForSize('L'))
  })
})

describe('RING_SIZE_PRESETS', () => {
  it('has all three ring sizes with positive dimensions, strictly increasing', () => {
    for (const size of ['S', 'M', 'L'] as const) {
      const p = RING_SIZE_PRESETS[size]
      expect(p.holeDiameterMm).toBeGreaterThan(0)
      expect(p.wallMm).toBeGreaterThan(0)
    }
    expect(RING_SIZE_PRESETS.S.holeDiameterMm).toBeLessThan(RING_SIZE_PRESETS.M.holeDiameterMm)
    expect(RING_SIZE_PRESETS.M.holeDiameterMm).toBeLessThan(RING_SIZE_PRESETS.L.holeDiameterMm)
  })

  it('default ring size is a valid key', () => {
    expect(RING_SIZE_PRESETS[DEFAULT_RING_SIZE]).toBeDefined()
  })
})
