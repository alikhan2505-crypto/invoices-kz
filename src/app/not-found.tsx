'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/components/LanguageProvider'
import { notFoundDict } from '@/lib/i18n/notFound'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import { supabase } from '@/lib/supabase'

export default function NotFound() {
  const { lang } = useLanguage()
  const t = notFoundDict[lang]
  usePageDocumentTitle(t.notFoundTitle)

  // A guest has no cabinet to go back to: /dashboard would only bounce them to the login.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(!!data.session) }).catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--nav-bg)' }}>
      <div className="text-center max-w-sm">
        <div className="text-8xl font-bold mb-4" style={{ color: 'var(--nav-text-primary)' }}>404</div>
        <div className="text-xl font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.notFoundTitle}</div>
        <p className="text-sm mb-8" style={{ color: 'var(--nav-text-secondary)' }}>
          {t.notFoundBody}
        </p>
        <Link
          href={signedIn ? '/dashboard' : '/'}
          className="inline-block px-8 py-3 rounded-xl text-sm font-medium"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {t.goHomeButton}
        </Link>
      </div>
    </main>
  )
}
