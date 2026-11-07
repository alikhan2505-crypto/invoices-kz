'use client'

import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { JS_CLASS, SCRUB_MQ, chapterAt, scrubEnabled } from './timeline'
import {
  applyFrame, cardTarget, clearFrame, dimTarget, dotsTarget, driftTarget, hintTarget, swapTarget, winTarget,
  type FrameTarget,
} from './scrubFrame'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const num = (el: HTMLElement, name: string) => parseFloat(el.style.getPropertyValue(name))

// Цели кадра: окна и смены читают свои --a/--k (и --a2/--k2) из inline-стиля
// разметки, остальное (карточка, сетка, пятна, подсказка) задано по классам.
function collectTargets(stage: HTMLElement): FrameTarget[] {
  const list: FrameTarget[] = []
  stage.querySelectorAll<HTMLElement>('.hp-t').forEach((el) => {
    const a = num(el, '--a'), k = num(el, '--k')
    if (Number.isFinite(a) && Number.isFinite(k)) list.push(winTarget(el, a, k))
  })
  stage.querySelectorAll<HTMLElement>('.hp-sw, .hp-wk').forEach((el) => {
    const a = num(el, '--a'), k = num(el, '--k'), a2 = num(el, '--a2'), k2 = num(el, '--k2')
    if ([a, k, a2, k2].every(Number.isFinite)) list.push(swapTarget(el, a, k, a2, k2))
  })
  const one = (sel: string, make: (el: HTMLElement) => FrameTarget) => {
    stage.querySelectorAll<HTMLElement>(sel).forEach((el) => list.push(make(el)))
  }
  one('.hp-card', cardTarget)
  one('.hp-dots', dotsTarget)
  one('.hp-qr, .hp-paytxt', dimTarget)
  one('.hp-blob', driftTarget)
  one('.hp-hint', hintTarget)
  return list
}

// Драйвер сцены: один слушатель прокрутки, кадр через requestAnimationFrame.
// Прогресс p (0..1) превращается в числа в JS и пишется ТОЛЬКО на элементы,
// у которых значение изменилось с прошлого кадра (scrubFrame.ts). Никакого
// состояния React на кадр, никаких чтений вёрстки в обработчике: верх секции
// и её длину меряем только при изменении размеров. Анимируются только
// transform и opacity (их формулы живут в CSS и читают эти переменные).
//
// Приоритет: JS-драйвер, а не CSS scroll-driven animations: animation-timeline
// нет в Safari до 26, а основная аудитория на iPhone и во встроенном браузере
// Instagram.
export function useScrub(sectionRef: RefObject<HTMLElement | null>, stageRef: RefObject<HTMLElement | null>) {
  // Класс сцены ставит серверный скрипт в page.tsx, но при клиентской навигации
  // на страницу он не выполняется: без этого CSS остаётся в режиме столбиком.
  // Срабатывает до отрисовки, поэтому кадра «столбиком» перед сценой нет.
  useIsoLayoutEffect(() => {
    const root = document.documentElement
    root.classList.add(JS_CLASS)
    return () => root.classList.remove(JS_CLASS)
  }, [])

  useEffect(() => {
    const section = sectionRef.current
    const stage = stageRef.current
    if (!section || !stage) return

    const mq = window.matchMedia(SCRUB_MQ)
    const links = Array.from(stage.querySelectorAll<HTMLElement>('.hp-seg'))
    const tileLinks = Array.from(stage.querySelectorAll<HTMLElement>('.hp-tilea'))
    let targets: FrameTarget[] = []
    const scratch: string[] = []
    let top = 0
    let total = 1
    let last = -1
    let lastCh = -1
    let raf = 0
    let on = false

    const measure = () => {
      const rect = section.getBoundingClientRect()
      top = rect.top + window.scrollY
      total = Math.max(1, section.offsetHeight - stage.offsetHeight)
    }

    const apply = (force: boolean) => {
      raf = 0
      const p = Math.min(1, Math.max(0, (window.scrollY - top) / total))
      if (force || Math.abs(p - last) > 0.0004) {
        last = p
        applyFrame(targets, p, scratch)
      }
      const ch = chapterAt(p)
      if (ch !== lastCh) {
        lastCh = ch
        stage.dataset.ch = String(ch)
        links.forEach((el, i) => {
          if (i + 1 === ch) el.setAttribute('aria-current', 'step')
          else el.removeAttribute('aria-current')
        })
        // Плитки остаются в дереве доступности всегда (диктор их читает),
        // но пока они невидимы, в порядок Tab не попадают.
        tileLinks.forEach((el) => {
          if (ch === 5) el.removeAttribute('tabindex')
          else el.setAttribute('tabindex', '-1')
        })
      }
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(() => apply(false))
    }

    const onResize = () => {
      measure()
      schedule()
    }

    const start = () => {
      if (on) return
      on = true
      targets = collectTargets(stage)
      measure()
      apply(true)
      window.addEventListener('scroll', schedule, { passive: true })
      window.addEventListener('resize', onResize)
    }

    const stop = () => {
      if (!on) return
      on = false
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      // Сцена выключена (reduced-motion, низкое окно): отдаём управление CSS,
      // иначе записанные значения перебили бы статичное состояние.
      clearFrame(targets)
      targets = []
      stage.dataset.ch = '0'
      tileLinks.forEach((el) => el.removeAttribute('tabindex'))
      links.forEach((el) => el.removeAttribute('aria-current'))
      last = -1
      lastCh = -1
    }

    const sync = () => (scrubEnabled(mq.matches, document.documentElement) ? start() : stop())
    sync()
    mq.addEventListener('change', sync)

    // Шрифты и картинки двигают высоту страницы: пересчёт верха секции.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (on) onResize() }) : null
    ro?.observe(document.body)
    // Возврат по «назад» (bfcache): браузер восстановил прокрутку без события.
    const onShow = () => { if (on) { measure(); apply(true) } }
    window.addEventListener('pageshow', onShow)

    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('pageshow', onShow)
      ro?.disconnect()
      stop()
    }
  }, [sectionRef, stageRef])
}
