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
    noBookings: 'Пока нет записей на ближайшие две недели.',
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
    noBookings: 'Алдағы екі аптаға жазылу жоқ.',
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

// Continuous timeline, not a sparse grid -- founder shared a real
// scheduling product (YCLIENTS-style) as the reference: hour axis down
// the side, appointment blocks absolutely positioned by actual start time
// and sized by duration, master columns grouped under category headers.
const PX_PER_MIN = 1.2
const DEFAULT_DURATION_MIN = 60
const DAY_MIN_START = 7 * 60
const DAY_MAX_END = 22 * 60
const MIN_CARD_PX = 34
const COLUMN_PX = 160
const HOUR_GUTTER_PX = 52

function minutesSinceMidnight(iso: string): number {
  // Same fixed +05:00 shift-then-read-UTC-getters trick as the rest of
  // this feature -- Kazakhstan is one fixed offset, no tz library needed.
  const d = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

// The visible hour range for one day's timeline: always at least
// DAY_MIN_START..DAY_MAX_END (07:00-22:00, a sane default with no
// structured "working hours" to read -- salon.workingHours is free text),
// expanded automatically if a real booking falls outside it, with an
// hour of padding on whichever end actually has bookings near it.
function computeDayRange(dayBookings: Booking[]): { start: number; end: number } {
  let minStart = Infinity
  let maxEnd = -Infinity
  for (const b of dayBookings) {
    const s = minutesSinceMidnight(b.starts_at)
    const e = s + (b.duration_minutes || DEFAULT_DURATION_MIN)
    minStart = Math.min(minStart, s)
    maxEnd = Math.max(maxEnd, e)
  }
  const start = Math.max(0, Math.min(DAY_MIN_START, Math.floor(minStart / 60) * 60 - 60))
  const end = Math.min(24 * 60, Math.max(DAY_MAX_END, Math.ceil(maxEnd / 60) * 60 + 60))
  return { start, end }
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

// One absolutely-positioned block on the timeline -- compact on purpose
// (columns run 160px, a short appointment only tens of px tall): time +
// service on one line, client name on the next. The whole block is the
// tap target (opens BookingActionsModal below), not stacked inline
// buttons -- a 15-30 minute slot has no room for three action rows.
function TimelineBookingCard({ booking: b, lang, top, height, onOpen }: {
  booking: Booking
  lang: Lang
  top: number
  height: number
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${b.service_name} — ${b.client_name || t(lang, 'noName')}`}
      className={`absolute left-0.5 right-0.5 text-left plnr-card rounded-md px-1.5 py-1 text-[11px] leading-tight overflow-hidden border-l-[3px] ${b.status === 'cancelled' ? 'opacity-50 line-through' : ''}`}
      style={{
        top,
        height,
        borderLeftColor: b.status === 'cancelled' ? '#ef4444' : '#3b82f6',
      }}
    >
      <div className="font-medium truncate">{fmtTime(b.starts_at, lang)} {b.service_name}</div>
      <div className="plnr-text-2 truncate">{b.client_name || t(lang, 'noName')}</div>
    </button>
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
  const days = Array.from(byDay.keys()).sort()

  return (
    <main className="planner-shell plnr-page min-h-screen" data-planner-theme={theme}>
      {/* Founder's own ask: these switches belong in the page's actual
          top-right corner, on their own, not squeezed inline next to a
          growing title. Icon buttons sized ~36px, under DESIGN.md's usual
          44px rule but within its own documented exception for a tight
          multi-button segmented control where blowing each one up would
          make the whole cluster disproportionate. */}
      <div className="flex justify-end items-center gap-2 px-4 sm:px-6 py-3">
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
      </div>

      {/* Founder: "растягиваешь планировщик на всю станицу... все сжатым
          смотрится" -- widened from the original max-w-3xl (768px). Not
          uncapped: on an ultrawide monitor a bare w-full would stretch
          the draft cards/title into unreadably long lines, so a generous
          cap instead -- the calendar below scrolls its own overflow-x
          regardless of this wrapper's width. */}
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pb-10 space-y-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-lg font-semibold">{t(lang, 'plannerTitle')} — {salonName}</h1>
          <button
            onClick={() => setShowAddForm(true)}
            className="shrink-0 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-2"
          >
            + {t(lang, 'addBooking')}
          </button>
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
          <h2 className="text-sm font-medium plnr-text-2 mb-2">{t(lang, 'scheduleHeading')}</h2>
          {loading ? (
            <div className="text-sm plnr-text-3">{t(lang, 'loading')}</div>
          ) : days.length === 0 ? (
            <div className="text-sm plnr-text-3">{t(lang, 'noBookings')}</div>
          ) : (
            <div className="space-y-8">
              {days.map(day => {
                const dayBookings = byDay.get(day)!
                const columns = buildTimelineColumns(masterCategories, masters, dayBookings, lang)
                const runs = categoryRuns(columns)
                const { start, end } = computeDayRange(dayBookings)
                const bodyHeight = (end - start) * PX_PER_MIN
                const hourMarks: number[] = []
                for (let h = Math.ceil(start / 60); h * 60 <= end; h++) hourMarks.push(h)

                return (
                  <div key={day}>
                    <div className="text-xs uppercase tracking-wide plnr-text-3 mb-2">{fmtDay(dayBookings[0].starts_at, lang)}</div>
                    {/* Continuous timeline, not a sparse grid -- founder's
                        own reference screenshot (a real scheduling
                        product): hour axis on the left, blocks positioned
                        by actual start time and sized by duration,
                        master columns grouped under category headers so
                        two different masters at the same 15:00 don't
                        collide the way a flat list did. */}
                    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                      <div style={{ width: HOUR_GUTTER_PX + columns.length * COLUMN_PX }}>
                        <div className="flex" style={{ paddingLeft: HOUR_GUTTER_PX }}>
                          {runs.map((run, i) => (
                            <div
                              key={i}
                              className="text-xs font-semibold plnr-text-2 px-2 py-1 border-b plnr-border truncate"
                              style={{ width: run.span * COLUMN_PX }}
                            >
                              {run.category || ' '}
                            </div>
                          ))}
                        </div>
                        <div className="flex" style={{ paddingLeft: HOUR_GUTTER_PX }}>
                          {columns.map(col => (
                            <div
                              key={col.key}
                              className="text-xs font-medium plnr-text px-2 py-1.5 border-b plnr-border truncate"
                              style={{ width: COLUMN_PX }}
                            >
                              {col.label}
                            </div>
                          ))}
                        </div>
                        <div className="flex" style={{ height: bodyHeight }}>
                          <div className="relative shrink-0" style={{ width: HOUR_GUTTER_PX }}>
                            {hourMarks.map(h => (
                              <div
                                key={h}
                                className="absolute right-2 text-xs plnr-text-3 -translate-y-1/2"
                                style={{ top: (h * 60 - start) * PX_PER_MIN }}
                              >
                                {String(h).padStart(2, '0')}:00
                              </div>
                            ))}
                          </div>
                          {columns.map(col => (
                            <div
                              key={col.key}
                              className="relative plnr-border"
                              style={{
                                width: COLUMN_PX,
                                borderLeftWidth: 1,
                                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${60 * PX_PER_MIN - 1}px, var(--p-border) ${60 * PX_PER_MIN - 1}px, var(--p-border) ${60 * PX_PER_MIN}px)`,
                              }}
                            >
                              {dayBookings
                                .filter(b => (b.master_name || t(lang, 'unassigned')) === col.key)
                                .map(b => {
                                  const s = minutesSinceMidnight(b.starts_at)
                                  const dur = b.duration_minutes || DEFAULT_DURATION_MIN
                                  return (
                                    <TimelineBookingCard
                                      key={b.id}
                                      booking={b}
                                      lang={lang}
                                      top={(s - start) * PX_PER_MIN}
                                      height={Math.max(MIN_CARD_PX, dur * PX_PER_MIN)}
                                      onOpen={() => setSelectedBooking(b)}
                                    />
                                  )
                                })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
