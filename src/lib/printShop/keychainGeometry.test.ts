import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import opentype from 'opentype.js'
import * as THREE from 'three'
import { buildKeychainGeometries } from './keychainGeometry'
import { flattenOpentypePath, type OpentypeCommand, type Point } from './geometryUtils'
import { PRINT_SHOP_FONTS } from './fonts'
import { SIZE_PRESETS, type KeychainSize } from './pricing'

let font: opentype.Font

function loadFont(id: string): opentype.Font {
  const buf = readFileSync(path.resolve(__dirname, `../../../public/fonts/print-shop/${id}.ttf`))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

beforeAll(() => {
  font = loadFont('pt-sans')
})

// --- Measurement helpers (independent of the implementation under test) ----

/**
 * Exact XY footprint area of an extruded geometry: the side walls are
 * vertical, so they project to zero-area triangles, and the top and bottom
 * caps each project to the full footprint -- hence half the sum of the
 * ABSOLUTE projected triangle areas. Taking absolute values means overlapping
 * cap triangles (which a wrongly grouped shape produces) inflate the number
 * instead of cancelling out.
 */
function footprintArea(geometry: THREE.BufferGeometry): number {
  const p = geometry.attributes.position
  let sum = 0
  for (let t = 0; t < p.count; t += 3) {
    const ax = p.getX(t), ay = p.getY(t)
    sum += Math.abs((p.getX(t + 1) - ax) * (p.getY(t + 2) - ay) - (p.getX(t + 2) - ax) * (p.getY(t + 1) - ay)) / 2
  }
  return sum / 2
}

/** Signed volume of a closed triangle mesh (divergence theorem). */
function meshVolume(geometry: THREE.BufferGeometry): number {
  const p = geometry.attributes.position
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let v = 0
  for (let t = 0; t < p.count; t += 3) {
    a.set(p.getX(t), p.getY(t), p.getZ(t))
    b.set(p.getX(t + 1), p.getY(t + 1), p.getZ(t + 1))
    c.set(p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2))
    v += a.dot(c.clone().cross(b)) / 6
  }
  return Math.abs(v)
}

/**
 * Precomputes a geometry's TOP CAP triangles once: a single
 * computeBoundingBox() call plus a single walk over every triangle to find
 * the ones lying in the top plane. Callers that need intervals at MANY
 * scanlines against the same geometry (e.g. glyphFootprintMismatch, which
 * scans ~1500 lines) must extract this once and reuse it, rather than
 * re-walking the whole triangle set and recomputing the bounding box inside
 * the scanline loop -- for a large glyph mesh that quadratic blow-up is what
 * made this suite flaky under parallel load (fast in isolation, timing out
 * under full-suite CPU contention).
 */
function extractTopCapTriangles(geometry: THREE.BufferGeometry): Point[][] {
  const p = geometry.attributes.position
  geometry.computeBoundingBox()
  const topZ = geometry.boundingBox!.max.z
  const tris: Point[][] = []
  for (let t = 0; t < p.count; t += 3) {
    const vs = [0, 1, 2].map(k => ({ x: p.getX(t + k), y: p.getY(t + k), z: p.getZ(t + k) }))
    if (!vs.every(v => Math.abs(v.z - topZ) < 1e-9)) continue
    tris.push(vs.map(v => ({ x: v.x, y: v.y })))
  }
  return tris
}

/**
 * x-intervals that a precomputed set of TOP CAP triangles (see
 * extractTopCapTriangles) covers at scanline y -- i.e. where there is
 * material, read straight off the triangles three.js emitted rather than off
 * the 2D shapes that went in.
 */
function topCapIntervalsFromTriangles(tris: Point[][], y: number): [number, number][] {
  const raw: [number, number][] = []
  for (const vs of tris) {
    const xs: number[] = []
    for (let i = 0; i < 3; i++) {
      const a = vs[i], b = vs[(i + 1) % 3]
      if (a.y === b.y) continue
      if (y < Math.min(a.y, b.y) || y >= Math.max(a.y, b.y)) continue
      xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
    if (xs.length < 2) continue
    raw.push([Math.min(...xs), Math.max(...xs)])
  }
  raw.sort((m, n) => m[0] - n[0])
  const merged: [number, number][] = []
  for (const iv of raw) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1])
    else merged.push([iv[0], iv[1]])
  }
  return merged
}

/**
 * x-intervals that the geometry's TOP CAP actually covers at scanline y.
 * Convenience wrapper for single-scanline callers -- extracts the top-cap
 * triangle set fresh on every call, so callers that query many scanlines
 * against the same geometry should instead call extractTopCapTriangles()
 * once up front and topCapIntervalsFromTriangles() per line.
 */
function topCapIntervals(geometry: THREE.BufferGeometry, y: number): [number, number][] {
  return topCapIntervalsFromTriangles(extractTopCapTriangles(geometry), y)
}

/**
 * x-intervals a font rasterizer would fill at scanline y, under the NONZERO
 * WINDING RULE -- the ground truth for "what shape is this glyph", computed
 * from opentype.js's own path and nothing else.
 */
function nonzeroIntervals(subpaths: Point[][], y: number): [number, number][] {
  const crossings: { x: number; dir: number }[] = []
  for (const sp of subpaths) {
    for (let i = 0; i < sp.length; i++) {
      const a = sp[i], b = sp[(i + 1) % sp.length]
      if (a.y === b.y) continue
      if (y < Math.min(a.y, b.y) || y >= Math.max(a.y, b.y)) continue
      crossings.push({ x: a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x), dir: b.y > a.y ? 1 : -1 })
    }
  }
  crossings.sort((m, n) => m.x - n.x)
  const out: [number, number][] = []
  let w = 0, start = 0
  for (const c of crossings) {
    const was = w
    w += c.dir
    if (was === 0 && w !== 0) start = c.x
    else if (was !== 0 && w === 0) out.push([start, c.x])
  }
  return out
}

const intervalsLength = (ivs: [number, number][]) => ivs.reduce((s, [a, b]) => s + (b - a), 0)

/** Length covered by exactly one of the two interval sets (symmetric difference). */
function symmetricDifferenceLength(a: [number, number][], b: [number, number][]): number {
  const cuts = [...new Set([...a, ...b].flat())].sort((m, n) => m - n)
  const inside = (ivs: [number, number][], x: number) => ivs.some(([lo, hi]) => x > lo && x < hi)
  let diff = 0
  for (let i = 0; i + 1 < cuts.length; i++) {
    const mid = (cuts[i] + cuts[i + 1]) / 2
    if (inside(a, mid) !== inside(b, mid)) diff += cuts[i + 1] - cuts[i]
  }
  return diff
}

/**
 * Compares the TEXT geometry's actual 2D footprint against the nonzero-fill
 * region of the same glyph's raw opentype.js outline, in the same coordinate
 * space (the pipeline reflects the glyph about the x axis, which is a plain
 * mirror and so preserves both area and winding).
 */
function glyphFootprintMismatch(fontId: string, text: string, scanlines = 1500) {
  const f = loadFont(fontId)
  const commands = f.getPath(text, 0, 0, SIZE_PRESETS.L.fontSizeMm).commands as unknown as OpentypeCommand[]
  const truth = flattenOpentypePath(commands).map(sp => [...sp].reverse().map(p => ({ x: p.x, y: -p.y })))
  const { textGeometry } = buildKeychainGeometries({ font: f, text, size: 'L', ringAtEnd: false })
  // Extract the top-cap triangle set ONCE (bounding box + full triangle
  // walk), not once per scanline -- see extractTopCapTriangles.
  const topCapTris = extractTopCapTriangles(textGeometry)

  let minY = Infinity, maxY = -Infinity
  for (const sp of truth) for (const p of sp) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y }
  const dy = (maxY - minY) / scanlines
  let truthArea = 0, misplacedArea = 0
  for (let i = 0; i < scanlines; i++) {
    const y = minY + (i + 0.5) * dy
    const expected = nonzeroIntervals(truth, y)
    const actual = topCapIntervalsFromTriangles(topCapTris, y)
    truthArea += intervalsLength(expected) * dy
    misplacedArea += symmetricDifferenceLength(expected, actual) * dy
  }
  return {
    truthArea,
    geometryArea: footprintArea(textGeometry),
    misplacedPct: (misplacedArea / truthArea) * 100,
    areaErrorPct: (Math.abs(footprintArea(textGeometry) - truthArea) / truthArea) * 100,
  }
}

/**
 * Where buildKeychainGeometries puts the key-ring hole, derived from its own
 * public outputs (the text geometry's bounding box) plus the public size
 * preset -- so the test knows the hole's intended centre without reaching
 * into the implementation.
 */
function ringHoleCentre(textGeometry: THREE.BufferGeometry, size: KeychainSize, ringAtEnd: boolean) {
  const preset = SIZE_PRESETS[size]
  textGeometry.computeBoundingBox()
  const bb = textGeometry.boundingBox!
  const ringRadius = preset.ringHoleDiameterMm / 2 + preset.ringWallMm
  return {
    x: ringAtEnd ? bb.max.x + preset.ringDistanceMm + ringRadius : bb.min.x - preset.ringDistanceMm - ringRadius,
    y: (bb.min.y + bb.max.y) / 2,
    holeRadius: preset.ringHoleDiameterMm / 2,
    ringRadius,
  }
}

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

  // --- Letter shapes must match the font's own nonzero-winding fill --------
  // Fonts draw the same glyph two different ways, and both are correct under
  // the nonzero rule: pt-sans's "А" is an outline plus an OPPOSITE-winding
  // counter (subpath areas +67.10 / -5.89), while montserrat's is a UNION of
  // SAME-winding pieces (+82.38 / +18.59 -- a chevron plus a crossbar).
  // Grouping subpaths by bounding-box containment cannot tell those apart and
  // subtracted the crossbar, which produced a wrong-but-plausible "А" for six
  // of the twenty fonts. Measured before the fix: 42.5% (montserrat "А"),
  // 45.7% (unbounded "А"), 86.7% (comfortaa "А"), 51.3% (manrope "А"), 33.2%
  // (exo-2 "В"), 14.3% (tektur "Э") of the glyph's area on the wrong side of
  // the outline, across 29 (font, letter) pairs in total.

  it.each([
    // The six fonts that drew glyphs as same-winding unions, with the letter
    // each one got most wrong.
    ['montserrat', 'А'],
    ['unbounded', 'А'],
    ['comfortaa', 'А'],
    ['manrope', 'А'],
    ['exo-2', 'В'],
    ['tektur', 'Э'],
    // Controls that were already correct and must stay bit-for-bit as good.
    ['pt-sans', 'А'],
    ['caveat', 'Айгерим'],
    ['golos-text', 'А'],
    ['pt-serif', 'Ю'],
  ])('text geometry for %s "%s" fills exactly the glyph\'s nonzero-winding region', (fontId, text) => {
    const m = glyphFootprintMismatch(fontId, text)
    // Total area has to be right...
    expect(m.areaErrorPct).toBeLessThan(0.5)
    // ...AND it has to be in the right PLACE: the symmetric difference against
    // the rasterizer's own fill region is what makes this hard to pass by
    // accident, since a subtract-instead-of-union error moves material around
    // rather than merely resizing the glyph.
    expect(m.misplacedPct).toBeLessThan(0.5)
    // Overlapping cap triangles (a self-intersecting outer contour) inflate
    // the absolute-area measure above the true footprint; they must not exist.
    expect(m.geometryArea).toBeCloseTo(m.truthArea, 0)
  })

  it('montserrat and pt-sans disagree about how to DRAW "А" yet both land within 0.5% of their own outline', () => {
    // Same letter, two opposite drawing conventions. A regression that reads
    // winding wrongly breaks exactly one of these two and not the other, so
    // asserting both in one place documents the trap.
    const montserrat = glyphFootprintMismatch('montserrat', 'А')
    const ptSans = glyphFootprintMismatch('pt-sans', 'А')
    expect(montserrat.misplacedPct).toBeLessThan(0.5)
    expect(ptSans.misplacedPct).toBeLessThan(0.5)
    // Sanity that the two really are different glyph designs and the test is
    // not silently comparing the same thing twice.
    expect(Math.abs(montserrat.truthArea - ptSans.truthArea)).toBeGreaterThan(5)
  })

  it('every shipped font renders a multi-character Cyrillic name without throwing', () => {
    // nunito, oswald and rubik passed every glyph-presence check and still
    // threw "substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet
    // supported" from inside opentype.js 2.0's GSUB handling for EVERY string
    // longer than one character -- i.e. for every real customer name. Only a
    // full buildKeychainGeometries call on a multi-character string catches
    // that, so this walks the whole roster.
    expect(PRINT_SHOP_FONTS.length).toBeGreaterThan(0)
    for (const f of PRINT_SHOP_FONTS) {
      const loaded = loadFont(f.id)
      expect(() => buildKeychainGeometries({ font: loaded, text: 'Айгерим', size: 'M', ringAtEnd: false }),
        `font ${f.id} cannot render a multi-character name`).not.toThrow()
    }
  })

  // --- The key-ring hole must be a real void, not just an attached contour --

  it('leaves no material anywhere inside the key-ring hole, at any depth', () => {
    // Attaching a hole polygon to a THREE.Shape is not the same thing as
    // THREE.ExtrudeGeometry actually cutting it out of the mesh. Raycasting
    // from below the base straight up through the hole is the direct question:
    // a real void returns no intersections at all.
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Айгерим', size: 'M', ringAtEnd: false })
    const ring = ringHoleCentre(textGeometry, 'M', false)
    const mesh = new THREE.Mesh(baseGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    mesh.updateMatrixWorld()
    const raycaster = new THREE.Raycaster()
    const shootUpAt = (x: number, y: number) => {
      raycaster.set(new THREE.Vector3(x, y, -10), new THREE.Vector3(0, 0, 1))
      return raycaster.intersectObject(mesh)
    }

    expect(shootUpAt(ring.x, ring.y)).toHaveLength(0)
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const r = ring.holeRadius * 0.7
      expect(shootUpAt(ring.x + Math.cos(a) * r, ring.y + Math.sin(a) * r),
        `material found inside the ring hole at angle ${i}/16`).toHaveLength(0)
    }

    // Positive control: the surrounding ring WALL must be solid, entered at
    // z=0 and left at z=baseThickness. Without this, "zero hits" could just
    // mean the raycast was pointed at empty space or set up wrongly.
    const wallR = (ring.holeRadius + ring.ringRadius) / 2
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const hits = shootUpAt(ring.x + Math.cos(a) * wallR, ring.y + Math.sin(a) * wallR)
      expect(hits.length, `ring wall is not solid at angle ${i}/16`).toBeGreaterThanOrEqual(2)
      expect(Math.min(...hits.map(h => h.point.z))).toBeCloseTo(0, 5)
      expect(Math.max(...hits.map(h => h.point.z))).toBeCloseTo(SIZE_PRESETS.M.baseThicknessMm, 5)
    }
  })

  it.each([
    ['S', false], ['S', true], ['M', false], ['M', true], ['L', false], ['L', true],
  ] as const)('base volume accounts for the ring hole as missing material (%s, ringAtEnd=%s)', (size, ringAtEnd) => {
    const preset = SIZE_PRESETS[size]
    const { baseGeometry, textGeometry } = buildKeychainGeometries({ font, text: 'Айгерим', size, ringAtEnd })
    const ring = ringHoleCentre(textGeometry, size, ringAtEnd)

    // A closed prism's volume is exactly its 2D footprint times its depth.
    // This fails if the extrusion is not watertight -- e.g. hole walls emitted
    // without re-triangulating the caps around them.
    expect(meshVolume(baseGeometry)).toBeCloseTo(footprintArea(baseGeometry) * preset.baseThicknessMm, 3)

    // And the footprint really has a hole in it: the scanline through the ring
    // centre must cross material, then a GAP exactly ringHoleDiameterMm wide
    // centred on the ring, then material again. If ExtrudeGeometry ever stops
    // cutting attached holes, this gap disappears and the volume above grows
    // by holeArea * thickness (~39 mm3 at size M).
    const intervals = topCapIntervals(baseGeometry, ring.y)
    const gap = intervals
      .slice(0, -1)
      .map((iv, i) => ({ from: iv[1], to: intervals[i + 1][0] }))
      .find(g => g.from < ring.x && ring.x < g.to)
    // Tolerance is 4 decimal places, not more: position buffers are float32,
    // whose spacing at x ~= 74mm (size L with the ring at the end) is already
    // ~5e-6. Still ~100000x tighter than the 5mm hole this is measuring.
    expect(gap, 'no gap in the base material at the ring centre -- the hole was not cut').toBeDefined()
    expect(gap!.to - gap!.from).toBeCloseTo(preset.ringHoleDiameterMm, 4)
    expect((gap!.from + gap!.to) / 2).toBeCloseTo(ring.x, 4)
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
