'use client'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { proGateCtaDict } from '@/lib/i18n/proGate'
import { PLAN_PRICES } from '@/lib/plans/pricing'

// ЕДИНЫЙ Про-замок личного кабинета (план стиля 23.10.2026, пункт 9): раньше
// documents / templates / acquiring / contracts / signature рисовали его пятью
// разными способами. Слова у каждой страницы свои и приходят пропсами; общая
// только подпись кнопки по умолчанию («Перейти к тарифам», proGate.ts).
//
// Заголовок («Доступно на тарифе Про») и подпись кнопки («Перейти к тарифам») ОДНИ
// на все замки: берутся из proGate.ts, страницы их не переопределяют. Значок
// тоже один (замок). Страница передаёт только своё пояснение.
//
//   Весь экран закрыт (documents, templates):
//     <ProGate description={t.documentsLockedDesc} />
//     showPrice -- отдельная приглушённая строка с ценой Про из PLAN_PRICES;
//     title / cta / icon -- только для особых случаев (продление: lapsedTitle);
//     href -- по умолчанию /upgrade;
//     animate  -- мягкое появление (само отключается при prefers-reduced-motion).
//
//   Закрыт кусок страницы (acquiring, contracts, signature):
//     <ProGateBanner title={useProGateText().title} badge={t.proBadge} icon={<BankIcon />} />  -- карточка с кнопкой
//     <ProGateBanner variant="note" description={t.ecpProOnlyNote} />                        -- строка со ссылкой
//     icon -- значок слева от заголовка карточки (BankIcon и т.п.); description у карточки необязателен.
//
// Только отрисовка: кто и когда видит замок, решает страница. Ссылка обычная
// (работает и в новой вкладке), префетч выключен: /upgrade тяжёлая страница.

const EASE = [0.16, 1, 0.3, 1] as const

/** Общие слова Про-замка на языке пользователя: { title, cta, priceLine }. */
export function useProGateText() {
  const { lang } = useLanguage()
  return proGateCtaDict[lang]
}

function formatProPrice(): string {
  return `${PLAN_PRICES.pro.monthly.toLocaleString('ru-KZ')} ₸`
}

function LockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

const BTN_BASE = 'text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
const BTN_STYLE = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } as const

export type ProGateProps = {
  title?: React.ReactNode
  description: React.ReactNode
  /** Отдельная приглушённая строка с ценой Про (из PLAN_PRICES) под кнопкой. */
  showPrice?: boolean
  cta?: string
  href?: string
  icon?: React.ReactNode
  animate?: boolean
  className?: string
}

export default function ProGate({
  title, description, showPrice, cta, href = '/upgrade', icon, animate = true, className,
}: ProGateProps) {
  const words = useProGateText()
  const reduceMotion = !!useReducedMotion()
  const move = animate && !reduceMotion
  return (
    <motion.div
      initial={move ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: move ? 0.36 : 0, ease: EASE, delay: move ? 0.06 : 0 }}
      className={`nav-glass nav-card-accent rounded-2xl p-8 text-center ${className ?? ''}`.trim()}
    >
      <div className="flex justify-center mb-4" style={{ color: 'var(--nav-accent)' }}>
        {icon ?? <LockIcon size={40} />}
      </div>
      <h2 className="font-bold text-base mb-2" style={{ color: 'var(--nav-text-primary)' }}>{title ?? words.title}</h2>
      <p className="text-sm mb-6 max-w-xs mx-auto text-balance" style={{ color: 'var(--nav-text-secondary)' }}>{description}</p>
      <Link href={href} prefetch={false} className={`inline-block px-6 py-3 rounded-xl ${BTN_BASE}`} style={BTN_STYLE}>
        {cta ?? words.cta}
      </Link>
      {showPrice && (
        <p className="text-xs mt-3" style={{ color: 'var(--nav-text-muted)' }}>{words.priceLine(formatProPrice())}</p>
      )}
    </motion.div>
  )
}

export type ProGateBannerProps = {
  description?: React.ReactNode
  variant?: 'card' | 'note'
  title?: React.ReactNode
  badge?: string
  cta?: string
  href?: string
  icon?: React.ReactNode
  animate?: boolean
  className?: string
}

export function ProGateBanner({
  description, variant = 'card', title, badge, cta, href = '/upgrade', icon, animate = true, className,
}: ProGateBannerProps) {
  const words = useProGateText()
  const reduceMotion = !!useReducedMotion()
  const move = animate && !reduceMotion
  const label = cta ?? words.cta

  if (variant === 'note') {
    return (
      <p
        className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${className ?? ''}`.trim()}
        style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}
      >
        {description}{' '}
        <Link href={href} prefetch={false} className="underline font-medium" style={{ color: 'var(--nav-accent)' }}>
          {label}
        </Link>
      </p>
    )
  }

  return (
    <motion.div
      initial={move ? { opacity: 0, y: 16 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: move ? 0.36 : 0, ease: EASE, delay: move ? 0.05 : 0 }}
      className={`nav-glass nav-card-accent rounded-2xl p-4 ${className ?? ''}`.trim()}
    >
      {(title || icon || badge) && (
        <div className={`flex items-center gap-3 ${description ? 'mb-2' : 'mb-3'}`}>
          {icon && (
            <span
              className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}
            >
              {icon}
            </span>
          )}
          {title && <div className="text-sm font-semibold flex-1" style={{ color: 'var(--nav-text-primary)' }}>{title}</div>}
          {badge && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
              <LockIcon size={10} />
              {badge}
            </span>
          )}
        </div>
      )}
      {description && <div className="text-xs mb-3" style={{ color: 'var(--nav-text-secondary)' }}>{description}</div>}
      <Link href={href} prefetch={false} className={`block w-full text-center rounded-xl py-2.5 ${BTN_BASE}`} style={BTN_STYLE}>
        {label}
      </Link>
    </motion.div>
  )
}
