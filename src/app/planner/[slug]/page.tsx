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

// Stage 2 built only the QR login below; Stage 4 (this file) adds the
// authorized view on top of the same page -- see
// C:\Users\Abilbayev.Alikhan\.claude\plans\smooth-wishing-pumpkin.md.
export default function PlannerPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug

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
      setError(data.error === 'not_found' ? 'Салон не найден' : 'Не удалось начать вход')
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
      <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center text-sm text-gray-400">
        Загрузка…
      </main>
    )
  }

  if (authed) {
    return <PlannerDashboard salonName={authed.salonName} />
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-lg font-semibold">Вход в планировщик</h1>
        <p className="text-sm text-gray-400">Откройте Telegram на телефоне и отсканируйте QR-код — это подтвердит, что вы владелец салона.</p>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {login?.qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, next/image тут не помогает
          <img src={login.qrDataUrl} alt="QR для входа в планировщик" className="mx-auto rounded-xl bg-white p-3" />
        ) : (
          <div className="text-sm text-gray-500">Готовлю QR…</div>
        )}
      </div>
    </main>
  )
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp', instagram: 'Instagram', telegram: 'Telegram', website: 'сайт', api: 'API',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ru-KZ', { timeZone: 'Asia/Almaty', dateStyle: 'medium', timeStyle: 'short' })
}
function fmtDay(iso: string) {
  const s = new Date(iso).toLocaleDateString('ru-KZ', { timeZone: 'Asia/Almaty', weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-KZ', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' })
}
// Group key in Almaty local time (fixed +05:00, same convention as the
// rest of this feature) -- a plain shift-then-slice, not a tz library.
function dayKey(iso: string) {
  return new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const UNASSIGNED_COLUMN = 'Без мастера'

// Time x master grid for one day -- founder's own request after seeing the
// flat chronological list: two different masters can both have a 15:00
// booking, and a plain list doesn't show that at a glance the way a real
// resource calendar does. Columns start from the salon's configured
// master roster (masters param, from GET /api/planner/bookings -- so an
// empty column still reads as "this master is free", not just "nobody
// booked yet"), extended with any master_name a booking carries that
// isn't in that roster (legacy/ad-hoc data), and a trailing "Без мастера"
// column only when at least one booking that day actually has none.
function buildDayGrid(dayBookings: Booking[], masters: string[]) {
  const extra = Array.from(new Set(
    dayBookings.map(b => b.master_name).filter((m): m is string => !!m && !masters.includes(m))
  ))
  const hasUnassigned = dayBookings.some(b => !b.master_name)
  const columns = [...masters, ...extra, ...(hasUnassigned ? [UNASSIGNED_COLUMN] : [])]
  const times = Array.from(new Set(dayBookings.map(b => fmtTime(b.starts_at)))).sort()

  const cellMap = new Map<string, Booking[]>()
  for (const b of dayBookings) {
    const key = `${fmtTime(b.starts_at)}|${b.master_name || UNASSIGNED_COLUMN}`
    if (!cellMap.has(key)) cellMap.set(key, [])
    cellMap.get(key)!.push(b)
  }
  return { columns, times, cellMap }
}

// One grid cell's card -- compact on purpose (columns run ~150px): service
// + client name only, actions stacked as full-width rows rather than
// side-by-side so they stay tappable in a narrow column. onMessage is
// null for a manual booking with no conversation_id behind it.
function BookingCard({ booking: b, busy, onMessage, onReschedule, onCancel }: {
  booking: Booking
  busy: boolean
  onMessage: (() => void) | null
  onReschedule: () => void
  onCancel: () => void
}) {
  return (
    <div
      className={`bg-gray-800 rounded-lg p-2 mb-1.5 text-xs ${b.status === 'cancelled' ? 'opacity-50' : ''}`}
      title={`${b.client_name || 'Без имени'}${b.client_phone ? `, ${b.client_phone}` : ''}`}
    >
      <div className="font-medium truncate">{b.service_name}</div>
      <div className="text-gray-400 truncate">{b.client_name || 'Без имени'}</div>
      {b.status === 'cancelled' ? (
        <div className="text-red-400 mt-1">отменена</div>
      ) : (
        <div className="flex flex-col gap-1 mt-1.5">
          {onMessage && (
            <button onClick={onMessage} className="text-left bg-gray-700 hover:bg-gray-600 rounded px-1.5 py-1">
              Написать
            </button>
          )}
          <button onClick={onReschedule} className="text-left bg-gray-700 hover:bg-gray-600 rounded px-1.5 py-1">
            Перенести
          </button>
          <button
            disabled={busy}
            onClick={onCancel}
            className="text-left bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded px-1.5 py-1"
          >
            Отменить
          </button>
        </div>
      )}
    </div>
  )
}

function PlannerDashboard({ salonName }: { salonName: string }) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [masters, setMasters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [messageFor, setMessageFor] = useState<Booking | null>(null)
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null)

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
      setError(data.error || 'Не удалось выполнить действие')
    }
    await load()
    setBusyId(null)
  }

  async function cancelBooking(id: string) {
    if (!confirm('Отменить эту запись?')) return
    setBusyId(id)
    setError(null)
    const res = await fetch(`/api/planner/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Не удалось отменить')
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
    <main className="planner-dark-form min-h-screen bg-gray-900 text-white p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-8 pb-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Планировщик — {salonName}</h1>
          <button
            onClick={() => setShowAddForm(true)}
            className="shrink-0 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-3 py-2"
          >
            + Добавить бронь
          </button>
        </div>

        {error && <div className="text-sm text-red-400 bg-red-950/40 rounded-lg p-3">{error}</div>}

        {drafts.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-2">Черновики записей ({drafts.length})</h2>
            <div className="space-y-3">
              {drafts.map(d => (
                <div key={d.id} className="bg-gray-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{d.service_name}{d.master_name ? ` — ${d.master_name}` : ''}</div>
                    {d.channel && <div className="text-xs text-gray-400 shrink-0">{CHANNEL_LABEL[d.channel] || d.channel}</div>}
                  </div>
                  <div className="text-sm text-gray-300">{fmtDateTime(d.starts_at)}</div>
                  <div className="text-sm text-gray-300">{d.customer_name || 'Без имени'}{d.customer_phone ? `, ${d.customer_phone}` : ''}</div>
                  {d.notes && <div className="text-sm text-gray-400">{d.notes}</div>}
                  {d.status === 'error' && d.error_message && (
                    <div className="text-sm text-red-400">Ошибка при прошлой попытке: {d.error_message}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={busyId === d.id}
                      onClick={() => decideDraft(d.id, 'approve')}
                      className="text-sm bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg px-3 py-1.5"
                    >
                      Подтвердить
                    </button>
                    <button
                      disabled={busyId === d.id}
                      onClick={() => decideDraft(d.id, 'reject')}
                      className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg px-3 py-1.5"
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-2">Расписание</h2>
          {loading ? (
            <div className="text-sm text-gray-500">Загрузка…</div>
          ) : days.length === 0 ? (
            <div className="text-sm text-gray-500">Пока нет записей на ближайшие две недели.</div>
          ) : (
            <div className="space-y-6">
              {days.map(day => {
                const dayBookings = byDay.get(day)!
                const grid = buildDayGrid(dayBookings, masters)
                return (
                  <div key={day}>
                    <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">{fmtDay(dayBookings[0].starts_at)}</div>
                    {/* Grid, not a flat list -- founder's own point: two
                        different masters can both have a 15:00 slot, and a
                        chronological list conflates them. Columns = the
                        salon's real staff (masters, from GET's own
                        response) so an empty column still reads as "free",
                        the way a real resource-calendar view should. */}
                    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                      <table className="border-separate border-spacing-1.5">
                        <thead>
                          <tr>
                            <th className="w-14" />
                            {grid.columns.map(col => (
                              <th key={col} className="min-w-[150px] text-left text-xs font-medium text-gray-300 px-1 pb-1 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {grid.times.map(time => (
                            <tr key={time}>
                              <td className="align-top pt-2 text-xs text-gray-400 whitespace-nowrap">{time}</td>
                              {grid.columns.map(col => {
                                const cellBookings = grid.cellMap.get(`${time}|${col}`) || []
                                return (
                                  <td key={col} className="align-top">
                                    {cellBookings.map(b => (
                                      <BookingCard
                                        key={b.id}
                                        booking={b}
                                        busy={busyId === b.id}
                                        onMessage={b.conversation_id ? () => setMessageFor(b) : null}
                                        onReschedule={() => setRescheduleFor(b.id)}
                                        onCancel={() => cancelBooking(b.id)}
                                      />
                                    ))}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {showAddForm && (
        <AddBookingModal onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); void load() }} />
      )}
      {messageFor && (
        <MessageModal booking={messageFor} onClose={() => setMessageFor(null)} onSent={() => setMessageFor(null)} />
      )}
      {rescheduleFor && (
        <RescheduleModal bookingId={rescheduleFor} onClose={() => setRescheduleFor(null)} onSaved={() => { setRescheduleFor(null); void load() }} />
      )}
    </main>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-5 w-full max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          {/* 44x44 tap target per DESIGN.md's icon-action-button rule --
              founder reported the visible ✕ (previously just text-sm px-1)
              as not closing the modal; a glyph that small is easy to miss
              entirely, especially on the tablet this page is meant for. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="shrink-0 -mr-2 -mt-2 w-11 h-11 flex items-center justify-center rounded-full text-gray-400 hover:text-white text-lg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputClass = 'w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm placeholder:text-gray-500'

function AddBookingModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
    if (!res.ok) { setError(data.error || 'Не удалось сохранить'); return }
    onSaved()
  }

  return (
    <ModalShell title="Добавить бронь" onClose={onClose}>
      <div className="space-y-2">
        <input value={serviceName} onChange={e => setServiceName(e.target.value)} placeholder="Услуга" className={inputClass} />
        <input value={masterName} onChange={e => setMasterName(e.target.value)} placeholder="Мастер (необязательно)" className={inputClass} />
        <div className="flex gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputClass} />
        </div>
        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Имя клиента" className={inputClass} />
        <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Телефон клиента" className={inputClass} />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          disabled={saving || !serviceName.trim() || !date || !time}
          onClick={save}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {saving ? 'Сохраняю…' : 'Добавить'}
        </button>
      </div>
    </ModalShell>
  )
}

// Parameterized with the real booking's own service/time so a tap is
// actually ready to send, not a generic fill-in-the-blanks stub -- founder
// asked for "стандартные скрипты для ответа" while testing this modal.
// A fixed built-in set on purpose (no per-salon custom-template CRUD --
// that's a bigger, separate feature nobody asked for yet).
function buildQuickReplies(b: Booking): { label: string; text: string }[] {
  const when = fmtDateTime(b.starts_at)
  const service = b.master_name ? `${b.service_name} (${b.master_name})` : b.service_name
  return [
    { label: 'Подтвердить', text: `Здравствуйте! Подтверждаем вашу запись: ${service}, ${when}. Ждём вас!` },
    { label: 'Напомнить', text: `Напоминаем о записи: ${service}, ${when}. Если планы изменились, напишите нам, пожалуйста.` },
    { label: 'Предложить перенос', text: `Здравствуйте! К сожалению, нужно перенести вашу запись (${service}, ${when}). Когда вам будет удобно?` },
    { label: 'Клиент опаздывает', text: `Здравствуйте! Ждём вас на «${service}» ${when} — если задерживаетесь, дайте, пожалуйста, знать.` },
  ]
}

type ConversationMessage = { id: string; direction: string; text: string; isAiGenerated: boolean; createdAt: string }

function MessageModal({ booking, onClose, onSent }: { booking: Booking; onClose: () => void; onSent: () => void }) {
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
    if (!res.ok) { setError(data.error || 'Не удалось отправить'); return }
    onSent()
  }

  return (
    <ModalShell title="Написать клиенту" onClose={onClose}>
      <div className="space-y-2">
        <div ref={threadRef} className="max-h-56 overflow-y-auto bg-gray-900 rounded-lg p-2 space-y-1.5">
          {historyLoading ? (
            <div className="text-xs text-gray-500 p-1">Загружаю переписку…</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-gray-500 p-1">Переписки пока нет.</div>
          ) : (
            history.map(m => (
              <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs ${m.direction === 'outbound' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{fmtDateTime(m.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {buildQuickReplies(booking).map(r => (
            <button
              key={r.label}
              type="button"
              onClick={() => setText(r.text)}
              className="text-xs bg-gray-700 hover:bg-gray-600 rounded-full px-2.5 py-1.5"
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} placeholder="Текст сообщения" className={inputClass} />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button
          disabled={sending || !text.trim()}
          onClick={send}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-3 py-2 text-sm font-medium"
        >
          {sending ? 'Отправляю…' : 'Отправить'}
        </button>
      </div>
    </ModalShell>
  )
}

function RescheduleModal({ bookingId, onClose, onSaved }: { bookingId: string; onClose: () => void; onSaved: () => void }) {
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
    if (!res.ok) { setError(data.error || 'Не удалось перенести'); return }
    onSaved()
  }

  return (
    <ModalShell title="Перенести запись" onClose={onClose}>
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
          {saving ? 'Сохраняю…' : 'Перенести'}
        </button>
      </div>
    </ModalShell>
  )
}
