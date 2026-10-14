'use client'

import { motion } from 'framer-motion'

// Цена, у которой при переключении Месяц/Год каждая цифра прокручивается
// барабаном до нового значения (2 990 -> 29 900). Разряды сопоставляются
// справа налево, так что единицы крутятся к единицам, а новый старший
// разряд просто проявляется. Ширину и базовую линию каждой цифры держит
// невидимая настоящая цифра, барабан лежит поверх (absolute) -- строка
// цены остаётся на месте, двигаются только transform/opacity.
// Reduced motion гасит transform сам <MotionConfig reducedMotion="user">.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const EASE = [0.2, 0.9, 0.25, 1] as const

export function DigitRoll({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const chars = Array.from(value)
  const n = chars.length
  return (
    <span className={`inline-flex leading-none tabular-nums ${className ?? ''}`} style={style}>
      <span className="sr-only">{value}</span>
      {chars.map((ch, i) => {
        const fromRight = n - 1 - i
        const isDigit = ch >= '0' && ch <= '9'
        if (!isDigit) {
          return (
            <span key={`s${fromRight}`} aria-hidden="true" className="whitespace-pre">
              {ch}
            </span>
          )
        }
        const d = Number(ch)
        return (
          <motion.span
            key={`d${fromRight}`}
            aria-hidden="true"
            className="relative inline-block"
            initial={{ opacity: 0, y: '0.35em' }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {/* overflow: hidden -- только у внутреннего окна: у inline-block
                с обрезкой базовая линия уехала бы на нижний край, и цена
                «подпрыгнула» бы над «/мес» */}
            <span className="invisible">{ch}</span>
            <span className="absolute inset-0 overflow-hidden">
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col items-center"
                initial={false}
                animate={{ y: `${-d}em` }}
                transition={{ duration: 0.6, ease: EASE, delay: fromRight * 0.035 }}
              >
                {DIGITS.map((g) => (
                  <span key={g} className="block h-[1em] leading-none">
                    {g}
                  </span>
                ))}
              </motion.span>
            </span>
          </motion.span>
        )
      })}
    </span>
  )
}
