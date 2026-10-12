'use client'
import { track } from '@vercel/analytics'

// Мягкий крючок под бесплатными инструментами (решение основателя 12.10.2026:
// «бесплатные тулы должны цеплять на регистрацию»). Жёсткий лимит — только у
// проверки контрагента, где каждый запрос тратит квоту КГД; калькулятору и
// склейке накладных хватает этой карточки.
export default function ToolCta({ source }: { source: string }) {
  return (
    <div className="nav-glass rounded-2xl p-5 mt-6">
      <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
        Инструменты бесплатные. Платформа — тоже.
      </div>
      <p className="text-[13px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        Счета за минуту, приём оплат Kaspi, проверка контрагентов без лимита и учёт финансов —
        в одном кабинете invoices.kz. Регистрация по ссылке на почту, карта не нужна.
      </p>
      <a
        href={`/login?utm_source=tools&utm_medium=cta&utm_campaign=${source}`}
        onClick={() => track('tool_cta_click', { source })}
        className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5"
        style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}
      >
        Начать бесплатно
      </a>
    </div>
  )
}
