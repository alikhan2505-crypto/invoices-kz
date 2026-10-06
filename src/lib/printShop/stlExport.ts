import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

const exporter = new STLExporter()

/**
 * Serializes a BufferGeometry to a binary STL ArrayBuffer -- works in plain
 * Node (no canvas/WebGL needed, STLExporter only walks the geometry's own
 * vertex/index data), used both for the manual visual check in Task 7 and
 * for real server-side generation after a paid order (Task 10).
 */
export function exportGeometryToSTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const mesh = new THREE.Mesh(geometry)
  const result = exporter.parse(mesh, { binary: true }) as DataView
  return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength)
}
