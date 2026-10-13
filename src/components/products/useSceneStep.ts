'use client'
import { useEffect, useRef, useState } from 'react'

// Общий «моторчик» живых сцен на лендингах поддоменов (эталон — Kaspi Bot,
// принят 13.10.2026): кадр меняется раз в stepMs, по кругу из steps кадров.
// Вне экрана и на скрытой вкладке стоит на паузе; при prefers-reduced-motion
// сразу показывает финальный кадр (всё уже случилось) и не крутится.
export function useSceneStep(steps: number, finalStep: number, stepMs = 1000) {
  const [step, setStep] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(finalStep); return }
    let visible = true
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting })
    if (ref.current) io.observe(ref.current)
    const id = window.setInterval(() => {
      if (!visible || document.hidden) return
      setStep((s) => (s + 1) % steps)
    }, stepMs)
    return () => { window.clearInterval(id); io.disconnect() }
  }, [steps, finalStep, stepMs])

  return { step, ref }
}
