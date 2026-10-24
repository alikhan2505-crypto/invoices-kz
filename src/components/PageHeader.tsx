'use client'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'

// ЕДИНАЯ шапка страницы личного кабинета (решение основателя 15-16.10.2026:
// «мы же должны соответствовать одному стилю!!»): стрелка «назад» (44x44) +
// крупный заголовок БЕЗ белой карточки вокруг; справа -- необязательное
// главное действие. Эталон -- /profile/contracts. Не копируйте разметку на
// страницы, берите этот компонент.
//
//   backHref  -- куда ведёт стрелка (обычная ссылка, работает и в новой вкладке);
//   onBack    -- вместо ссылки, если нужна логика (router.back и т.п.);
//   без обоих -- стрелки нет (корневые разделы: дашборд, история, новый счёт);
//   right     -- кнопки/статус справа (см. PageHeaderButton);
//   subtitle  -- серая строка под заголовком;
//   as        -- h1 или h2 (по умолчанию h1: на странице кабинета один заголовок, и это он);
//   animate   -- мягкое появление (отключается само при prefers-reduced-motion).
//
// Вертикаль: всё прижато к верху строки, а не по центру. Строка заголовка --
// блок 44px (py-2 + leading-7), в одной строке со стрелкой 44x44 и кнопками
// справа; подзаголовок идёт под этим блоком. Поэтому линия заголовка стоит на
// одном y и с подзаголовком, и без него (раньше центровка в min-h-11 сдвигала
// её на 8px). Отступ под шапкой mb-5 помечен data-page-header: PageContainer
// по этой метке обнуляет верхний отступ первого соседа, и зазор везде ровно 20px.

const EASE = [0.16, 1, 0.3, 1] as const

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

const BACK_CLS =
  'w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nav-accent-track)]'

export type PageHeaderProps = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  backHref?: string
  onBack?: () => void
  right?: React.ReactNode
  as?: 'h1' | 'h2'
  titleId?: string
  titleClassName?: string
  className?: string
  animate?: boolean
}

export default function PageHeader({
  title, subtitle, backHref, onBack, right, as = 'h1', titleId, titleClassName, className, animate = true,
}: PageHeaderProps) {
  const { lang } = useLanguage()
  const reduceMotion = !!useReducedMotion()
  const Heading = as
  // Вкладка и история браузера называют страницу её заголовком («История
  // счетов — INVOICES.KZ»), а не одной общей строкой на все страницы кабинета.
  // Заголовок-заглушка (Skeleton) строкой не является -- тогда остаётся прежний title.
  usePageDocumentTitle(title)
  const hasBack = !!backHref || !!onBack

  const backControl = backHref ? (
    <Link href={backHref} aria-label={backLabel(lang)} className={BACK_CLS} style={{ color: 'var(--nav-text-secondary)' }}>
      <ChevronLeftIcon />
    </Link>
  ) : onBack ? (
    <button type="button" onClick={onBack} aria-label={backLabel(lang)} className={BACK_CLS} style={{ color: 'var(--nav-text-secondary)' }}>
      <ChevronLeftIcon />
    </button>
  ) : null

  return (
    <motion.div
      data-page-header=""
      className={`flex items-start gap-3 mb-5 min-h-11 ${className ?? ''}`}
      initial={animate && !reduceMotion ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: animate && !reduceMotion ? 0.35 : 0, ease: EASE }}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {hasBack && backControl}
        <div className="min-w-0">
          <Heading
            id={titleId}
            className={`text-xl leading-7 py-2 min-h-11 font-bold break-words ${titleClassName ?? ''}`}
            style={{ color: 'var(--nav-text-primary)' }}
          >
            {title}
          </Heading>
          {subtitle && (
            <p className="text-sm -mt-1.5 pb-1" style={{ color: 'var(--nav-text-secondary)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      {right && <div className="ml-auto flex items-center gap-2 flex-shrink-0 min-h-11">{right}</div>}
    </motion.div>
  )
}

// Кнопка действия для слота right: главная (акцент) или спокойная (стекло).
export function PageHeaderButton({
  variant = 'primary', className, style, children, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'danger-soft' }) {
  const base = 'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
  const look =
    variant === 'primary'
      ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
      : variant === 'danger-soft'
        ? { color: 'var(--nav-critical)' }
        : { color: 'var(--nav-text-primary)' }
  return (
    <button
      type="button"
      {...rest}
      className={`${base} ${variant === 'primary' ? '' : 'nav-glass'} ${className ?? ''}`}
      style={{ ...look, ...style }}
    >
      {children}
    </button>
  )
}
