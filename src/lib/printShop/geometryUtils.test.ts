import { describe, it, expect } from 'vitest'
import { flattenOpentypePath, groupIntoShapesWithHoles } from './geometryUtils'

describe('flattenOpentypePath', () => {
  it('splits M/L/Z commands into closed polyline subpaths', () => {
    const commands = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
      { type: 'M', x: 2, y: 2 },
      { type: 'L', x: 4, y: 2 },
      { type: 'Z' },
    ] as any
    const result = flattenOpentypePath(commands)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
    expect(result[1]).toEqual([{ x: 2, y: 2 }, { x: 4, y: 2 }])
  })

  it('flattens a C (cubic bezier) command into intermediate points', () => {
    const commands = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 0, y1: 10, x2: 10, y2: 10, x: 10, y: 0 },
      { type: 'Z' },
    ] as any
    const result = flattenOpentypePath(commands, 4)
    // start point + 4 sampled segment endpoints (t=0.25,0.5,0.75,1.0)
    expect(result[0]).toHaveLength(5)
    expect(result[0][0]).toEqual({ x: 0, y: 0 })
    expect(result[0][4].x).toBeCloseTo(10, 5)
    expect(result[0][4].y).toBeCloseTo(0, 5)
  })
})

describe('groupIntoShapesWithHoles', () => {
  it('nests a smaller contained subpath as a hole of the larger one', () => {
    const outer: any[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const hole: any[] = [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }]
    const result = groupIntoShapesWithHoles([outer, hole])
    expect(result).toHaveLength(1)
    expect(result[0].outer).toEqual(outer)
    expect(result[0].holes).toEqual([hole])
  })

  it('keeps two disjoint subpaths (e.g. two separate letters) as two independent outers', () => {
    const a: any[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }]
    const b: any[] = [{ x: 20, y: 0 }, { x: 25, y: 0 }, { x: 25, y: 5 }]
    const result = groupIntoShapesWithHoles([a, b])
    expect(result).toHaveLength(2)
    expect(result.map(r => r.holes.length)).toEqual([0, 0])
  })
})
