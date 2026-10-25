import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { fitDistance, FIT_PADDING } from './cameraFit'

function corners(box: THREE.Box3): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < 8; i++) {
    out.push(new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ))
  }
  return out
}

// Ставит камеру так, как это делает FitCamera, и проецирует углы в экран.
function projectedExtent(box: THREE.Box3, dir: THREE.Vector3, fov: number, aspect: number) {
  const d = fitDistance(box, dir, fov, aspect)
  const center = box.getCenter(new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000)
  cam.position.copy(center).addScaledVector(dir.clone().normalize(), d)
  cam.lookAt(center)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  let maxX = 0
  let maxY = 0
  for (const c of corners(box)) {
    const p = c.clone().project(cam)
    maxX = Math.max(maxX, Math.abs(p.x))
    maxY = Math.max(maxY, Math.abs(p.y))
  }
  return { maxX, maxY }
}

describe('fitDistance', () => {
  // Плоская плита вида «брелок»: длинная по X, тонкая по Y (после поворота
  // группы), смещённая от начала координат, как настоящий брелок.
  const boxes: Record<string, THREE.Box3> = {
    'Самал (короткое)': new THREE.Box3(new THREE.Vector3(-18, 0, -12), new THREE.Vector3(48, 4, 8)),
    'длинное казахское имя': new THREE.Box3(new THREE.Vector3(-20, 0, -14), new THREE.Vector3(190, 6, 12)),
    'крупный размер L': new THREE.Box3(new THREE.Vector3(-30, 0, -22), new THREE.Vector3(120, 8, 20)),
  }
  const dir = new THREE.Vector3(0, 52, 18).normalize()
  const aspects = [1, 0.75, 1.8, 2.5]

  for (const [name, box] of Object.entries(boxes)) {
    for (const aspect of aspects) {
      it(`${name}, aspect ${aspect}: целиком в кадре с запасом и плотно по одной оси`, () => {
        const { maxX, maxY } = projectedExtent(box, dir, 35, aspect)
        const limit = 1 / FIT_PADDING
        expect(maxX).toBeLessThanOrEqual(limit + 1e-6)
        expect(maxY).toBeLessThanOrEqual(limit + 1e-6)
        // не «далеко и мелко»: одна из осей использует весь допустимый запас
        expect(Math.max(maxX, maxY)).toBeGreaterThan(limit - 1e-3)
      })
    }
  }

  it('работает и при взгляде строго сверху', () => {
    // three.js сам сдвигает вырожденный lookAt (up || взгляд) на ~1e-4, отсюда допуск
    const { maxX, maxY } = projectedExtent(boxes['Самал (короткое)'], new THREE.Vector3(0, 1, 0), 35, 1.6)
    expect(maxX).toBeLessThanOrEqual(1 / FIT_PADDING + 1e-3)
    expect(maxY).toBeLessThanOrEqual(1 / FIT_PADDING + 1e-3)
  })
})
