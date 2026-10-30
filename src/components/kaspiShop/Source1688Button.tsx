'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { canUseSource1688 } from '@/lib/kaspiShop/source1688'

// «Найти на 1688» на карточке товара в «Нишах» (этап 0, 30.10.2026): открывает окно с китайскими
// запросами для 1688, оценкой веса, плашками рисков и ссылкой в калькулятор маржи. Ничего с 1688
// не получает, это только ссылки и подсказки. Пока включён админ-гейт (source1688.ts) кнопку
// видит только админ: чтобы не тащить флаг через все таблицы страницы, кнопка сама спрашивает
// профиль один раз на вкладку.

export interface Source1688Product {
  name: string
  price: number
  brand?: string | null
  category?: string | null
  imageUrl?: string | null
}

interface Result {
  queries: { zh: string; ru: string; url: string }[]
  weightGrams: number | null
  risks: { key: string; text: string }[]
  marginHref: string
}

// Профиль читается один раз на вкладку: десятки кнопок на странице не плодят запросов.
let adminPromise: Promise<boolean> | null = null
function readIsAdmin(): Promise<boolean> {
  if (!adminPromise) {
    adminPromise = (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return false
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
        return data?.is_admin === true
      } catch {
        return false
      }
    })()
  }
  return adminPromise
}

function useCanUse(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readIsAdmin().then(a => { if (!cancelled) setOk(canUseSource1688(a)) })
    return () => { cancelled = true }
  }, [])
  return ok
}

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; result: Result }

function Dialog({ product, onClose }: { product: Source1688Product; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/kaspi-shop/niches/source-1688', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ name: product.name, price: product.price, brand: product.brand ?? '', category: product.category ?? '' }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) { setPhase({ kind: 'error', message: typeof data?.error === 'string' ? data.error : 'Не получилось подобрать запросы' }); return }
        setPhase({ kind: 'done', result: data as Result })
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: 'Не получилось подобрать запросы — проверьте интернет и попробуйте ещё раз' })
      }
    })()
    return () => { cancelled = true }
  }, [product])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const muted = { color: 'var(--nav-text-muted)' } as const
  const secondary = { color: 'var(--nav-text-secondary)' } as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(10,12,28,0.55)' }}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="s1688-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: 'var(--nav-surface-chrome)', border: '1px solid var(--nav-border)', boxShadow: 'var(--nav-card-glow)' }}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 id="s1688-title" className="text-base font-bold" style={{ color: 'var(--nav-text-primary)' }}>Найти на 1688</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" autoFocus
            className="min-w-11 min-h-11 -mt-2 -mr-2 text-xl leading-none" style={muted}>×</button>
        </div>
        <p className="text-[13px] mb-4 line-clamp-2" style={secondary}>{product.name} · {product.price.toLocaleString('ru-KZ')} ₸ на Kaspi</p>

        {phase.kind === 'loading' && <p className="text-sm py-6 text-center" style={secondary} role="status">Подбираю запросы на китайском…</p>}
        {phase.kind === 'error' && <p className="text-sm py-3" style={{ color: 'var(--nav-critical)' }} role="alert">{phase.message}</p>}

        {phase.kind === 'done' && (
          <>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>Поисковые запросы</div>
            <ul className="space-y-2 mb-4">
              {phase.result.queries.map(q => (
                <li key={q.zh} className="rounded-xl p-3" style={{ border: '1px solid var(--nav-border)' }}>
                  <div className="text-base font-semibold" lang="zh-Hans" style={{ color: 'var(--nav-text-primary)' }}>{q.zh}</div>
                  {q.ru && <div className="text-[12px]" style={secondary}>{q.ru}</div>}
                  <a href={q.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
                    Открыть поиск на 1688 ↗
                  </a>
                </li>
              ))}
            </ul>

            {product.imageUrl && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-1" style={muted}>Поиск по фото</div>
                <p className="text-[12px] mb-1" style={secondary}>
                  Часто точнее слов: на 1688 (сайт или приложение) нажмите значок камеры и загрузите фото товара.
                </p>
                <a href={product.imageUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center min-h-11 text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--nav-accent)' }}>
                  Открыть фото товара ↗
                </a>
              </div>
            )}

            {phase.result.weightGrams !== null && (
              <p className="text-[12px] mb-3" style={secondary}>
                Оценка веса: около {phase.result.weightGrams.toLocaleString('ru-KZ')} г вместе с упаковкой. Это догадка модели, проверьте по карточке на 1688.
              </p>
            )}

            <ul className="space-y-1.5 mb-4">
              {phase.result.risks.map(r => (
                <li key={r.key} className="text-[12px] rounded-lg px-3 py-2"
                  style={{ background: 'color-mix(in srgb, var(--nav-warning) 12%, transparent)', color: 'var(--nav-text-secondary)' }}>
                  {r.text}
                </li>
              ))}
            </ul>

            <a href={phase.result.marginHref}
              className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 min-h-11 text-sm font-semibold"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              Посчитать маржу
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function Source1688Button({ product }: { product: Source1688Product }) {
  const allowed = useCanUse()
  const [open, setOpen] = useState(false)
  if (!allowed) return null
  return (
    <>
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}
        aria-label={`Найти на 1688: ${product.name}`}
      >
        1688
      </button>
      {open && typeof document !== 'undefined' && createPortal(<Dialog product={product} onClose={() => setOpen(false)} />, document.body)}
    </>
  )
}
