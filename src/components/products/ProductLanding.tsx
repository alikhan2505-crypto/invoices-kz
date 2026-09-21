'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { PRODUCTS } from '@/lib/products'
import { LANDINGS, LANDING_UI, OTHER_PRODUCT_LINKS, type LandingKey } from '@/lib/landings'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import ProductArt from '@/components/products/ProductArt'

export default function ProductLanding({ landing, fontClass }: { landing: LandingKey; fontClass: string }) {
  const { lang } = useLanguage()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const l = LANDINGS[landing]
  const p = PRODUCTS.find((x) => x.key === l.product)!
  const ui = LANDING_UI[lang]

  useEffect(() => {
    let alive = true
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!alive) return
      setSignedIn(!!user)
      // Someone already signed in came for their dashboard, not the pitch.
      if (user && new URLSearchParams(window.location.search).get('view') !== 'landing') {
        window.location.replace(l.cabinet)
      }
    })
    return () => { alive = false }
  }, [l.cabinet])

  const vars = { '--bg-t': p.bg, '--ink-t': p.ink, '--soft-t': l.soft } as React.CSSProperties

  function startLogin() {
    setPostLoginRedirect(l.cabinet)
  }

  return (
    <main className={`lp-root ${fontClass}`} style={vars}>
      <div className="lp-top">
        <a className="lp-back" href="https://invoices.kz/products"><span>← {ui.allProducts}</span></a>
        <span style={{ flex: 1 }} />
        {signedIn ? (
          <a className="lp-back" href={l.cabinet}><span>{ui.open}</span></a>
        ) : (
          <Link className="lp-back" href="/login" onClick={startLogin}><span>{ui.login}</span></Link>
        )}
      </div>

      <div className="lp-hero">
        <p className="lp-eyebrow">{l.audience[lang]}</p>
        <h1 className="lp-h1">{l.tagline[lang]}</h1>
        <p className="lp-lead">{l.lead[lang]}</p>
        {signedIn ? (
          <a className="lp-cta" href={l.cabinet}><span>{ui.open}</span></a>
        ) : (
          <Link className="lp-cta" href="/login" onClick={startLogin}><span>{ui.enter}</span></Link>
        )}
      </div>

      <span className="lp-art" aria-hidden="true"><ProductArt product={l.product} /></span>

      <div className="lp-stickers">
        {l.points[lang].map((t) => <span key={t} className="lp-stk">{t}</span>)}
      </div>

      <div className="lp-bar">
        <span className="lp-lab">{ui.others}</span>
        {OTHER_PRODUCT_LINKS.filter((o) => o.product !== l.product).map((o) => {
          const def = PRODUCTS.find((x) => x.key === o.product)!
          const dot = { '--dot': def.bg } as React.CSSProperties
          return o.url ? (
            <a key={o.product} className="lp-mini" style={dot} href={o.url}><i /><span>{o.label}</span></a>
          ) : (
            <span key={o.product} className="lp-mini" style={dot} title={ui.lockedHint} data-locked="true"><i /><span>{o.label} · {ui.soon}</span></span>
          )
        })}
      </div>
    </main>
  )
}
