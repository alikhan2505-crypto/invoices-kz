'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

type Settings = { connectionId: string; companyName: string; slug: string | null; published: boolean; cashierConnected: boolean }

export default function KaspiShopStorefrontSettings() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [noConnection, setNoConnection] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [slugInput, setSlugInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const load = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/storefront', { headers })
    if (res.status === 404) { setNoConnection(true); setLoading(false); return }
    if (res.ok) {
      const data = await res.json()
      setSettings(data)
      setSlugInput(data.slug || '')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only gate as every other kaspi-shop/* page (audit finding,
      // 2026-09-02) -- this page and storefront-orders were the only two
      // missing it, so any authenticated invoices.kz user could reach a
      // founder-only-until-reviewed feature by typing the URL directly.
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }
      // Демпинг is the only page with the actual connect terminal (phone/OTP)
      // -- every other page redirects there instead of rendering its own broken
      // state when there's no active connection (2026-09-03 founder: check for a
      // connected store before opening any page or sub-page).
      const { data: { session } } = await supabase.auth.getSession()
      const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const connData = await connRes.json().catch(() => null)
      if (!connData?.connected) { router.push('/kaspi-shop'); return }
      await load()
    }
    init()
  }, [router, load])

  async function save(published: boolean) {
    setError(null)
    setSaving(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront', {
        method: 'POST', headers, body: JSON.stringify({ slug: slugInput, published }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.error === 'slug_taken' ? 'Такая ссылка уже занята, выберите другую'
          : data.error === 'invalid_slug' ? 'Ссылка может содержать только латинские буквы, цифры и дефис'
          : data.error === 'cashier_not_connected' ? 'Сначала подключите Kaspi Pay Кассир'
          : 'Не удалось сохранить'
        )
        return
      }
      await load()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    if (!settings?.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/shop/${settings.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (noConnection) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Сначала подключите магазин Kaspi Shop</div>
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
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Витрина</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Публичная страница с вашими товарами — делитесь ссылкой в Instagram/WhatsApp</p>
        </motion.div>

        {!settings?.cashierConnected ? (
          <div className="nav-glass rounded-2xl p-5 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            Для приёма оплаты на витрине нужен подключённый Kaspi Pay Кассир.{' '}
            <a href="/kaspi-api" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Подключить →</a>
          </div>
        ) : (
          <div className="nav-glass rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Ссылка витрины</label>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>invoices.kz/shop/</span>
                <input value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase())}
                  placeholder="my-store"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </div>
            </div>

            {error && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

            <div className="flex items-center gap-3">
              <button onClick={() => save(!settings.published)} disabled={saving || !slugInput.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: settings.published ? 'var(--nav-critical)' : 'var(--nav-accent)', color: '#fff' }}>
                {settings.published ? 'Снять с публикации' : 'Опубликовать'}
              </button>
              {settings.published && settings.slug && (
                <button onClick={copyLink} className="text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
                  {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
