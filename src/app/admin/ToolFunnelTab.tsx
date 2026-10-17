'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { FunnelCounts, ToolFunnel } from '@/lib/toolEvents/funnel'
import type { TrafficResponse } from '@/lib/visits/sourcesServer'
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
  waybills: 'Печать накладных (склейка)',
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

// Классы источника заходов на лендинги (site_visits) и регистраций (signup_sources).
const CLASS_LABELS: Record<string, string> = {
  car_exact: 'С машины (QR, точно)',
  car_likely: 'С машины (оценка)',
  search: 'Поиск',
  social: 'Соцсети и мессенджеры',
  referral: 'Другие сайты и метки',
  direct_other: 'Прямые и прочие',
  unknown: 'Источник неизвестен',
}

type TrafficState = TrafficResponse | { error: string } | null

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

// Пара «7 дн. / 30 дн.» в одной ячейке.
function Pair({ v }: { v: [number, number] }) {
  return (
    <div className="text-right tabular-nums">
      <span className="text-sm text-white">{v[0].toLocaleString('ru-RU')}</span>
      <span className="text-[11px] text-gray-500"> / {v[1].toLocaleString('ru-RU')}</span>
    </div>
  )
}

const TRAFFIC_GRID = 'grid grid-cols-[minmax(160px,1.8fr)_repeat(2,minmax(90px,1fr))] gap-3 px-4 py-3 min-w-[420px]'

const GRID = 'grid grid-cols-[minmax(140px,1.6fr)_repeat(6,minmax(70px,1fr))] gap-3 px-4 py-3 min-w-[720px]'

function Row({ label, c, strong = false, sub }: { label: string; c: FunnelCounts; strong?: boolean; sub?: string }) {
  const media = mediumLine(c)
  return (
    <div className={`${GRID} items-start ${strong ? 'bg-gray-700/40' : ''}`}>
      <div className="min-w-0">
        <div className={`text-sm break-words ${strong ? 'font-bold text-white' : 'font-medium text-gray-200'}`}>{label}</div>
        {sub !== undefined
          ? sub && <div className="text-[11px] text-gray-500 mt-0.5 break-words">{sub}</div>
          : media && <div className="text-[11px] text-gray-500 mt-0.5">кнопки — {media}</div>}
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
  const [traffic, setTraffic] = useState<TrafficState>(null)

  // Заходы на лендинги и регистрации по источникам: окна 7 и 30 дней фиксированы,
  // поэтому грузим один раз, а не при каждом переключении периода воронки.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/traffic-sources', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
          cache: 'no-store',
        })
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (res.ok && body && 'classes' in body) setTraffic(body)
        else setTraffic({ error: (body && typeof body.error === 'string' && body.error) || `HTTP ${res.status}` })
      } catch (e) {
        if (!cancelled) setTraffic({ error: e instanceof Error ? e.message : 'network' })
      }
    })()
    return () => { cancelled = true }
  }, [])

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

          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
            <div className="px-4 pt-4 pb-2">
              <div className="font-medium text-sm">По меткам ссылок (utm), все инструменты вместе</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Источник, канал, кампания — то, что стоит в адресе (короткие ссылки /go/… ставят метки сами). Период — как сверху.</div>
            </div>
            <div className={`${GRID} border-y border-gray-700 text-[11px] text-gray-400 uppercase`}>
              <div>Источник / канал · кампания</div>
              <div className="text-right">Посетители</div>
              <div className="text-right">Документы</div>
              <div className="text-right">Лимит</div>
              <div className="text-right">Кнопка «Попробовать» / «Открыть кабинет»</div>
              <div className="text-right">Лиды</div>
              <div className="text-right">Регистрации</div>
            </div>
            <div className="divide-y divide-gray-700">
              {funnel.sources.map(r => {
                const blank = !r.source && !r.medium && !r.campaign
                const sub = blank ? 'прямые заходы, поиск, органика' : [r.medium, r.campaign].filter(Boolean).join(' · ')
                return <Row key={`${r.source}|${r.medium}|${r.campaign}`} label={blank ? '(без метки)' : (r.source ?? '(источник не указан)')} sub={sub} c={r} />
              })}
              {funnel.sources.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">За период событий нет.</div>}
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Метка читается из адреса при заходе и держится до конца вкладки; регистрация несёт метку первого касания (до 30 дней). Регистрации без инструмента в этот разрез не попадают.
          </div>

          <TrafficBlock traffic={traffic} />
        </>
      )}
    </div>
  )
}

function TrafficBlock({ traffic }: { traffic: TrafficState }) {
  if (!traffic) return <div className="text-xs text-gray-500">Заходы на лендинги: загрузка…</div>
  if ('error' in traffic) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
        Не удалось загрузить заходы на лендинги: {traffic.error}
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {(traffic.visitsMissing || traffic.signupsMissing) && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-200">
          <div className="font-medium mb-1">
            Таблиц {[traffic.visitsMissing && 'site_visits', traffic.signupsMissing && 'signup_sources'].filter(Boolean).join(' и ')} ещё нет — данные пока не пишутся.
          </div>
          <div className="text-yellow-200/80">
            Выполните в Supabase → SQL Editor файл{' '}
            <code className="font-mono bg-black/30 px-1.5 py-0.5 rounded">{traffic.migration}</code>.
          </div>
        </div>
      )}
      {traffic.failed && !(traffic.visitsMissing && traffic.signupsMissing) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-300">Часть данных не прочиталась — цифры ниже неполные.</div>
      )}

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
        <div className="px-4 pt-4 pb-2">
          <div className="font-medium text-sm">Лендинги и регистрации по источникам</div>
          <div className="text-[11px] text-gray-500 mt-0.5">Заходы на главную и страницы продуктов (не инструменты). В ячейке: за 7 дней / за 30 дней.</div>
        </div>
        <div className={`${TRAFFIC_GRID} border-y border-gray-700 text-[11px] text-gray-400 uppercase`}>
          <div>Источник</div>
          <div className="text-right">Заходы</div>
          <div className="text-right">Регистрации</div>
        </div>
        <div className="divide-y divide-gray-700">
          {traffic.classes.filter(c => c.visits[1] + c.signups[1] > 0).map(c => (
            <div key={c.cls} className={`${TRAFFIC_GRID} items-center`}>
              <div className="text-sm font-medium text-gray-200">{CLASS_LABELS[c.cls] ?? c.cls}</div>
              <Pair v={c.visits} />
              <Pair v={c.signups} />
            </div>
          ))}
          {traffic.classes.every(c => c.visits[1] + c.signups[1] === 0) && (
            <div className="px-4 py-3 text-sm text-gray-500">За 30 дней записей нет.</div>
          )}
          <div className={`${TRAFFIC_GRID} items-center bg-gray-700/40`}>
            <div className="text-sm font-bold text-white">Всего</div>
            <Pair v={traffic.totals.visits} />
            <Pair v={traffic.totals.signups} />
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
        <div className="px-4 pt-4 pb-2">
          <div className="font-medium text-sm">Заходы на лендинги по меткам (utm_source, utm_campaign)</div>
        </div>
        <div className={`${TRAFFIC_GRID} border-y border-gray-700 text-[11px] text-gray-400 uppercase`}>
          <div>Источник · кампания</div>
          <div className="text-right">Заходы 7 / 30 дн.</div>
          <div />
        </div>
        <div className="divide-y divide-gray-700">
          {traffic.utm.map(u => (
            <div key={`${u.source}|${u.campaign}`} className={`${TRAFFIC_GRID} items-center`}>
              <div className="min-w-0 text-sm font-medium text-gray-200 break-words">
                {u.source ?? '(источник не указан)'}
                {u.campaign && <span className="text-[11px] text-gray-500 font-normal"> · {u.campaign}</span>}
              </div>
              <Pair v={u.visits} />
              <div />
            </div>
          ))}
          {traffic.utm.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">Заходов с метками за 30 дней нет.</div>}
          <div className={`${TRAFFIC_GRID} items-center`}>
            <div className="text-sm text-gray-400">Без метки</div>
            <Pair v={traffic.totals.noUtmVisits} />
            <div />
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-500">
        Боты, браузеры основателя (внутренняя метка) и тестовые прогоны в заходы не попадают. Регистрации — класс первого касания браузера (до 30 дней).
        {traffic.truncated && <span className="text-yellow-400"> Записей больше 200 000 — показаны самые свежие.</span>}
      </div>
    </div>
  )
}
