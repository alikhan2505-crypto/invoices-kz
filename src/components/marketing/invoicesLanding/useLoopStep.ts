'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

// «Моторчик» сценок лендинга Счетов: кадр за кадром по кругу, у каждого
// кадра своя длительность (durations[i], мс). Вне экрана и на скрытой
// вкладке стоит на паузе (useInView + visibilitychange), при
// prefers-reduced-motion сразу показывает финальный кадр и не крутится.
// Первый рендер -- всегда кадр 0 (как на сервере): reduce приходит из
// useReducedMotionSafe эффектом, иначе разъехалась бы гидрация.
// durations передавайте константой модуля -- иначе таймер перезапускается
// на каждом рендере.
export function useLoopStep<T extends Element = HTMLDivElement>(
  durations: readonly number[],
  finalStep = durations.length - 1,
) {
  const ref = useRef<T>(null)
  const reduce = useReducedMotionSafe()
  const inView = useInView(ref, { margin: '0px 0px -10% 0px' })
  const tabVisible = useTabVisible()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (reduce || !inView || !tabVisible) return
    const id = window.setTimeout(() => setStep((s) => (s + 1) % durations.length), durations[step] ?? 1000)
    return () => window.clearTimeout(id)
  }, [step, inView, tabVisible, reduce, durations])

  return { ref, step: reduce ? finalStep : step, active: inView && tabVisible && !reduce, reduce }
}

// prefers-reduced-motion без расхождения гидрации: useReducedMotion из
// framer-motion на клиенте сразу отдаёт true, а сервер рендерил false --
// разный первый кадр. Здесь первый рендер всегда false (как на сервере),
// настоящее значение приходит эффектом. Переходы transform при этом всё
// равно гасит <MotionConfig reducedMotion="user"> на корне страницы.
export function useReducedMotionSafe() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

export function useTabVisible() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(!document.hidden)
    on()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

// «1 минута» / 174 000 -- пробел-разделитель тысяч (неразрывный), как в
// остальном тексте лендинга; toLocaleString('ru-KZ') в разных движках даёт
// то обычный, то узкий неразрывный пробел -- здесь всегда одинаково.
export function groupThousands(n: number) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}
