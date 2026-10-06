import ClipperLib from 'clipper-lib'
import type { Point } from './geometryUtils'

// Clipper работает с целыми координатами (64-битная арифметика внутри) --
// умножаем на SCALE перед offset, делим обратно после. 1000 даёт точность
// 0.001мм, с большим запасом для брелка в несколько сантиметров.
const SCALE = 1000

/**
 * Outward offset (outset) of a set of closed 2D subpaths by distanceMm, with
 * rounded corners -- the SAME operation that, applied to a name's letter
 * outlines, produces the auto-contour "border around the text" base shape
 * (see the design spec). Nearby subpaths naturally merge into one contour
 * where the offset regions overlap; this is standard ClipperOffset
 * behaviour, not something this wrapper does itself.
 */
export function offsetOutward(subpaths: Point[][], distanceMm: number): Point[][] {
  const paths = subpaths.map(sp => sp.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) })))

  const co = new ClipperLib.ClipperOffset()
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const solution: ClipperLib.Paths = []
  co.Execute(solution, distanceMm * SCALE)

  return solution.map((path: { X: number; Y: number }[]) => path.map(p => ({ x: p.X / SCALE, y: p.Y / SCALE })))
}
