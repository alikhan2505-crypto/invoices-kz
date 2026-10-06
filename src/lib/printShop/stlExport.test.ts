import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { exportGeometryToSTL } from './stlExport'

describe('exportGeometryToSTL', () => {
  it('produces a non-empty binary STL for a simple box', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const buffer = exportGeometryToSTL(geometry)
    expect(buffer.byteLength).toBeGreaterThan(84) // 80-byte header + 4-byte triangle count, at minimum
    const view = new DataView(buffer)
    const triangleCount = view.getUint32(80, true)
    expect(triangleCount).toBeGreaterThan(0)
    // Binary STL size = 84 header bytes + 50 bytes per triangle
    expect(buffer.byteLength).toBe(84 + triangleCount * 50)
  })
})
