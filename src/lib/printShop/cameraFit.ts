import * as THREE from 'three'

// Запас вокруг модели: во столько раз «видимая область» больше самой модели
// по каждой оси (1.2 = по ~8% свободного места с каждой стороны).
export const FIT_PADDING = 1.2

/**
 * Расстояние от центра box до камеры, при котором ВСЕ 8 углов box
 * (а значит и вся модель внутри) целиком видны в кадре с запасом `padding`,
 * если камера смотрит на центр box из направления `dir` (единичный вектор от
 * центра к камере).
 *
 * Считается точно для перспективной проекции и ЛЮБОГО соотношения сторон
 * холста: для угла с координатами (x, y, z) в базисе камеры (x вправо,
 * y вверх, z к камере) глубина до него = d - z, а в кадре он стоит на
 * x / (глубина * tan(fov/2) * aspect) по горизонтали и y / (глубина * tan(fov/2))
 * по вертикали. Условие |ndc| <= 1 / padding даёт нижнюю границу на d для
 * каждого угла; берём максимум.
 *
 * Почему не <Bounds> из drei: он берёт только самую длинную сторону box и
 * не учитывает ни наклон камеры, ни реальное соотношение сторон холста, а
 * главное, не знал про OrbitControls без makeDefault и оставлял target в
 * (0,0,0), поэтому длинное имя уезжало за правый край.
 */
export function fitDistance(
  box: THREE.Box3,
  dir: THREE.Vector3,
  fovDeg: number,
  aspect: number,
  padding = FIT_PADDING,
): number {
  const center = box.getCenter(new THREE.Vector3())
  const z = dir.clone().normalize()
  // Базис камеры: тот же, что строит Object3D.lookAt при up = (0,1,0).
  const up0 = Math.abs(z.y) > 0.999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0)
  const x = new THREE.Vector3().crossVectors(up0, z).normalize()
  const y = new THREE.Vector3().crossVectors(z, x)
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)
  const safeAspect = aspect > 0 ? aspect : 1

  let dist = 0
  const corner = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    ).sub(center)
    const cx = Math.abs(corner.dot(x))
    const cy = Math.abs(corner.dot(y))
    const cz = corner.dot(z)
    const needDepth = Math.max((cx * padding) / (tanHalf * safeAspect), (cy * padding) / tanHalf)
    dist = Math.max(dist, cz + needDepth)
  }
  // Не ближе чем на радиус модели: камера не должна оказаться внутри неё.
  const radius = box.getSize(new THREE.Vector3()).length() / 2
  return Math.max(dist, radius * 1.05, 1)
}
