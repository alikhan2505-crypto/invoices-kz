import { describe, it, expect } from 'vitest'
import { offsetOutward } from './offsetContour'

describe('offsetOutward', () => {
  it('grows a single square outward by roughly the given distance', () => {
    const square = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]]
    const result = offsetOutward(square, 2)
    expect(result).toHaveLength(1)
    const xs = result[0].map(p => p.x)
    // Outward by 2mm on each side -> roughly -2..12 on X (rounded corners
    // mean the exact extreme point may be a fraction off, hence the margin).
    expect(Math.min(...xs)).toBeLessThan(-1.5)
    expect(Math.max(...xs)).toBeGreaterThan(11.5)
  })

  it('merges two nearby squares into one contour when the offset bridges the gap', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b = [{ x: 11, y: 0 }, { x: 21, y: 0 }, { x: 21, y: 10 }, { x: 11, y: 10 }]
    const result = offsetOutward([a, b], 3)
    expect(result).toHaveLength(1)
  })

  it('leaves two far-apart squares as two separate contours', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b = [{ x: 100, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 10 }, { x: 100, y: 10 }]
    const result = offsetOutward([a, b], 2)
    expect(result).toHaveLength(2)
  })
})
