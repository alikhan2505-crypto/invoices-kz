'use client'
import { usePathname } from 'next/navigation'
import { isKkUnderReview } from '@/lib/kkReview'

// Небольшая плашка «текст проходит проверку» для kk-страниц, чьи казахские
// тексты ещё не вычитал основатель (реестр: src/lib/kkReview.ts). Решение
// 25.10.2026: пока не вычитано, не выдаём такой текст за утверждённый.
//
// Сама решает, показываться ли: по адресу страницы (usePathname) или по
// явно переданному pathname. Для страницы вне реестра возвращает null, поэтому
// её можно безопасно ставить в общие обёртки. Обычный блок в потоке страницы
// (без fixed/sticky), на сервере рендерится сразу: индексацию и раскладку
// страницы не меняет. Цвета только токенами --nav-*, поэтому в светлой и
// тёмной теме читается сама. Две строки: казахская и русская, чтобы понял
// и тот, кто читает по-русски.

const KK_TEXT = 'Бұл мәтін қазір тексеріліп жатыр, қателіктер болуы мүмкін.'
const RU_TEXT = 'Текст проходит проверку, возможны неточности.'

export default function KkReviewNotice({ pathname, className = '' }: { pathname?: string; className?: string }) {
  const route = usePathname()
  if (!isKkUnderReview(pathname ?? route)) return null
  return (
    <div
      role="note"
      data-kk-review-notice
      className={`flex items-start gap-2.5 rounded-xl px-3 py-2 ${className}`}
      style={{
        background: 'var(--nav-surface-glass)',
        border: '1px solid var(--nav-border-soft)',
        color: 'var(--nav-text-secondary)',
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        className="mt-[3px] flex-shrink-0"
        fill="none"
        stroke="var(--nav-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 7.25v3.5" />
        <circle cx="8" cy="5" r="0.4" fill="var(--nav-accent)" />
      </svg>
      <p className="text-xs leading-snug m-0">
        <span lang="kk" className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{KK_TEXT}</span>
        <br />
        <span lang="ru" style={{ color: 'var(--nav-text-muted)' }}>{RU_TEXT}</span>
      </p>
    </div>
  )
}
