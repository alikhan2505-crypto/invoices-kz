'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { PRODUCTS } from '@/lib/products'
import { LANDINGS, LANDING_UI, OTHER_PRODUCT_LINKS, type LandingKey } from '@/lib/landings'
import ProductArt from '@/components/products/ProductArt'
import { PRODUCT_I18N } from '@/lib/i18n/productsHub'
import KaspiLiveScene from '@/components/products/KaspiLiveScene'
import AgentLiveScene from '@/components/products/AgentLiveScene'
import SalonLiveScene from '@/components/products/SalonLiveScene'
import './landing-extras.css'
import { useDropStaleFocus } from '@/lib/useDropStaleFocus'

export default function ProductLanding({ landing, fontClass }: { landing: LandingKey; fontClass: string }) {
  const { lang } = useLanguage()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const l = LANDINGS[landing]
  const p = PRODUCTS.find((x) => x.key === l.product)!
  const ui = LANDING_UI[lang]

  useDropStaleFocus()
  useEffect(() => {
    let alive = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      setSignedIn(!!user)
      if (!user) return
      // A product still open by application only has no dashboard for ordinary
      // accounts: only admins are sent in, everyone else keeps the pitch.
      // is_admin also unlocks admin-only products in the "other products" bar.
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      const admin = !!data?.is_admin
      if (alive) setIsAdmin(admin)
      const allowed = l.access === 'open' || admin
      // Someone who can open the dashboard came for it, not the pitch.
      if (allowed && new URLSearchParams(window.location.search).get('view') !== 'landing') {
        window.location.replace(l.cabinet)
      }
    }
    void load()
    return () => { alive = false }
  }, [l.cabinet, l.access])

  const vars = { '--bg-t': p.bg, '--ink-t': p.ink, '--soft-t': l.soft } as React.CSSProperties

  // Always the apex login: OAuth and e-mail links return there, and it hands the
  // destination over via ?next= (localStorage is per host, so it can't travel).
  const loginHref = `https://invoices.kz/login?next=${l.cabinet}`
  const applyHref = `mailto:mail@invoices.kz?subject=${encodeURIComponent(`${p.name}: заявка`)}`
  const canOpen = l.access === 'open' ? !!signedIn : isAdmin

  const scene = landing === 'kaspi' ? <KaspiLiveScene lang={lang} /> : landing === 'agent' ? <AgentLiveScene lang={lang} />
    : landing === 'salon' ? <SalonLiveScene lang={lang} /> : null

  const hero = (
    <div className="lp-hero">
      <p className="lp-eyebrow">{l.audience[lang]}</p>
      <h1 className="lp-h1">{l.tagline[lang]}</h1>
      <p className="lp-lead">{l.lead[lang]}</p>
      {l.access === 'invite' && <p className="lp-note"><span>{l.inviteNote?.[lang] ?? ui.inviteNote}</span></p>}
      {canOpen ? (
        <a className="lp-cta" href={l.cabinet}><span>{ui.open}</span></a>
      ) : l.access === 'invite' ? (
        <a className="lp-cta" href={applyHref}><span>{ui.apply}</span></a>
      ) : (
        <a className="lp-cta" href={loginHref}><span>{ui.enter}</span></a>
      )}
    </div>
  )

  return (
    <main className={`lp-root ${fontClass}`} style={vars}>
      <div className="lp-top">
        <a className="lp-back" href="https://invoices.kz/products"><span>← {ui.allProducts}</span></a>
        <span style={{ flex: 1 }} />
        {canOpen ? (
          <a className="lp-back" href={l.cabinet}><span>{ui.open}</span></a>
        ) : (
          <a className="lp-back" href={loginHref}><span>{ui.login}</span></a>
        )}
      </div>

      {/* Живая сцена продукта рядом с текстом, без пустоты между ними (эталон —
          Kaspi Bot, 13.10.2026); у кого сцены ещё нет — прежняя картинка справа. */}
      {scene ? (
        <div className="lp-split" data-landing={landing}>
          {hero}
          {scene}
        </div>
      ) : (
        <>
          {hero}
          <span className="lp-art" aria-hidden="true"><ProductArt product={l.product} /></span>
        </>
      )}

      <div className="lp-stickers">
        {l.points[lang].map((t) => <span key={t} className="lp-stk">{t}</span>)}
      </div>

      <div className="lp-bar">
        <span className="lp-lab">{ui.others}</span>
        {OTHER_PRODUCT_LINKS.filter((o) => o.product !== l.product).map((o) => {
          const def = PRODUCTS.find((x) => x.key === o.product)!
          const dot = { '--dot': def.bg } as React.CSSProperties
          const name = PRODUCT_I18N[o.product].name[lang]
          const open = o.url && !def.locked && (!def.adminOnly || isAdmin)
          return open ? (
            <a key={o.product} className="lp-mini" style={dot} href={o.url!}><i /><span>{name}</span></a>
          ) : (
            <span key={o.product} className="lp-mini" style={dot} title={ui.lockedHint} data-locked="true"><i /><span>{name} · {ui.soon}</span></span>
          )
        })}
      </div>
    </main>
  )
}
