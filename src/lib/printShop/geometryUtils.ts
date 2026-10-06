export type Point = { x: number; y: number }

// opentype.js Path.commands — не импортируем сам пакет здесь, чтобы этот
// модуль оставался чистой 2D-геометрией без внешних зависимостей (легче
// юнит-тестировать синтетическими командами, как в geometryUtils.test.ts).
export type OpentypeCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'Z' }

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const mt = 1 - t
  const a = mt * mt, b = 2 * mt * t, c = t * t
  return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y }
}

/**
 * Splits a flat opentype.js command list into closed polyline subpaths,
 * sampling curves into straight segments (curveSegments points per curve,
 * not counting the shared start point) so every downstream consumer
 * (THREE.Shape, clipper-lib) works with plain polygons only.
 */
export function flattenOpentypePath(commands: OpentypeCommand[], curveSegments = 8): Point[][] {
  const subpaths: Point[][] = []
  let current: Point[] = []
  let cursor: Point = { x: 0, y: 0 }
  let subpathStart: Point = { x: 0, y: 0 }

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (current.length) subpaths.push(current)
      cursor = { x: cmd.x, y: cmd.y }
      subpathStart = cursor
      current = [cursor]
    } else if (cmd.type === 'L') {
      cursor = { x: cmd.x, y: cmd.y }
      current.push(cursor)
    } else if (cmd.type === 'C') {
      const p0 = cursor, p1 = { x: cmd.x1, y: cmd.y1 }, p2 = { x: cmd.x2, y: cmd.y2 }, p3 = { x: cmd.x, y: cmd.y }
      for (let i = 1; i <= curveSegments; i++) current.push(cubicPoint(p0, p1, p2, p3, i / curveSegments))
      cursor = p3
    } else if (cmd.type === 'Q') {
      const p0 = cursor, p1 = { x: cmd.x1, y: cmd.y1 }, p2 = { x: cmd.x, y: cmd.y }
      for (let i = 1; i <= curveSegments; i++) current.push(quadPoint(p0, p1, p2, i / curveSegments))
      cursor = p2
    } else if (cmd.type === 'Z') {
      cursor = subpathStart
      // No explicit closing duplicate point -- every consumer here (THREE.Shape,
      // clipper-lib) treats a polyline as implicitly closed back to its first point.
    }
  }
  if (current.length) subpaths.push(current)
  return subpaths
}

/**
 * Signed area of a closed polygon (shoelace formula). Positive = counter-
 * clockwise in a Y-up coordinate system. The SIGN is load-bearing for callers
 * that need a polygon's winding direction, not just its size.
 */
export function shoelaceArea(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

function boundingBox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function bboxContains(outer: ReturnType<typeof boundingBox>, inner: ReturnType<typeof boundingBox>): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

/**
 * Groups flattened subpaths into outer-shape+holes clusters using pure
 * geometry (area magnitude + bounding-box containment) -- deliberately NOT
 * relying on an assumed winding-direction convention, since different font
 * files/rasterizers aren't 100% consistent about it. The letter "О" becomes
 * one entry with one hole; two separate letters become two independent
 * entries with no holes; a dot above "й"/"i" is never mistaken for a hole
 * because its bounding box doesn't sit inside the stem's.
 */
export function groupIntoShapesWithHoles(subpaths: Point[][]): { outer: Point[]; holes: Point[][] }[] {
  const withMeta = subpaths
    .map(points => ({ points, area: Math.abs(shoelaceArea(points)), bbox: boundingBox(points) }))
    .sort((a, b) => b.area - a.area)

  const result: { outer: Point[]; holes: Point[][] }[] = []
  const claimed = new Set<number>()

  for (let i = 0; i < withMeta.length; i++) {
    if (claimed.has(i)) continue
    const outer = withMeta[i]
    const holes: Point[][] = []
    for (let j = i + 1; j < withMeta.length; j++) {
      if (claimed.has(j)) continue
      const candidate = withMeta[j]
      if (bboxContains(outer.bbox, candidate.bbox)) {
        holes.push(candidate.points)
        claimed.add(j)
      }
    }
    result.push({ outer: outer.points, holes })
  }
  return result
}
