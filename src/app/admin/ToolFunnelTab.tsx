'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { FunnelCounts, ToolFunnel } from '@/lib/toolEvents/funnel'
import { VISITOR_ID_RE } from '@/lib/toolEvents/schema'
import { VISITOR_KEY } from '@/lib/tools-i18n/toolEvents'

// Id этого браузера в бесплатных инструментах: сервер спрячет все его
// события (и те, что были до первого открытия /admin).
function selfVisitorParam(): string {
  try {
    const v = window.localStorage.getItem(VISITOR_KEY)
    return v && VISITOR_ID_RE.test(v) ? `&self=${encodeURIComponent(v)}` : ''
  } catch {
    return ''
  }
}

// /admin → «Инструменты»: воронка бесплатных инструментов из своей таблицы
// tool_events (Vercel Web Analytics у проекта не включён). Данные —
// GET /api/admin/tool-funnel. Только по-русски, как и весь /admin.

const TOOL_LABELS: Record<string, string> = {
  kp: 'КП',
  schet: 'Счёт на оплату',
  avr: 'АВР',
  nakladnaya: 'Накладная',
  kontragent: 'Проверка контрагента',
  nalogi: 'Налоги ИП',
  margin: 'Маржа Kaspi',
  waybills: 'Склейка накладных',
}

const MEDIUM_LABELS: Record<string, string> = {
  cta: 'карточка',
  limit: 'лимит',
  fullcard: 'полная карточка',
  product: 'Kaspi Bot',
  upgrade: 'подключить',
  export: 'Excel',
  other: 'прочее',
}

type FunnelResponse =
  | (ToolFunnel & { truncated?: boolean })
  | { missingTable: true; migration: string }
  | { error: string }

const fmtPct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`)

const shortDay = (day: string | undefined) => (day ? day.slice(5).split('-').reverse().join('.') : '')

function Cell({ n, p }: { n: number; p?: number | null }) {
  return (
    <div className="text-right tabular-nums">
      <div className="text-sm text-white">{n.toLocaleString('ru-RU')}</div>
      {p !== undefined && <div className="text-[11px] text-gray-500">{fmtPct(p)}</div>}
    </div>
  )
}

function mediumLine(c: FunnelCounts): string {
  return Object.entries(c.ctaByMedium)
    .filter(([, n]) => n > 0)
    .map(([m, n]) => `${MEDIUM_LABELS[m] ?? m}: ${n}`)
    .join(' · ')
}

const GRID = 'grid grid-cols-[minmax(140px,1.6fr)_repeat(6,minmax(70px,1fr))] gap-3 px-4 py-3 min-w-[720px]'

function Row({ label, c, strong = false }: { label: string; c: FunnelCounts; strong?: boolean }) {
  const media = mediumLine(c)
  return (
    <div className={`${GRID} items-start ${strong ? 'bg-gray-700/40' : ''}`}>
      <div>
        <div className={`text-sm ${strong ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>{label}</div>
        {media && <div className="text-[11px] text-gray-500 mt-0.5">кнопки — {media}</div>}
      </div>
      <Cell n={c.visitors} />
      <Cell n={c.docs} p={c.docsPct} />
      <Cell n={c.limits} />
      <Cell n={c.cta} p={c.ctaPct} />
      <Cell n={c.leads} />
      <Cell n={c.signups} p={c.signupsPct} />
    </div>
  )
}

export default function ToolFunnelTab() {
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [internal, setInternal] = useState(false)
  const [data, setData] = useState<FunnelResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/admin/tool-funnel?days=${days}&internal=${internal ? 1 : 0}${selfVisitorParam()}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
          cache: 'no-store',
        })
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && body && ('tools' in body || 'missingTable' in body)) setData(body)
        else setData({ error: (body && typeof body.error === 'string' && body.error) || `HTTP ${res.status}` })
      } catch (e) {
        if (!cancelled) setData({ error: e instanceof Error ? e.message : 'network' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [days, internal])

  const funnel = data && 'tools' in data ? data : null
  const maxDay = funnel ? Math.max(1, ...funnel.series.map(d => d.visitors)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-md text-xs font-medium ${days === d ? 'bg-[#1C2056] text-white' : 'text-gray-400'}`}>
              {d} дн.
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} className="accent-[#2DC48D]" />
          показать наши визиты
        </label>
        {loading && <span className="text-xs text-gray-500">загрузка…</span>}
      </div>

      {data && 'missingTable' in data && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-200">
          <div className="font-medium mb-1">Таблицы tool_events ещё нет — события пока никуда не пишутся.</div>
          <div className="text-yellow-200/80">
            Выполните в Supabase → SQL Editor файл{' '}
            <code className="font-mono bg-black/30 px-1.5 py-0.5 rounded">{data.migration}</code>
            {' '}— сбор начнётся сразу, выкатывать ничего не нужно.
          </div>
        </div>
      )}

      {data && 'error' in data && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          Не удалось загрузить воронку: {data.error}
        </div>
      )}

      {funnel && (
        <>
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <div className={`${GRID} border-b border-gray-700 text-[11px] text-gray-400 uppercase`}>
              <div>Инструмент</div>
              <div className="text-right">Посетители</div>
              <div className="text-right">Документы</div>
              <div className="text-right">Лимит</div>
              <div className="text-right">Кнопка «Попробовать» / «Открыть кабинет»</div>
              <div className="text-right">Лиды</div>
              <div className="text-right">Регистрации</div>
            </div>
            <div className="divide-y divide-gray-700">
              {funnel.tools.map(r => <Row key={r.tool} label={TOOL_LABELS[r.tool] ?? r.tool} c={r} />)}
              <Row label="Всего" c={funnel.totals} strong />
            </div>
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <div>
              % — доля посетителей инструмента, у которых было хотя бы одно такое действие; у регистраций — регистрации к посетителям.
              Посетитель — браузер; «Всего» считает каждого один раз, даже если он открыл несколько инструментов.
            </div>
            <div>
              Регистрация засчитывается инструменту, который браузер открыл первым за 30 дней до неё.
              Без инструмента: {funnel.unattributedSignups}.
            </div>
            {!funnel.includeInternal && <div>Наши визиты скрыты: этот браузер и браузеры, открывавшие /admin (визиты в инструменты с того момента и всё того же браузера за период), и боты/безголовые браузеры. Вход админом в инструментах сам по себе не распознаётся — откройте /admin с того устройства.</div>}
            {funnel.truncated && <div className="text-yellow-400">Событий больше 200 000 — показаны самые свежие, первые дни периода неполные.</div>}
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
            <div className="font-medium text-sm mb-1">По дням (Алматы)</div>
            <div className="flex flex-wrap gap-3 text-[11px] text-gray-400 mb-3">
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500/60" /> посетители</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#2DC48D]" /> документы</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" /> были регистрации</span>
            </div>
            <div className="flex items-end gap-[2px] h-32">
              {funnel.series.map(d => (
                <div key={d.day} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
                  title={`${shortDay(d.day)}: посетители ${d.visitors}, документы ${d.docs}, регистрации ${d.signups}`}>
                  {d.signups > 0 && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 mb-0.5 flex-shrink-0" />}
                  <div className="w-full rounded-t-sm bg-blue-500/60 relative"
                    style={{ height: `${(d.visitors / maxDay) * 100}%`, minHeight: d.visitors ? 2 : 0 }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-[#2DC48D] rounded-t-sm"
                      style={{ height: d.visitors ? `${Math.min(100, (d.docs / d.visitors) * 100)}%` : 0, minHeight: d.docs ? 2 : 0 }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 mt-1">
              <span>{shortDay(funnel.series[0]?.day)}</span>
              <span>{shortDay(funnel.series[funnel.series.length - 1]?.day)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
