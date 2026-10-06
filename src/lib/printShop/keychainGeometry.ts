import * as THREE from 'three'
import type { Font } from 'opentype.js'
import {
  flattenOpentypePath,
  groupIntoShapesWithHoles,
  shoelaceArea,
  type OpentypeCommand,
  type Point,
} from './geometryUtils'
import { offsetOutward, unionNonZeroGroups } from './offsetContour'
import { SIZE_PRESETS, type KeychainSize } from './pricing'

function shapesFromGroups(groups: { outer: Point[]; holes: Point[][] }[]): THREE.Shape[] {
  return groups.map(g => {
    const shape = new THREE.Shape(g.outer.map(p => new THREE.Vector2(p.x, p.y)))
    for (const hole of g.holes) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p.x, p.y))))
    return shape
  })
}

function circlePoints(cx: number, cy: number, radius: number, segments = 32): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return pts
}

/**
 * Normalizes every subpath to positive (counter-clockwise in Y-up space)
 * orientation. ClipperOffset decides which way "outward" is from the
 * orientation of the path that owns the global lowest point and then applies
 * that single decision to every closed polygon in the call -- so feeding it a
 * MIX of clockwise and counter-clockwise paths makes it grow some and erode
 * others. Measured: offsetting the Y-flipped letters together with a
 * counter-clockwise ring+bridge returned 8 eroded contours instead of 1 grown
 * one. Forcing one orientation here makes that invariant explicit instead of
 * accidental.
 */
function toPositiveOrientation(subpaths: Point[][]): Point[][] {
  return subpaths.map(sp => (shoelaceArea(sp) < 0 ? [...sp].reverse() : sp))
}

/** Standard ray-casting point-in-polygon test (polygon is implicitly closed). */
function pointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function buildKeychainGeometries(params: {
  font: Font
  text: string
  size: KeychainSize
  ringAtEnd: boolean
}): { baseGeometry: THREE.BufferGeometry; textGeometry: THREE.BufferGeometry } {
  const text = params.text.trim()
  if (!text) throw new Error('buildKeychainGeometries: text must not be empty')

  const preset = SIZE_PRESETS[params.size]

  // opentype.js's getPath() is Y-DOWN, NOT Y-up. Verified empirically against
  // pt-sans.ttf rather than assumed: getPath('A', 0, 0, 14) returns y in
  // [-9.87, 0] (baseline at 0, cap height at NEGATIVE y), and getPath('p', ...)
  // puts the descender of "p" at POSITIVE y (+2.80) -- so +y points down, the
  // canvas convention. three.js world space is Y-up, so without a flip the
  // whole keychain comes out vertically mirrored (confirmed: the heavy top bar
  // of "Г" rendered at the BOTTOM of its own bounding box).
  //
  // The flip lives here rather than in flattenOpentypePath because
  // geometryUtils is a pure, coordinate-preserving 2D module (its tests assert
  // exact pass-through of synthetic commands); bridging opentype's convention
  // to three.js's is this orchestrator's job.
  //
  // Negating y alone would reverse every polygon's winding; reversing each
  // subpath's point order as well makes the pair a plain reflection about the
  // x axis, so every subpath keeps THE FONT'S OWN winding direction.
  //
  // That matters for unionNonZeroGroups below, which reads winding as the
  // difference between "this subpath is a counter" and "this subpath is an
  // overlapping union piece". (It is NOT what protects the Clipper OFFSET
  // step further down -- that is protected by toPositiveOrientation, which
  // normalises orientation anyway and makes this reverse provably inert for
  // the offset input. Verified: identical output with and without it there.)
  const path = params.font.getPath(text, 0, 0, preset.fontSizeMm)
  const letterSubpaths = flattenOpentypePath(path.commands as unknown as OpentypeCommand[]).map(sp =>
    [...sp].reverse().map(p => ({ x: p.x, y: -p.y }))
  )
  // Nonzero-winding union, NOT groupIntoShapesWithHoles: a containment-based
  // classifier SUBTRACTS an overlapping same-winding piece (e.g. the crossbar
  // of montserrat's "А") instead of unioning it, which corrupted 29
  // (font, letter) pairs across montserrat, unbounded, comfortaa, manrope,
  // exo-2 and tektur. See unionNonZeroGroups for the detail.
  const letterGroups = unionNonZeroGroups(letterSubpaths)

  // Ring: a hole-with-wall annulus plus a short rectangular bridge
  // connecting it to the nearest end of the text, added to the SAME subpath
  // set that goes into the offset step so the bridge becomes an organic
  // part of the final contour rather than a shape glued on top (see spec).
  const bbox = (() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const sp of letterSubpaths) for (const p of sp) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    return { minX, maxX, minY, maxY }
  })()
  // Guard against text that is non-empty but carries no drawable outline at
  // all (whitespace-only input is already rejected above, but e.g. a string of
  // characters the chosen font has no glyphs for would leave bbox at Infinity
  // and silently produce NaN ring coordinates and a NaN mesh).
  if (!Number.isFinite(bbox.minX) || bbox.maxX <= bbox.minX) {
    throw new Error(`buildKeychainGeometries: text ${JSON.stringify(params.text)} produced no drawable glyph outlines in this font`)
  }

  const midY = (bbox.minY + bbox.maxY) / 2
  const ringRadius = preset.ringHoleDiameterMm / 2 + preset.ringWallMm
  const ringCenterX = params.ringAtEnd
    ? bbox.maxX + preset.ringDistanceMm + ringRadius
    : bbox.minX - preset.ringDistanceMm - ringRadius
  const ringOuter = circlePoints(ringCenterX, midY, ringRadius)
  const bridgeHalfHeight = preset.ringWallMm
  const bridgeStartX = params.ringAtEnd ? bbox.maxX : ringCenterX + ringRadius
  const bridgeEndX = params.ringAtEnd ? ringCenterX - ringRadius : bbox.minX
  const bridge: Point[] = [
    { x: bridgeStartX, y: midY - bridgeHalfHeight },
    { x: bridgeEndX, y: midY - bridgeHalfHeight },
    { x: bridgeEndX, y: midY + bridgeHalfHeight },
    { x: bridgeStartX, y: midY + bridgeHalfHeight },
  ]

  // BASE: outward-offset contour of letters + ring + bridge, extruded by
  // baseThicknessMm, sitting at z in [0, baseThicknessMm].
  const offsetSubpaths = offsetOutward(
    toPositiveOrientation([...letterSubpaths, ringOuter, bridge]),
    preset.borderMm
  )
  const baseGroups = groupIntoShapesWithHoles(offsetSubpaths)
  // The ring's own hole (the part a real key ring threads through) is cut
  // out of the base explicitly -- the offset step grows material OUTWARD
  // around the ring's outer circle, it does not know a hole belongs inside it.
  //
  // Which base group owns the hole is decided by an actual point-in-polygon
  // test on the ring centre. A distance-to-vertex-average test does NOT work:
  // the offset normally merges letters + ring + bridge into ONE contour whose
  // vertex average sits in the middle of the whole keychain (measured 35.3mm
  // from the ring centre for "Алихан"/M), so any radius-based threshold either
  // misses the hole entirely or would have to be wide enough to be meaningless.
  const ringHoleRadius = preset.ringHoleDiameterMm / 2
  let ringHoleAttached = false
  for (const group of baseGroups) {
    if (!pointInPolygon(ringCenterX, midY, group.outer)) continue
    if (group.holes.some(h => pointInPolygon(ringCenterX, midY, h))) continue
    group.holes.push(circlePoints(ringCenterX, midY, ringHoleRadius))
    ringHoleAttached = true
  }
  // A keychain without the hole its key ring threads through is a defective
  // product, so fail loudly rather than quietly returning an unusable mesh.
  if (!ringHoleAttached) {
    throw new Error('buildKeychainGeometries: could not place the key-ring hole — no base contour contains the ring centre')
  }

  const baseShapes = shapesFromGroups(baseGroups)
  const baseGeometry = new THREE.ExtrudeGeometry(baseShapes, { depth: preset.baseThicknessMm, bevelEnabled: false })

  // TEXT: raw (un-offset) letter outlines, extruded by textThicknessMm,
  // raised on top of the base (z in [baseThicknessMm, baseThicknessMm+textThicknessMm]).
  const textShapes = shapesFromGroups(letterGroups)
  const textGeometry = new THREE.ExtrudeGeometry(textShapes, { depth: preset.textThicknessMm, bevelEnabled: false })
  textGeometry.translate(0, 0, preset.baseThicknessMm)

  return { baseGeometry, textGeometry }
}
