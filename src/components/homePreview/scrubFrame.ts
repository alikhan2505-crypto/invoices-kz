import { cameraEase, dimAt, fmt3, fmt4, hintP, tiltEase, windowT } from './timeline'

// Кадр сцены без DOM-зависимостей: список «целей» (элемент + какие
// переменные ему нужны) и запись только изменившихся значений.
//
// Почему так. Раньше драйвер писал одну --p на сцену, и её наследовали все
// ~190 потомков с цепочками calc/clamp: каждый кадр пересчитывал стили всего
// поддерева. Теперь каждая переменная пишется на тот элемент, который её
// читает (в CSS они зарегистрированы через @property с inherits: false, так
// что потомков не трогают), а значения, не изменившиеся с прошлого кадра
// (окно ещё не началось или уже закончилось), не пишутся совсем.

export interface StyleHost {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string }
}

export interface FrameTarget {
  el: StyleHost
  names: readonly string[]
  /** Кладёт строковые значения в out[i] для names[i]. */
  calc(p: number, out: string[]): void
  last: (string | null)[]
}

export function target(el: StyleHost, names: readonly string[], calc: FrameTarget['calc']): FrameTarget {
  return { el, names, calc, last: names.map(() => null) }
}

/** Окно прогресса: --t. */
export const winTarget = (el: StyleHost, a: number, k: number) =>
  target(el, ['--t'], (p, o) => { o[0] = fmt3(windowT(p, a, k)) })

/** Смена текста: --in (появление) и --out (исчезновение). */
export const swapTarget = (el: StyleHost, a: number, k: number, a2: number, k2: number) =>
  target(el, ['--in', '--out'], (p, o) => { o[0] = fmt3(windowT(p, a, k)); o[1] = fmt3(windowT(p, a2, k2)) })

/** Карточка: наклон и отъезд камеры. */
export const cardTarget = (el: StyleHost) =>
  target(el, ['--pbe', '--tilt'], (p, o) => { o[0] = fmt3(cameraEase(p)); o[1] = fmt3(tiltEase(p)) })

/** Сетка точек: отъезжает вместе с камерой. */
export const dotsTarget = (el: StyleHost) => target(el, ['--pbe'], (p, o) => { o[0] = fmt3(cameraEase(p)) })

/** QR и подпись оплаты: приглушение после штампа. */
export const dimTarget = (el: StyleHost) => target(el, ['--dim'], (p, o) => { o[0] = fmt3(dimAt(p)) })

/** Фоновые пятна: плывут на всём пути. */
export const driftTarget = (el: StyleHost) => target(el, ['--p'], (p, o) => { o[0] = fmt4(p) })

/** Подсказка «листайте вниз»: меняется только в самом начале. */
export const hintTarget = (el: StyleHost) => target(el, ['--p'], (p, o) => { o[0] = fmt4(hintP(p)) })

/** Один кадр: вернёт число записанных свойств (для тестов и замеров). */
export function applyFrame(targets: readonly FrameTarget[], p: number, scratch: string[] = []): number {
  let writes = 0
  for (const t of targets) {
    t.calc(p, scratch)
    for (let i = 0; i < t.names.length; i++) {
      const v = scratch[i]
      if (t.last[i] !== v) {
        t.last[i] = v
        t.el.style.setProperty(t.names[i], v)
        writes++
      }
    }
  }
  return writes
}

/** Снять всё записанное: CSS снова считает статичное состояние сам. */
export function clearFrame(targets: readonly FrameTarget[]) {
  for (const t of targets) {
    for (let i = 0; i < t.names.length; i++) {
      if (t.last[i] !== null) t.el.style.removeProperty(t.names[i])
      t.last[i] = null
    }
  }
}
