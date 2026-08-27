'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { daysUntil } from '@/lib/wildberries/token'

const EASE = [0.16, 1, 0.3, 1] as const

type Status = { connected: boolean; tokenExpiresAt?: string; status?: string }

export default function WildberriesPage() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [statusData, setStatusData] = useState<Status | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const headers = await authHeader()
    const res = await fetch('/api/wildberries/connect', { headers })
    if (res.status === 403) { setForbidden(true); setLoading(false); return }
    if (res.ok) setStatusData(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await load()
    }
    init()
  }, [router])

  async function connect() {
    if (!tokenInput.trim()) return
    setBusy(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/connect', {
        method: 'POST', headers, body: JSON.stringify({ token: tokenInput.trim() }),
      })
      if (res.ok) {
        setTokenInput('')
        await load()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(
          data.error === 'invalid_token_format' ? 'Не удалось распознать токен — проверьте, что скопировали его полностью.'
          : data.error === 'token_rejected' ? 'Wildberries не принял этот токен — проверьте, что он не истёк и скопирован верно.'
          : 'Не удалось подключить. Попробуйте ещё раз.'
        )
      }
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setBusy(false)
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/wildberries/connect', { method: 'DELETE', headers })
      if (res.ok) await load()
      else setError('Не удалось отключить. Попробуйте ещё раз.')
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    }
    setBusy(false)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (forbidden) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Эта функция пока доступна только администраторам.</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-2xl mx-auto p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div
          className="mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Wildberries</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Подключите токен продавца, чтобы видеть свои товары, цены и заказы</p>
        </motion.div>

        <div className="nav-glass rounded-2xl p-5">
          {statusData?.connected ? (
            <div className="space-y-3">
              <div className="text-sm font-semibold" style={{ color: 'var(--nav-success)' }}>Подключено</div>
              {statusData.tokenExpiresAt && (
                <div className="text-xs" style={{ color: daysUntil(statusData.tokenExpiresAt) <= 14 ? 'var(--nav-critical)' : 'var(--nav-text-muted)' }}>
                  {daysUntil(statusData.tokenExpiresAt) <= 14
                    ? `Токен истекает через ${daysUntil(statusData.tokenExpiresAt)} дн. — подключите новый заранее`
                    : `Токен действителен до ${new Date(statusData.tokenExpiresAt).toLocaleDateString('ru-KZ')}`}
                </div>
              )}
              <button onClick={disconnect} disabled={busy}
                className="nav-glass rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                {busy ? 'Отключаем…' : 'Отключить'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                Кабинет Wildberries → Настройки → «Доступ к API» → создайте токен и вставьте его сюда.
              </p>
              <textarea
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="eyJhbGciOi..."
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-xs outline-none border border-[color:var(--nav-border)] font-mono"
                style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
              />
              {error && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
              <button onClick={connect} disabled={busy || !tokenInput.trim()}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {busy ? 'Подключаем…' : 'Подключить'}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
