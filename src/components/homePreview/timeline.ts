import type { CSSProperties } from 'react'

// Шкала прокрутки превью главной. Единый источник чисел для разметки и
// для драйвера: CSS читает окна из переменных --a/--k (начало и 1/длина),
// сам драйвер знает только границы глав. Прогресс p = 0..1 по высоте
// «липкой» секции (.hp-story), в CSS она 540svh, то есть липкий путь 440svh.

// Те же условия, что в @media в home-preview.css: если сцена не включена
// (reduced-motion, низкое окно), драйвер ничего не пишет и стоит статичная
// вёрстка столбиком.
export const SCRUB_MQ = '(prefers-reduced-motion: no-preference) and (min-height: 620px)'

// Класс на <html>, с которым CSS включает сцену. Серверный скрипт в page.tsx
// ставит его до первой отрисовки, а на клиентской навигации (Link на эту
// страницу) такой скрипт не выполняется, поэтому класс ставит и сам компонент.
export const JS_CLASS = 'hp-js'

/** Сцену ведёт драйвер, только если CSS её включил (класс) и движение разрешено. */
export function scrubEnabled(mqMatches: boolean, root: { classList: { contains(c: string): boolean } }): boolean {
  return mqMatches && root.classList.contains(JS_CLASS)
}

// Границы смены глав: интро -> 1 -> 2 -> 3 -> 4 -> 5 (кабинет).
export const BOUNDS = [0.06, 0.24, 0.42, 0.60, 0.78] as const

// Номер активной главы по прогрессу: 0 интро, 1..5 главы. Порог на 0.002
// раньше границы: ровно там заканчивается исчезновение прошлого текста и
// начинается появление следующего.
export function chapterAt(p: number): number {
  let n = 0
  for (const b of BOUNDS) if (p >= b - 0.002) n++
  return n
}

type Vars = CSSProperties & Record<`--${string}`, string | number>

/** Окно [a, b] прогресса: в CSS даёт --t от 0 до 1. */
export function win(a: number, b: number): CSSProperties {
  return { '--a': a, '--k': Math.round(1000 / (b - a)) / 1000 } as Vars
}

/**
 * Смена слов, подписей и текстов: j = 0..5. Появление идёт 0.03 после границы
 * предыдущей главы, исчезновение за 0.02 до своей границы, поэтому старый
 * текст успевает уйти, прежде чем придёт новый.
 */
export function swap(j: number): CSSProperties {
  return {
    '--a': j === 0 ? -1 : BOUNDS[j - 1] - 0.002,
    '--k': 33.3,
    '--a2': j === 5 ? 9 : BOUNDS[j] - 0.022,
    '--k2': 50,
  } as Vars
}

/** Окно появления, но исчезновения нет вовсе: для строк карточки и статуса. */
export function swapOut(inA: number, inB: number, outA: number | null, outB?: number): CSSProperties {
  return {
    '--a': inA,
    '--k': Math.round(1000 / (inB - inA)) / 1000,
    '--a2': outA ?? 9,
    '--k2': outA == null || outB == null ? 1 : Math.round(1000 / (outB - outA)) / 1000,
  } as Vars
}

/** Доля липкого пути, на которой стоит якорь главы n (1..5) для ссылок полоски. */
export function anchorFraction(n: number): number {
  return BOUNDS[n - 1] + 0.035
}

// ---------------------------------------------------------------- кадр
// Числа кадра считает JS и пишет их только на те элементы, которым они нужны
// (см. scrubFrame.ts). Формулы те же, что в home-preview.css для статичного
// состояния (там они считаются от --p один раз), поэтому константы общие,
// а тест сверяет их с CSS.

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Окно: 0 до начала a, затем рост до 1 с наклоном k. */
export const windowT = (p: number, a: number, k: number) => clamp01((p - a) * k)

// «Отъезд камеры» (глава 5): кубическое торможение.
export const CAM_A = 0.8
export const CAM_K = 7.7
export const cameraEase = (p: number) => {
  const t = clamp01((p - CAM_A) * CAM_K)
  const u = 1 - t
  return 1 - u * u * u
}

// Наклон карточки в начале: квадратичное торможение, к p = 0.357 уже 1.
export const TILT_K = 2.8
export const tiltEase = (p: number) => {
  const u = 1 - clamp01(p * TILT_K)
  return 1 - u * u
}

// Приглушение QR и подписи после штампа.
export const DIM_A = 0.62
export const DIM_K = 14.3
export const dimAt = (p: number) => clamp01((p - DIM_A) * DIM_K)

// Подсказка «листайте вниз» гаснет к p = 1/45; выше порога значение не
// меняется, значит и писать в DOM нечего.
export const HINT_K = 45
export const HINT_CAP = 0.03
export const hintP = (p: number) => (p < HINT_CAP ? p : HINT_CAP)

export const fmt3 = (x: number) => x.toFixed(3)
export const fmt4 = (x: number) => x.toFixed(4)
