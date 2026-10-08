'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { setTelegramDigest } from '@/lib/cfo/data'
import { useCfo } from './CfoWorkspace'
import { Card, ErrorText, GhostButton, SectionTitle } from './ui'

// Утренняя сводка в Telegram: включается здесь, доставляется ботом уведомлений,
// который человек подключает в Профиль → Уведомления.
export default function DigestSettings() {
  const { ws, reload } = useCfo()
  const [telegram, setTelegram] = useState<'loading' | 'connected' | 'missing'>('loading')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const { data } = await supabase.from('profiles').select('telegram_chat_id').eq('id', ws.userId).single()
      if (alive) setTelegram(data?.telegram_chat_id ? 'connected' : 'missing')
    })()
    return () => { alive = false }
  }, [ws.userId])

  async function toggle(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setTelegramDigest(ws, on)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function sendNow() {
    setSending(true)
    setError(null)
    setMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/cfo/digest', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Не удалось отправить')
      setMessage('Отправили — проверьте Telegram')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <SectionTitle>Утренняя сводка в Telegram</SectionTitle>
      <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
        Каждый день в 8:00 — сколько денег на счетах, что сегодня к оплате и к поступлению, просрочка и ближайший кассовый разрыв. 1-го числа — ещё и итоги прошлого месяца.
        А ещё боту можно писать операции: «аренда 300 000», «пришло 450к от ТОО Ромашка», «такси 3500 вчера» — они сразу попадут в журнал. Ошиблись — напишите «отмена».
      </p>
      {telegram === 'missing' ? (
        <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
          Сначала подключите Telegram:{' '}
          <a href="/profile/notifications" className="inline-flex items-center min-h-[44px] font-semibold underline" style={{ color: 'var(--nav-accent)' }}>Профиль → Уведомления</a>
          {' '}— включите «Telegram» и нажмите «Подключить».
        </p>
      ) : (
        <div className="flex gap-2 flex-wrap items-center">
          <label className="flex items-center gap-2 text-sm min-h-[44px] pr-2" style={{ color: 'var(--nav-text-primary)' }}>
            <input type="checkbox" className="w-5 h-5" checked={ws.telegramDigest} disabled={busy || telegram === 'loading'} onChange={(e) => void toggle(e.target.checked)} />
            Присылать сводку каждое утро
          </label>
          <GhostButton type="button" disabled={sending || telegram === 'loading'} onClick={() => void sendNow()}>
            {sending ? 'Отправляю…' : 'Прислать сейчас'}
          </GhostButton>
          {message && <span role="status" className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{message}</span>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
