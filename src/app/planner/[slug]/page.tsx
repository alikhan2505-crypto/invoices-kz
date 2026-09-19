'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'

type LoginState = { code: string; botUsername: string; qrDataUrl: string | null }

type Draft = {
  id: string
  service_name: string
  master_name: string | null
  starts_at: string
  duration_minutes: number | null
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  status: string
  error_message: string | null
  conversation_id: string
  channel: string | null
}

type Booking = {
  id: string
  master_name: string | null
  service_name: string
  client_name: string | null
  client_phone: string | null
  starts_at: string
  duration_minutes: number | null
  status: string
  conversation_id: string | null
  source: string
}

type Theme = 'light' | 'dark' | 'auto'
type Lang = 'ru' | 'kk'

// Planner-only UI strings. Deliberately scoped to what the OWNER reads in
// this page's own chrome -- the quick-reply message BODIES sent to
// customers (buildQuickReplies below) are a separate, more consequential
// translation surface handled on their own.
const STRINGS = {
  ru: {
    loading: 'Загрузка…',
    salonNotFound: 'Салон не найден',
    loginFailed: 'Не удалось начать вход',
    loginTitle: 'Вход в планировщик',
    loginBody: 'Откройте Telegram на телефоне и отсканируйте QR-код — это подтвердит, что вы владелец салона.',
    qrAlt: 'QR для входа в планировщик',
    qrPreparing: 'Готовлю QR…',
    plannerTitle: 'Планировщик',
    addBooking: 'Добавить бронь',
    draftsHeading: 'Черновики записей',
    noName: 'Без имени',
    lastErrorPrefix: 'Ошибка при прошлой попытке:',
    confirm: 'Подтвердить',
    reject: 'Отклонить',
    decideFailed: 'Не удалось выполнить действие',
    scheduleHeading: 'Расписание',
    noBookings: 'На этот день записей нет.',
    unassigned: 'Без мастера',
    cancelled: 'отменена',
    message: 'Написать',
    reschedule: 'Перенести',
    cancel: 'Отменить',
    confirmCancelPrompt: 'Отменить эту запись?',
    cancelFailed: 'Не удалось отменить',
    close: 'Закрыть',
    addBookingTitle: 'Добавить бронь',
    serviceLabel: 'Услуга',
    masterOptional: 'Мастер (необязательно)',
    clientName: 'Имя клиента',
    clientPhone: 'Телефон клиента',
    saving: 'Сохраняю…',
    add: 'Добавить',
    saveFailed: 'Не удалось сохранить',
    messageClientTitle: 'Написать клиенту',
    loadingThread: 'Загружаю переписку…',
    noThread: 'Переписки пока нет.',
    messageText: 'Текст сообщения',
    sending: 'Отправляю…',
    send: 'Отправить',
    sendFailed: 'Не удалось отправить',
    rescheduleTitle: 'Перенести запись',
    rescheduleFailed: 'Не удалось перенести',
    qrReplyConfirm: 'Подтвердить',
    qrReplyRemind: 'Напомнить',
    qrReplyReschedule: 'Предложить перенос',
    qrReplyLate: 'Клиент опаздывает',
    themeLight: 'Светлая тема',
    themeDark: 'Тёмная тема',
    themeAuto: 'Как в системе',
    tabSchedule: 'Расписание',
    tabClients: 'Клиенты',
    regularBadge: 'Постоянный',
    visitsCount: 'визитов',
    lastVisit: 'Последний визит',
    noPhone: 'Без телефона',
    noClients: 'Пока нет клиентов с завершёнными визитами.',
    clientProfileTitle: 'Профиль клиента',
    visitHistory: 'История посещений',
  },
  kk: {
    loading: 'Жүктелуде…',
    salonNotFound: 'Салон табылмады',
    loginFailed: 'Кіруді бастау сәтсіз аяқталды',
    loginTitle: 'Жоспарлаушыға кіру',
    loginBody: 'Телефоныңызда Telegram-ды ашып, QR-кодты сканерлеңіз — бұл сіздің салон иесі екеніңізді растайды.',
    qrAlt: 'Жоспарлаушыға кіру үшін QR-код',
    qrPreparing: 'QR дайындалуда…',
    plannerTitle: 'Жоспарлаушы',
    addBooking: 'Жазылу қосу',
    draftsHeading: 'Жазылу жобалары',
    noName: 'Аты көрсетілмеген',
    lastErrorPrefix: 'Алдыңғы әрекеттегі қате:',
    confirm: 'Растау',
    reject: 'Қабылдамау',
    decideFailed: 'Әрекет орындалмады',
    scheduleHeading: 'Кесте',
    noBookings: 'Бұл күнге жазылу жоқ.',
    unassigned: 'Маман көрсетілмеген',
    cancelled: 'болдырылды',
    message: 'Хабарласу',
    reschedule: 'Ауыстыру',
    cancel: 'Болдырмау',
    confirmCancelPrompt: 'Бұл жазылуды болдырмау керек пе?',
    cancelFailed: 'Болдырмау сәтсіз аяқталды',
    close: 'Жабу',
    addBookingTitle: 'Жазылу қосу',
    serviceLabel: 'Қызмет',
    masterOptional: 'Маман (міндетті емес)',
    clientName: 'Клиенттің аты',
    clientPhone: 'Клиенттің телефоны',
    saving: 'Сақталуда…',
    add: 'Қосу',
    saveFailed: 'Сақтау сәтсіз аяқталды',
    messageClientTitle: 'Клиентке хабарласу',
    loadingThread: 'Хат-хабар жүктелуде…',
    noThread: 'Әзірге хат-хабар жоқ.',
    messageText: 'Хабарлама мәтіні',
    sending: 'Жіберілуде…',
    send: 'Жіберу',
    sendFailed: 'Жіберу сәтсіз аяқталды',
    rescheduleTitle: 'Жазылуды ауыстыру',
    rescheduleFailed: 'Ауыстыру сәтсіз аяқталды',
    qrReplyConfirm: 'Растау',
    qrReplyRemind: 'Еске салу',
    qrReplyReschedule: 'Ауыстыруды ұсыну',
    qrReplyLate: 'Клиент кешігуде',
    themeLight: 'Ашық тема',
    themeDark: 'Қараңғы тема',
    themeAuto: 'Жүйе бойынша',
    tabSchedule: 'Кесте',
    tabClients: 'Клиенттер',
    regularBadge: 'Тұрақты',
    visitsCount: 'келу',
    lastVisit: 'Соңғы келуі',
    noPhone: 'Телефон жоқ',
    noClients: 'Әзірге аяқталған келу жоқ.',
    clientProfileTitle: 'Клиент профилі',
    visitHistory: 'Келу тарихы',
  },
} as const

function t(lang: Lang, key: keyof typeof STRINGS['ru']): string {
  return STRINGS[lang][key]
}

// Own localStorage keys, deliberately separate from the main app's
// ThemeProvider ('theme') -- see the .planner-shell comment in
// globals.css for why (shared reception tablet, not a personal account
// setting). Same safe pattern as ThemeProvider.tsx: a static default for
// the first (SSR-matching) render, the real stored value applied in an
// effect after hydration. Default 'dark' (not 'auto') so nobody who
// already uses this page sees an unrequested look change the moment this
// ships -- light/auto are opt-in via the new switch.
function usePlannerPrefs() {
  const [theme, setThemeState] = useState<Theme>('dark')
  const [lang, setLangState] = useState<Lang>('ru')

  useEffect(() => {
    const savedTheme = localStorage.getItem('planner_theme')
    if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto') setThemeState(savedTheme)
    const savedLang = localStorage.getItem('planner_lang')
    if (savedLang === 'ru' || savedLang === 'kk') setLangState(savedLang)
  }, [])

  function setTheme(v: Theme) {
    setThemeState(v)
    localStorage.setItem('planner_theme', v)
  }
  function setLang(v: Lang) {
    setLangState(v)
    localStorage.setItem('planner_lang', v)
  }

  return { theme, setTheme, lang, setLang }
}

// Stage 2 built only the QR login below; Stage 4 (this file) adds the
// authorized view on top of the same page -- see
// C:\Users\Abilbayev.Alikhan\.claude\plans\smooth-wishing-pumpkin.md.
export default function PlannerPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const { theme, setTheme, lang, setLang } = usePlannerPrefs()

  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState<{ salonName: string } | null>(null)
  const [login, setLogin] = useState<LoginState | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function startLogin() {
    setError(null)
    const res = await fetch('/api/planner/login/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error === 'not_found' ? t(lang, 'salonNotFound') : t(lang, 'loginFailed'))
      return
    }
    const qrDataUrl = await QRCode
      .toDataURL(`https://t.me/${data.botUsername}?start=planner_${data.code}`, { width: 220, margin: 1 })
      .catch(() => null)
    setLogin({ code: data.code, botUsername: data.botUsername, qrDataUrl })
  }

  async function checkSession() {
    const res = await fetch('/api/planner/session')
    if (res.ok) {
      const data = await res.json()
      setAuthed({ salonName: data.salonName })
      setLogin(null)
    } else {
      setAuthed(null)
      await startLogin()
    }
    setChecking(false)
  }

  useEffect(() => {
    if (!slug) return
    void checkSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Опрос без ограничения на число попыток -- стабильное состояние этого
  // экрана (планшет на ресепшене) это и есть "сидеть на этой странице",
  // в отличие от разового платёжного QR, который логично бросать ждать
  // через N минут.
  useEffect(() => {
    if (!login) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/planner/login/status?code=${login.code}`)
      const data = await res.json()
      if (data.status === 'confirmed') {
        clearInterval(interval)
        void checkSession()
      } else if (data.status === 'expired') {
        clearInterval(interval)
        void startLogin()
      }
    }, 3000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login?.code])

  if (checking) {
    return (
      <main className="planner-shell plnr-page min-h-screen flex items-center justify-center text-sm plnr-text-2" data-planner-theme={theme}>
        {t(lang, 'loading')}
      </main>
    )
  }

  if (authed) {
    return <PlannerDashboard salonName={authed.salonName} theme={theme} setTheme={setTheme} lang={lang} setLang={setLang} />
  }

  return (
    <main className="planner-shell plnr-page min-h-screen flex items-center justify-center p-6" data-planner-theme={theme}>
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-lg font-semibold">{t(lang, 'loginTitle')}</h1>
        <p className="text-sm plnr-text-2">{t(lang, 'loginBody')}</p>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {login?.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image тут не помогает
          <img src={login.qrDataUrl} alt={t(lang, 'qrAlt')} className="mx-auto rounded-xl bg-white p-3" />
        ) : (
          <div className="text-sm plnr-text-3">{t(lang, 'qrPreparing')}</div>
        )}
      </div>
    </main>
  )
}

const CHANNEL_LABEL: Record<string, string> = {
  // Brand names and borrowed technical terms -- identical in ru and kk,
  // no translation table needed.
  whatsapp: 'WhatsApp', instagram: 'Instagram', telegram: 'Telegram', website: 'сайт', api: 'API',
}

function localeFor(lang: Lang) {
  return lang === 'kk' ? 'kk-KZ' : 'ru-KZ'
}
function fmtDateTime(iso: string, lang: Lang) {
  return new Date(iso).toLocaleString(localeFor(lang), { timeZone: 'Asia/Almaty', dateStyle: 'medium', timeStyle: 'short' })
}
function fmtDay(iso: string, lang: Lang) {
  const s = new Date(iso).toLocaleDateString(localeFor(lang), { timeZone: 'Asia/Almaty', weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function fmtTime(iso: string, lang: Lang) {
  return new Date(iso).toLocaleTimeString(localeFor(lang), { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' })
}
// Group key in Almaty local time (fixed +05:00, same convention as the
// rest of this feature) -- a plain shift-then-slice, not a tz library.
function dayKey(iso: string) {
  return new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

type ColumnDef = { key: string; label: string; category: string | null }

// Columns start from the salon's configured category->masters roster
// (masterCategories, from GET /api/planner/bookings) so an empty column
// still reads as "this master is free", not just "nobody booked yet" --
// the whole point of a resource-calendar view. Any master in the flat
// `masters` list but not assigned to a category gets its own uncategorized
// column; any master_name a booking carries that isn't in `masters` at
// all (legacy/ad-hoc data) does too; a trailing "unassigned" column only
// when at least one booking that day actually has no master.
function buildTimelineColumns(
  masterCategories: { name: string; masters: string[] }[],
  masters: string[],
  dayBookings: Booking[],
  lang: Lang,
): ColumnDef[] {
  const unassigned = t(lang, 'unassigned')
  const categorized = new Set(masterCategories.flatMap(c => c.masters))
  const uncategorized = masters.filter(m => !categorized.has(m))
  const extra = Array.from(new Set(
    dayBookings.map(b => b.master_name).filter((m): m is string => !!m && !masters.includes(m))
  ))
  const hasUnassigned = dayBookings.some(b => !b.master_name)

  const columns: ColumnDef[] = []
  for (const cat of masterCategories) {
    for (const m of cat.masters) columns.push({ key: m, label: m, category: cat.name })
  }
  for (const m of [...uncategorized, ...extra]) columns.push({ key: m, label: m, category: null })
  if (hasUnassigned) columns.push({ key: unassigned, label: unassigned, category: null })
  return columns
}

// Consecutive columns sharing the same (non-null) category collapse into
// one spanning header cell, matching the reference layout -- an
// uncategorized master or the "no master" bucket each get their own
// single-column run with no category label above them.
function categoryRuns(columns: ColumnDef[]): { category: string | null; span: number }[] {
  const runs: { category: string | null; span: number }[] = []
  for (const col of columns) {
    const last = runs[runs.length - 1]
    if (last && last.category === col.category && col.category !== null) last.span++
    else runs.push({ category: col.category, span: 1 })
  }
  return runs
}

// One cell's booking block -- compact card, service + client name only.
// The whole card is the tap target (opens BookingActionsModal below), not
// stacked inline buttons -- doesn't fit next to other same-time bookings.
function CompactBookingCard({ booking: b, lang, onOpen }: { booking: Booking; lang: Lang; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${b.service_name} — ${b.client_name || t(lang, 'noName')}`}
      className={`w-full text-left plnr-card rounded-md px-1.5 py-1 mb-1 text-[11px] leading-tight border-l-[3px] ${b.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}
      style={{ borderLeftColor: b.status === 'cancelled' ? '#ef4444' : '#3b82f6' }}
    >
      <div className="font-medium truncate">{b.service_name}</div>
      <div className="plnr-text-2 truncate">{b.client_name || t(lang, 'noName')}</div>
    </button>
  )
}

// One day's schedule as a real <table> -- founder: hide fully-empty hour
// slots entirely (only rows for times that actually have a booking; a new
// booking at a new time just adds a row) and give every column a real
// closing border. A <table> with border-collapse gets clean, uniform
// borders on every edge (including the last column's right edge, which a
// manually-bordered div grid kept missing) basically for free, and
// table-layout:fixed + an unset <col> per data column makes them share
// the full available width evenly, however many there are.
function DayTable({ dayBookings, masters, masterCategories, lang, onOpen }: {
  dayBookings: Booking[]
  masters: string[]
  masterCategories: { name: string; masters: string[] }[]
  lang: Lang
  onOpen: (b: Booking) => void
}) {
  const columns = buildTimelineColumns(masterCategories, masters, dayBookings, lang)
  const runs = categoryRuns(columns)
  const times = Array.from(new Set(dayBookings.map(b => fmtTime(b.starts_at, lang)))).sort()
  const cellMap = new Map<string, Booking[]>()
  for (const b of dayBookings) {
    const key = `${fmtTime(b.starts_at, lang)}|${b.master_name || t(lang, 'unassigned')}`
    if (!cellMap.has(key)) cellMap.set(key, [])
    cellMap.get(key)!.push(b)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
        <colgroup>
          <col style={{ width: 64 }} />
          {columns.map(col => <col key={col.key} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="plnr-border border" />
            {runs.map((run, i) => (
              <th key={i} colSpan={run.span} className="plnr-border border text-xs font-semibold plnr-text-2 px-2 py-1 truncate">
                {run.category || ' '}
              </th>
            ))}
          </tr>
          <tr>
            <th className="plnr-border border" />
            {columns.map(col => (
              <th key={col.key} className="plnr-border border text-xs font-medium plnr-text px-2 py-1.5 truncate">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map(time => (
            <tr key={time}>
              <td className="plnr-border border text-xs plnr-text-2 px-2 py-1.5 whitespace-nowrap align-top">{time}</td>
              {columns.map(col => {
                const cellBookings = cellMap.get(`${time}|${col.key}`) || []
                return (
                  <td key={col.key} className="plnr-border border align-top p-1">
                    {cellBookings.map(b => (
                      <CompactBookingCard key={b.id} booking={b} lang={lang} onOpen={() => onOpen(b)} />
                    ))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const WEEKDAY_HEADERS: Record<Lang, string[]> = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  kk: ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сб', 'Жс'],
}

// Left-side date picker -- founder's ask: browse history as well as
// upcoming bookings, not just the next two weeks. Yellow dot = a past day
// that had bookings, green dot = today or a future day with bookings, no
// dot = nothing that day. Selecting a day drives DayTable above.
function MiniCalendar({ lang, selectedKey, onSelect, byDay, todayKey }: {
  lang: Lang
  selectedKey: string
  onSelect: (key: string) => void
  byDay: Map<string, Booking[]>
  todayKey: string
}) {
  const initial = new Date(`${selectedKey}T00:00:00`)
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(localeFor(lang), { month: 'long', year: 'numeric' })
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startOffset = (firstOfMonth.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function goPrevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  return (
    <div className="plnr-card rounded-xl p-3 w-full lg:w-[260px] shrink-0">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={goPrevMonth} className="plnr-quiet w-7 h-7 rounded-md flex items-center justify-center text-sm">‹</button>
        <div className="text-xs font-medium capitalize">{monthLabel}</div>
        <button type="button" onClick={goNextMonth} className="plnr-quiet w-7 h-7 rounded-md flex items-center justify-center text-sm">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_HEADERS[lang].map(w => <div key={w} className="text-[10px] plnr-text-3 py-1">{w}</div>)}
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const hasBookings = (byDay.get(key)?.length ?? 0) > 0
          const isSelected = key === selectedKey
          const isToday = key === todayKey
          const dotColor = hasBookings ? (key < todayKey ? 'bg-yellow-500' : 'bg-green-500') : ''
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(key)}
              className={`relative text-xs rounded-md py-1.5 ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'plnr-quiet font-semibold' : ''}`}
            >
              {day}
              {dotColor && !isSelected && <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${dotColor}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Tapping a card opens this instead of always-visible action buttons (see
// TimelineBookingCard's own comment) -- reuses the same
// message/reschedule/cancel handlers PlannerDashboard already had for the
// old flat list.
function BookingActionsModal({ booking: b, lang, onClose, onMessage, onReschedule, onCancel }: {
  booking: Booking
  lang: Lang
  onClose: () => void
  onMessage: (() => void) | null
  onReschedule: () => void
  onCancel: () => void
}) {
  return (
    <ModalShell title={b.service_name} lang={lang} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <div className="plnr-text-2">{fmtDateTime(b.starts_at, lang)}{b.master_name ? ` · ${b.master_name}` : ''}</div>
          <div>{b.client_name || t(lang, 'noName')}{b.client_phone ? `, ${b.client_phone}` : ''}</div>
        </div>
        {b.status === 'cancelled' ? (
          <div className="text-red-400">{t(lang, 'cancelled')}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {onMessage && (
              <button onClick={onMessage} className="text-left plnr-quiet rounded-lg px-3 py-2">
                {t(lang, 'message')}
              </button>
            )}
            <button onClick={onReschedule} className="text-left plnr-quiet rounded-lg px-3 py-2">
              {t(lang, 'reschedule')}
            </button>
            <button onClick={onCancel} className="text-left plnr-quiet rounded-lg px-3 py-2">
              {t(lang, 'cancel')}
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

type ClientHistoryEntry = { id: string; serviceName: string; masterName: string | null; startsAt: string; status: string }
type Client = {
  phone: string
  name: string | null
  visitCount: number
  lastVisitAt: string | null
  isRegular: boolean
  history: ClientHistoryEntry[]
}

// Founder's ask 19.09.2026: assess return rate/loyalty from real visit
// history, not a manually-set flag -- "Постоянный" comes straight from
// /api/planner/clients' own visit count (REGULAR_VISIT_THRESHOLD there),
// this just renders it.
function ClientsList({ clients, lang, onOpen }: { clients: Client[]; lang: Lang; onOpen: (c: Client) => void }) {
  if (clients.length === 0) return <div className="text-sm plnr-text-3">{t(lang, 'noClients')}</div>
  return (
    <div className="space-y-2">
      {clients.map(c => (
        <button
          key={c.phone}
          type="button"
          onClick={() => onOpen(c)}
          className="w-full text-left plnr-card rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
        >
          <div className="min-w-0">
            <div className="font-medium truncate flex items-center gap-2">
              {c.name || t(lang, 'noName')}
              {c.isRegular && (
                <span className="text-[10px] bg-green-600 text-white rounded-full px-2 py-0.5 shrink-0">{t(lang, 'regularBadge')}</span>
              )}
            </div>
            <div className="text-sm plnr-text-2 truncate">{c.phone || t(lang, 'noPhone')}</div>
          </div>
          <div className="text-sm plnr-text-2 text-right shrink-0">
            <div>{c.visitCount} {t(lang, 'visitsCount')}</div>
            {c.lastVisitAt && <div className="text-xs plnr-text-3">{t(lang, 'lastVisit')}: {fmtDateTime(c.lastVisitAt, lang)}</div>}
          </div>
        </button>
      ))}
    </div>
  )
}

function ClientProfileModal({ client: c, lang, onClose }: { client: Client; lang: Lang; onClose: () => void }) {
  return (
    <ModalShell title={c.name || t(lang, 'noName')} lang={lang} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="plnr-text-2">{c.phone || t(lang, 'noPhone')}</div>
          {c.isRegular && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5">{t(lang, 'regularBadge')}</span>}
        </div>
        <div className="plnr-text-2">{c.visitCount} {t(lang, 'visitsCount')}</div>
        <div>
          <div className="text-xs font-medium plnr-text-2 mb-1">{t(lang, 'visitHistory')}</div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {c.history.map(h => (
              <div key={h.id} className={`plnr-card-2 rounded-lg px-2.5 py-1.5 text-xs ${h.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}>
                <div className="font-medium">{h.serviceName}{h.masterName ? ` — ${h.masterName}` : ''}</div>
                <div className="plnr-text-2">{fmtDateTime(h.startsAt, lang)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

const THEME_ORDER: Theme[] = ['light', 'dark', 'auto']
const THEME_ICON: Record<Theme, string> = { light: '☀', dark: '☾', auto: '◐' }
const THEME_KEY: Record<Theme, keyof typeof STRINGS['ru']> = { light: 'themeLight', dark: 'themeDark', auto: 'themeAuto' }

function PlannerDashboard({ salonName, theme, setTheme, lang, setLang }: {
  salonName: string
  theme: Theme
  setTheme: (v: Theme) => void
  lang: Lang
  setLang: (v: Lang) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [masters, setMasters] = useState<string[]>([])
  const [masterCategories, setMasterCategories] = useState<{ name: string; masters: string[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [messageFor, setMessageFor] = useState<Booking | null>(null)
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const todayKey = dayKey(new Date().toISOString())
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [activeTab, setActiveTab] = useState<'schedule' | 'clients'>('schedule')
  const [clients, setClients] = useState<Client[]>([])
  const [clientsLoaded, setClientsLoaded] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)

  // Lazy: the clients tab reads all-time history (no date window, unlike
  // /api/planner/bookings), a separate and heavier query nobody pays for
  // unless they actually open this tab.
  const loadClients = useCallback(async () => {
    setClientsLoading(true)
    const res = await fetch('/api/planner/clients')
    if (res.ok) setClients((await res.json()).clients || [])
    setClientsLoading(false)
    setClientsLoaded(true)
  }, [])

  function openClientsTab() {
    setActiveTab('clients')
    if (!clientsLoaded) void loadClients()
  }

  const load = useCallback(async () => {
    const [draftsRes, bookingsRes] = await Promise.all([
      fetch('/api/planner/booking-drafts'),
      fetch('/api/planner/bookings'),
    ])
    if (draftsRes.ok) setDrafts((await draftsRes.json()).drafts)
    if (bookingsRes.ok) {
      const data = await bookingsRes.json()
      setBookings(data.bookings)
      setMasters(data.masters || [])
      setMasterCategories(data.masterCategories || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function decideDraft(id: string, action: 'approve' | 'reject') {
    setBusyId(id)
    setError(null)
    const res = await fetch('/api/planner/booking-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: id, action }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || t(lang, 'decideFailed'))
    }
    await load()
    setBusyId(null)
  }

  async function cancelBooking(id: string) {
    if (!confirm(t(lang, 'confirmCancelPrompt'))) return
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/planner/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || t(lang, 'cancelFailed'))
    }
    await load()
    setBusyId(null)
  }

  const byDay = new Map<string, Booking[]>()
  for (const b of bookings) {
    const k = dayKey(b.starts_at)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(b)
  }
  const selectedBookings = byDay.get(selectedDateKey) || []

  return (
    <main className="planner-shell plnr-page min-h-screen" data-planner-theme={theme}>
      {/* Founder: "растягиваешь планировщик на всю станицу... все сжатым
          смотрится" -- widened from the original max-w-3xl (768px). Not
          uncapped: on an ultrawide monitor a bare w-full would stretch
          the draft cards/title into unreadably long lines, so a generous
          cap instead -- the calendar below scrolls its own overflow-x
          regardless of this wrapper's width. Title, switches and the
          add-booking CTA share one row (founder: don't spend a whole
          extra row on the switches) instead of two stacked ones. */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-3 pb-10 space-y-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-semibold">{t(lang, 'plannerTitle')} — {salonName}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Icon buttons sized ~36px, under DESIGN.md's usual 44px rule
                but within its own documented exception for a tight
                multi-button segmented control where blowing each one up
                would make the whole cluster disproportionate. */}
            <div className="flex items-center gap-0.5 plnr-quiet rounded-lg p-0.5">
              {THEME_ORDER.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTheme(v)}
                  title={t(lang, THEME_KEY[v])}
                  aria-label={t(lang, THEME_KEY[v])}
                  className={`w-9 h-9 flex items-center justify-center rounded-md text-sm ${theme === v ? 'bg-blue-600' : ''}`}
                >
                  {THEME_ICON[v]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 plnr-quiet rounded-lg p-0.5">
              {(['ru', 'kk'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setLang(v)}
                  className={`h-9 px-2.5 rounded-md text-xs font-medium ${lang === v ? 'bg-blue-600' : ''}`}
                >
                  {v === 'ru' ? 'РУ' : 'ҚАЗ'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="shrink-0 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-2"
            >
              + {t(lang, 'addBooking')}
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-400 bg-red-950/40 rounded-lg p-3">{error}</div>}

        {drafts.length > 0 && (
          <section>
            <h2 className="text-sm font-medium plnr-text-2 mb-2">{t(lang, 'draftsHeading')} ({drafts.length})</h2>
            <div className="space-y-3">
              {drafts.map(d => (
                <div key={d.id} className="plnr-card rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{d.service_name}{d.master_name ? ` — ${d.master_name}` : ''}</div>
                    {d.channel && <div className="text-xs plnr-text-2 shrink-0">{CHANNEL_LABEL[d.channel] || d.channel}</div>}
                  </div>
                  <div className="text-sm plnr-text-2">{fmtDateTime(d.starts_at, lang)}</div>
                  <div className="text-sm plnr-text-2">{d.customer_name || t(lang, 'noName')}{d.customer_phone ? `, ${d.customer_phone}` : ''}</div>
                  {d.notes && <div className="text-sm plnr-text-2">{d.notes}</div>}
                  {d.status === 'error' && d.error_message && (
                    <div className="text-sm text-red-400">{t(lang, 'lastErrorPrefix')} {d.error_message}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={busyId === d.id}
                      onClick={() => decideDraft(d.id, 'approve')}
                      className="text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg px-3 py-1.5"
                    >
                      {t(lang, 'confirm')}
                    </button>
                    <button
                      disabled={busyId === d.id}
                      onClick={() => decideDraft(d.id, 'reject')}
                      className="text-sm plnr-quiet disabled:opacity-50 rounded-lg px-3 py-1.5"
                    >
                      {t(lang, 'reject')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`text-sm rounded-lg px-3 py-1.5 ${activeTab === 'schedule' ? 'bg-blue-600' : 'plnr-quiet'}`}
            >
              {t(lang, 'tabSchedule')}
            </button>
            <button
              type="button"
              onClick={openClientsTab}
              className={`text-sm rounded-lg px-3 py-1.5 ${activeTab === 'clients' ? 'bg-blue-600' : 'plnr-quiet'}`}
            >
              {t(lang, 'tabClients')}
            </button>
          </div>

          {activeTab === 'schedule' ? (
            loading ? (
              <div className="text-sm plnr-text-3">{t(lang, 'loading')}</div>
            ) : (
              // Calendar-driven single-day view, not every booked day stacked
              // at once -- founder's ask: a left-side date picker to browse
              // history as well as upcoming bookings (yellow = past day with
              // bookings, green = today/future with bookings).
              <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">
                <MiniCalendar lang={lang} selectedKey={selectedDateKey} onSelect={setSelectedDateKey} byDay={byDay} todayKey={todayKey} />
                <div className="flex-1 min-w-0 w-full">
                  <div className="text-xs uppercase tracking-wide plnr-text-3 mb-2">
                    {fmtDay(`${selectedDateKey}T00:00:00+05:00`, lang)}
                  </div>
                  {selectedBookings.length === 0 ? (
                    <div className="text-sm plnr-text-3">{t(lang, 'noBookings')}</div>
                  ) : (
                    <DayTable
                      dayBookings={selectedBookings}
                      masters={masters}
                      masterCategories={masterCategories}
                      lang={lang}
                      onOpen={setSelectedBooking}
                    />
                  )}
                </div>
              </div>
            )
          ) : clientsLoading ? (
            <div className="text-sm plnr-text-3">{t(lang, 'loading')}</div>
          ) : (
            <ClientsList clients={clients} lang={lang} onOpen={setSelectedClient} />
          )}
        </section>
      </div>

      {selectedBooking && (
        <BookingActionsModal
          booking={selectedBooking}
          lang={lang}
          onClose={() => setSelectedBooking(null)}
          onMessage={selectedBooking.conversation_id ? () => { setMessageFor(selectedBooking); setSelectedBooking(null) } : null}
          onReschedule={() => { setRescheduleFor(selectedBooking.id); setSelectedBooking(null) }}
          onCancel={() => { setSelectedBooking(null); void cancelBooking(selectedBooking.id) }}
        />
      )}
      {selectedClient && (
        <ClientProfileModal client={selectedClient} lang={lang} onClose={() => setSelectedClient(null)} />
      )}
      {showAddForm && (
        <AddBookingModal lang={lang} onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); void load() }} />
      )}
      {messageFor && (
        <MessageModal booking={messageFor} lang={lang} onClose={() => setMessageFor(null)} onSent={() => setMessageFor(null)} />
      )}
      {rescheduleFor && (
        <RescheduleModal bookingId={rescheduleFor} lang={lang} onClose={() => setRescheduleFor(null)} onSaved={() => { setRescheduleFor(null); void load() }} />
      )}
    </main>
  )
}

function ModalShell({ title, lang, onClose, children }: { title: string; lang: Lang; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="plnr-card rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          {/* 44x44 tap target per DESIGN.md's icon-action-button rule --
              founder reported the visible ✕ (previously just text-sm px-1)
              as not closing the modal; a glyph that small is easy to miss
              entirely, especially on the tablet this page is meant for. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'close')}
            className="plnr-close-btn shrink-0 -mr-2 -mt-2 w-11 h-11 flex items-center justify-center rounded-full text-lg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputClass = 'plnr-input w-full border rounded-lg px-3 py-2 text-sm'

function AddBookingModal({ lang, onClose, onSaved }: { lang: Lang; onClose: () => void; onSaved: () => void }) {
  const [serviceName, setServiceName] = useState('')
  const [masterName, setMasterName] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/planner/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceName, masterName, date, time, clientName, clientPhone }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || t(lang, 'saveFailed')); return }
    onSaved()
  }

  return (
    <ModalShell title={t(lang, 'addBookingTitle')} lang={lang} onClose={onClose}>
      <div className="space-y-2">
        <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder={t(lang, 'serviceLabel')} className={inputClass} />
        <input value={masterName} onChange={e => setMasterName(e.target.value)} placeholder={t(lang, 'masterOptional')} className={inputClass} />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputClass} />
        </div>
        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t(lang, 'clientName')} className={inputClass} />
        <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder={t(lang, 'clientPhone')} className={inputClass} />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          disabled={saving || !serviceName.trim() || !date || !time}
          onClick={save}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {saving ? t(lang, 'saving') : t(lang, 'add')}
        </button>
      </div>
    </ModalShell>
  )
}

// Parameterized with the real booking's own service/time so a tap is
// actually ready to send, not a generic fill-in-the-blanks stub -- founder
// asked for "стандартные скрипты для ответа" while testing this modal.
// A fixed built-in set on purpose (no per-salon custom-template CRUD --
// that's a bigger, separate feature nobody asked for yet). Message BODIES
// are translated too (unlike the rest of this file's ru-only data) since
// the whole point is being ready to send as-is -- kept to simple,
// non-inflected "label, value" phrasing so an arbitrary Cyrillic service
// name typed by the salon owner never has to be grammatically declined
// inside a Kazakh sentence.
function buildQuickReplies(b: Booking, lang: Lang): { label: string; text: string }[] {
  const when = fmtDateTime(b.starts_at, lang)
  const service = b.master_name ? `${b.service_name} (${b.master_name})` : b.service_name
  if (lang === 'kk') {
    return [
      { label: t(lang, 'qrReplyConfirm'), text: `Сәлеметсіз бе! Жазылуыңызды растаймыз: ${service}, ${when}. Сізді күтеміз!` },
      { label: t(lang, 'qrReplyRemind'), text: `Жазылуыңызды еске саламыз: ${service}, ${when}. Жоспарыңыз өзгерсе, бізге хабарласыңыз.` },
      { label: t(lang, 'qrReplyReschedule'), text: `Сәлеметсіз бе! Өкінішке орай, жазылуыңызды ауыстыру керек (${service}, ${when}). Сізге қай уақыт ыңғайлы болады?` },
      { label: t(lang, 'qrReplyLate'), text: `Сәлеметсіз бе! Сізді «${service}» қызметіне ${when} күтеміз — кешігетін болсаңыз, хабарласыңызшы.` },
    ]
  }
  return [
    { label: t(lang, 'qrReplyConfirm'), text: `Здравствуйте! Подтверждаем вашу запись: ${service}, ${when}. Ждём вас!` },
    { label: t(lang, 'qrReplyRemind'), text: `Напоминаем о записи: ${service}, ${when}. Если планы изменились, напишите нам, пожалуйста.` },
    { label: t(lang, 'qrReplyReschedule'), text: `Здравствуйте! К сожалению, нужно перенести вашу запись (${service}, ${when}). Когда вам будет удобно?` },
    { label: t(lang, 'qrReplyLate'), text: `Здравствуйте! Ждём вас на «${service}» ${when} — если задерживаетесь, дайте, пожалуйста, знать.` },
  ]
}

type ConversationMessage = { id: string; direction: string; text: string; isAiGenerated: boolean; createdAt: string }

function MessageModal({ booking, lang, onClose, onSent }: { booking: Booking; lang: Lang; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ConversationMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const threadRef = useRef<HTMLDivElement>(null)

  // Founder's own ask right after this modal shipped: replying blind, with
  // no view of what was already said, isn't enough -- show the real thread
  // first. Best-effort: a failed fetch just leaves the thread empty, it
  // never blocks composing/sending a new message.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/planner/bookings/${booking.id}/message`)
      .then(res => (res.ok ? res.json() : { messages: [] }))
      .then(data => { if (!cancelled) setHistory(data.messages || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [booking.id])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [history])

  async function send() {
    setSending(true)
    setError(null)
    const res = await fetch(`/api/planner/bookings/${booking.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { setError(data.error || t(lang, 'sendFailed')); return }
    onSent()
  }

  return (
    <ModalShell title={t(lang, 'messageClientTitle')} lang={lang} onClose={onClose}>
      <div className="space-y-2">
        <div ref={threadRef} className="max-h-56 overflow-y-auto plnr-card-2 rounded-lg p-2 space-y-1.5">
          {historyLoading ? (
            <div className="text-xs plnr-text-3 p-1">{t(lang, 'loadingThread')}</div>
          ) : history.length === 0 ? (
            <div className="text-xs plnr-text-3 p-1">{t(lang, 'noThread')}</div>
          ) : (
            history.map(m => (
              <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${m.direction === 'outbound' ? 'bg-blue-600 text-white' : 'plnr-quiet'}`}>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{fmtDateTime(m.createdAt, lang)}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {buildQuickReplies(booking, lang).map(r => (
            <button
              key={r.label}
              type="button"
              onClick={() => setText(r.text)}
              className="text-xs plnr-quiet rounded-full px-2.5 py-1.5"
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder={t(lang, 'messageText')} className={inputClass} />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          disabled={sending || !text.trim()}
          onClick={send}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {sending ? t(lang, 'sending') : t(lang, 'send')}
        </button>
      </div>
    </ModalShell>
  )
}

function RescheduleModal({ bookingId, lang, onClose, onSaved }: { bookingId: string; lang: Lang; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/planner/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(data.error || t(lang, 'rescheduleFailed')); return }
    onSaved()
  }

  return (
    <ModalShell title={t(lang, 'rescheduleTitle')} lang={lang} onClose={onClose}>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputClass} />
        </div>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          disabled={saving || !date || !time}
          onClick={save}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {saving ? t(lang, 'saving') : t(lang, 'reschedule')}
        </button>
      </div>
    </ModalShell>
  )
}
