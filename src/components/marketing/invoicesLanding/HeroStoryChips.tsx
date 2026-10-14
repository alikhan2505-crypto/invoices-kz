'use client'

import { motion } from 'framer-motion'
import { useLoopStep } from './useLoopStep'

// Плашки рядом с 3D-роботом (десктоп). Верхняя -- история одного счёта по
// кругу: «создан» -> «отправлен в WhatsApp» -> «оплачено через Kaspi», по
// ~2.5 с на состояние, смена -- перекрёстное затухание со сдвигом вверх.
// Все три надписи лежат стопкой в одной ячейке грида: ширина плашки равна
// самой длинной и не меняется. Нижняя плашка «2% только с оплаченного»
// вздрагивает подсветкой ровно в момент оплаты -- связывает две плашки.
// Плашки декоративные (aria-hidden): то же самое сказано текстом hero.

const COLOR = { violet: '#6E5ED8', teal: '#0B7A88', mint: '#5EEAD4', whatsapp: '#25D366' }
const SURFACE = 'rgba(20,23,46,0.86)'
const BORDER = 'rgba(255,255,255,0.12)'
const EASE = [0.16, 1, 0.3, 1] as const
const DURATIONS = [2500, 2500, 3200] as const

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function DocIcon() {
  return (
    <svg className="h-3.5 w-3.5" aria-hidden="true" {...ICON}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="h-3.5 w-3.5" aria-hidden="true" {...ICON}>
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" aria-hidden="true" {...ICON} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

export function HeroStoryChips({ story, feeChip }: { story: readonly [string, string, string]; feeChip: string }) {
  const { ref, step, active, reduce } = useLoopStep<HTMLDivElement>(DURATIONS, 2)
  const tones = [COLOR.violet, COLOR.whatsapp, COLOR.mint]
  const icons = [<DocIcon key="d" />, <SendIcon key="s" />, <CheckIcon key="c" />]
  const paid = step === 2

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.6, ease: EASE }}
        className="absolute left-2 top-8"
      >
        <motion.div
          animate={active ? { y: [0, -8, 0] } : { y: 0 }}
          transition={active ? { duration: 5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.5 }}
          className="relative overflow-hidden rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.92)' }}
        >
          <div className="grid">
            {story.map((label, i) => (
              <motion.div
                key={i}
                className="col-start-1 row-start-1 flex items-center gap-2 whitespace-nowrap"
                initial={false}
                animate={step === i ? { opacity: 1, y: 0 } : { opacity: 0, y: step > i || (step === 0 && i === 2) ? -10 : 10 }}
                // Сначала уходит старая строка, потом входит новая — без момента,
                // когда два текста лежат друг на друге (замечено на скриншоте).
                transition={reduce ? { duration: 0 } : step === i ? { duration: 0.35, delay: 0.2, ease: EASE } : { duration: 0.18, ease: EASE }}
              >
                <motion.span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${tones[i]}2E`, color: tones[i] }}
                  initial={false}
                  animate={step === i && !reduce ? { scale: [0.6, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  {icons[i]}
                </motion.span>
                {label}
              </motion.div>
            ))}
          </div>
          {/* прогресс истории: три сегмента, текущий заполняется за время кадра */}
          <div className="mt-2 flex gap-1">
            {story.map((_, i) => (
              <span key={i} className="relative h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <motion.span
                  className="absolute inset-0 origin-left rounded-full"
                  style={{ background: tones[i] }}
                  initial={false}
                  animate={{ scaleX: reduce || step > i ? 1 : step === i ? [0, 1] : 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : step === i
                        ? { duration: DURATIONS[i] / 1000, ease: 'linear' }
                        : { duration: 0.3, ease: EASE }
                  }
                />
              </span>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.8, ease: EASE }}
        className="absolute bottom-10 right-2"
      >
        <motion.div
          animate={active ? { y: [0, 8, 0] } : { y: 0 }}
          transition={active ? { duration: 6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.5 }}
          className="relative flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: 'rgba(255,255,255,0.9)' }}
        >
          {/* вспышка рамки в момент оплаты -- только opacity */}
          <motion.span
            className="pointer-events-none absolute -inset-px rounded-xl"
            style={{ border: `1px solid ${COLOR.mint}`, boxShadow: `0 0 22px -4px ${COLOR.mint}` }}
            initial={false}
            animate={{ opacity: paid && !reduce ? [0, 1, 0.35] : 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
          <motion.span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: paid ? COLOR.mint : COLOR.violet }}
            initial={false}
            animate={paid && !reduce ? { scale: [1, 1.8, 1] } : { scale: 1 }}
            transition={{ duration: 0.6, ease: EASE }}
          />
          {feeChip}
        </motion.div>
      </motion.div>
    </div>
  )
}
