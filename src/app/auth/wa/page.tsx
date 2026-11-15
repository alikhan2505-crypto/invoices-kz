'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { authDict } from '@/lib/i18n/auth'

// Ссылка из ответа в WhatsApp: /auth/wa?t=<одноразовый токен>. Токен меняется на обычную вход-ссылку Supabase
// скриптом, а не при загрузке страницы: предпросмотры ссылок и сканеры не выполняют скрипты и токен не сожгут.
// Дальше всё как после письма: /auth/callback заводит пробный период, тур и маршрут после входа.

export default function WhatsAppLinkPage() {
  const { lang } = useLanguage()
  const t = authDict[lang]
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t') || ''
    // Токен не должен остаться в истории и уйти в Referer при переходе на домен Supabase.
    try { window.history.replaceState(null, '', window.location.pathname) } catch {}
    if (!token) { setFailed(true); return }
    let cancelled = false
    fetch('/api/auth/whatsapp/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token }),
    })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (cancelled) return
        if (r.ok && typeof body.url === 'string') window.location.replace(body.url)
        else setFailed(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--nav-bg)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)' }}>
        {failed ? (
          <>
            <p role="alert" className="text-sm mb-4" style={{ color: 'var(--nav-text-primary)' }}>{t.whatsappLinkInvalid}</p>
            <Link href="/login" className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold min-h-12" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {t.whatsappBackToLogin}
            </Link>
          </>
        ) : (
          <p role="status" className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>{t.whatsappLinkLoading}</p>
        )}
      </div>
    </main>
  )
}
