import ClipperLib from 'clipper-lib'
import type { Point } from './geometryUtils'

// Clipper работает с целыми координатами (64-битная арифметика внутри) --
// умножаем на SCALE перед offset, делим обратно после. 1000 даёт точность
// 0.001мм, с большим запасом для брелка в несколько сантиметров.
const SCALE = 1000

function toClipper(subpaths: Point[][]): ClipperLib.Paths {
  return subpaths.map(sp => sp.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })))
}

function fromClipper(path: ClipperLib.Path): Point[] {
  return path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE }))
}

/**
 * Outward offset (outset) of a set of closed 2D subpaths by distanceMm, with
 * rounded corners -- the SAME operation that, applied to a name's letter
 * outlines, produces the auto-contour "border around the text" base shape
 * (see the design spec). Nearby subpaths naturally merge into one contour
 * where the offset regions overlap; this is standard ClipperOffset
 * behaviour, not something this wrapper does itself.
 */
export function offsetOutward(subpaths: Point[][], distanceMm: number): Point[][] {
  const co = new ClipperLib.ClipperOffset()
  co.AddPaths(toClipper(subpaths), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const solution: ClipperLib.Paths = []
  co.Execute(solution, distanceMm * SCALE)

  return solution.map(fromClipper)
}

/**
 * Resolves a polygon soup into disjoint outer-contour+holes groups using the
 * NONZERO WINDING RULE, i.e. exactly the fill rule a font rasterizer applies
 * to a glyph outline.
 *
 * This is what makes letter outlines come out right regardless of how the
 * type designer chose to draw them. Fonts use two different conventions for
 * the same glyph, and both are legal because both fill identically under the
 * nonzero rule:
 *
 *   - outline + counter with OPPOSITE windings (pt-sans "А": subpath areas
 *     +67.10 and -5.89) -- the small subpath is a genuine hole;
 *   - a UNION of overlapping pieces with the SAME winding (montserrat "А":
 *     +82.38 and +18.59 -- a chevron plus a separate crossbar polygon;
 *     unbounded, comfortaa, exo-2 and manrope do the same).
 *
 * A containment-based classifier (groupIntoShapesWithHoles) cannot tell the
 * two apart -- it sees "smaller bbox inside bigger bbox" and SUBTRACTS, which
 * silently corrupted the second group of fonts (measured: 42-87% of the
 * glyph's area landed on the wrong side of the outline). Nonzero union fixes
 * both cases in ONE pass: same-winding overlaps merge into a single filled
 * region, opposite-winding counters stay holes.
 *
 * Callers must pass the font's OWN raw winding directions -- normalising
 * orientation first (toPositiveOrientation) destroys the very signal that
 * separates "hole" from "union piece".
 *
 * Output contours carry Clipper's canonical orientation, and the hole
 * relationships come from Clipper's own PolyTree rather than from a second
 * containment guess.
 */
export function unionNonZeroGroups(subpaths: Point[][]): { outer: Point[]; holes: Point[][] }[] {
  // Clipper's Execute() returns false (not an empty solution) when nothing was
  // added, so an empty soup has to short-circuit. This is a real input: a
  // character the chosen font has no glyph for, and whose .notdef is itself
  // empty, flattens to zero subpaths -- and the caller has a much better
  // error message for that case than "clipper union failed".
  if (subpaths.every(sp => sp.length < 3)) return []

  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(toClipper(subpaths), ClipperLib.PolyType.ptSubject, true)
  const tree = new ClipperLib.PolyTree()
  const ok = clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  )
  if (!ok) throw new Error('unionNonZeroGroups: clipper union failed')

  // In a PolyTree an outer contour's direct children are its holes, and a
  // hole's children are islands of material inside that hole (rare in type
  // design, but handled rather than assumed away).
  const groups: { outer: Point[]; holes: Point[][] }[] = []
  const visit = (node: ClipperLib.PolyNode) => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        groups.push({
          outer: fromClipper(child.Contour()),
          holes: child.Childs().filter(h => h.IsHole()).map(h => fromClipper(h.Contour())),
        })
      }
      visit(child)
    }
  }
  visit(tree)
  return groups
}
