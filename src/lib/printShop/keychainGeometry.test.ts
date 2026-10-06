import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'
import { buildKeychainGeometries } from './keychainGeometry'

let font: opentype.Font

beforeAll(() => {
  const buf = readFileSync(path.resolve(__dirname, '../../../public/fonts/print-shop/pt-sans.ttf'))
  font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('buildKeychainGeometries', () => {
  it('produces non-empty base and text geometries for a simple Cyrillic name', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Айгерим', size: 'M', ringAtEnd: false })
    expect(baseGeometry.attributes.position.count).toBeGreaterThan(0)
    expect(textGeometry.attributes.position.count).toBeGreaterThan(0)
  })

  it('base geometry bounding box is larger than text geometry bounding box (border adds margin)', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Миша', size: 'M', ringAtEnd: false })
    baseGeometry.computeBoundingBox()
    textGeometry.computeBoundingBox()
    const baseSize = baseGeometry.boundingBox!.max.x - baseGeometry.boundingBox!.min.x
    const textSize = textGeometry.boundingBox!.max.x - textGeometry.boundingBox!.min.x
    expect(baseSize).toBeGreaterThan(textSize)
  })

  it('text geometry sits above the base (its min Z equals base thickness)', () => {
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'A', size: 'S', ringAtEnd: false })
    baseGeometry.computeBoundingBox()
    textGeometry.computeBoundingBox()
    expect(textGeometry.boundingBox!.min.z).toBeCloseTo(baseGeometry.boundingBox!.max.z, 1)
  })

  it('placing the ring at the end moves it to the opposite side from the default start placement', () => {
    const start = buildKeychainGeometries({ font, text: 'Ким', size: 'S', ringAtEnd: false })
    const end = buildKeychainGeometries({ font, text: 'Ким', size: 'S', ringAtEnd: true })
    start.baseGeometry.computeBoundingBox()
    end.baseGeometry.computeBoundingBox()
    // Same overall name, same size preset -> same total width either way,
    // but the ring is a fixed-size circle at one end, so total extent must
    // differ in WHICH side has the extra bump if start vs end actually
    // differ. Simplest robust check: the two bounding boxes are not
    // byte-identical (the ring really moved somewhere).
    expect(start.baseGeometry.boundingBox).not.toEqual(end.baseGeometry.boundingBox)
  })

  it('throws a clear error for empty text instead of producing a degenerate mesh', () => {
    expect(() => buildKeychainGeometries({ font, text: '', size: 'S', ringAtEnd: false })).toThrow(/text/i)
  })

  // --- Added beyond the task brief -------------------------------------------
  // The five tests above all passed against an implementation that emitted
  // VERTICALLY MIRRORED letters (opentype.js's getPath() is Y-down, three.js is
  // Y-up) and never cut the key-ring hole at all. Both were only caught by
  // manual inspection, so they get explicit regression cover here.

  it('orients glyphs Y-up: a letter with no descender sits ON the baseline and rises to positive y', () => {
    // "А" has a flat bottom on the baseline and no descender, so in three.js
    // Y-up space it must occupy y in [0, capHeight]. If opentype.js's native
    // Y-down output leaks through, this comes out as [-capHeight, 0] instead.
    const { textGeometry } = buildKeychainGeometries({ font, text: 'А', size: 'L', ringAtEnd: false })
    textGeometry.computeBoundingBox()
    const bb = textGeometry.boundingBox!
    expect(bb.min.y).toBeCloseTo(0, 2)
    expect(bb.max.y).toBeGreaterThan(5)
  })

  it('orients glyphs Y-up: a descender hangs BELOW the baseline, the cap height reaches further above it', () => {
    // "Ар" spans cap height above the baseline and the descender of "р" below.
    const { textGeometry } = buildKeychainGeometries({ font, text: 'Ар', size: 'L', ringAtEnd: false })
    textGeometry.computeBoundingBox()
    const bb = textGeometry.boundingBox!
    expect(bb.min.y).toBeLessThan(0)
    expect(bb.max.y).toBeGreaterThan(0)
    expect(bb.max.y).toBeGreaterThan(Math.abs(bb.min.y))
  })

  it('puts the ring on the LEFT of the text for ringAtEnd=false and on the RIGHT for ringAtEnd=true', () => {
    // Stronger than the "bounding boxes differ" check above: the ring is a
    // large fixed bump, so the base must overhang the text far more on the ring
    // side than on the plain-border side, and the two cases must be mirrored.
    const overhangs = (ringAtEnd: boolean) => {
      const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Ким', size: 'M', ringAtEnd })
      baseGeometry.computeBoundingBox()
      textGeometry.computeBoundingBox()
      const b = baseGeometry.boundingBox!, t = textGeometry.boundingBox!
      return { left: t.min.x - b.min.x, right: b.max.x - t.max.x }
    }
    const start = overhangs(false)
    const end = overhangs(true)
    expect(start.left).toBeGreaterThan(start.right * 2)
    expect(end.right).toBeGreaterThan(end.left * 2)
    expect(start.left).toBeCloseTo(end.right, 3)
    expect(start.right).toBeCloseTo(end.left, 3)
  })

  it('builds finite, non-empty geometry with a placed ring hole across sizes, ring sides and name lengths', () => {
    // buildKeychainGeometries throws if it cannot attach the key-ring hole to a
    // base contour, so "did not throw" here also asserts the hole was placed.
    for (const text of ['А', 'Ким', 'Айгерим', 'Нурсултан Назарбаев']) {
      for (const size of ['S', 'M', 'L'] as const) {
        for (const ringAtEnd of [false, true]) {
          const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text, size, ringAtEnd })
          for (const geometry of [baseGeometry, textGeometry]) {
            const arr = geometry.attributes.position.array
            expect(arr.length).toBeGreaterThan(0)
            expect(Array.from(arr).every(Number.isFinite)).toBe(true)
          }
        }
      }
    }
  })
})
