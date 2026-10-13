'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { PRODUCTS, PERSONAS, PENDING_PERSONA_KEY, personaProducts, isInMyProducts, toggleProduct, type ProductDef } from '@/lib/products'
import { useMyProducts } from '@/lib/useMyProducts'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { HUB_COPY, PERSONA_LABELS, PRODUCT_I18N } from '@/lib/i18n/productsHub'
import ProductArt from '@/components/products/ProductArt'
import './hub-extras.css'

type Who = { state: 'loading' } | { state: 'guest' } | { state: 'user'; isAdmin: boolean; isPro: boolean }

// Grid spans: two big tiles first, then rows of three; a short last row
// stretches so nothing sits alone next to dead space.
function spanFor(i: number, n: number): number {
  if (n === 1) return 12
  if (n === 2) return 6
  if (i === 0) return 7
  if (i === 1) return 5
  const rest = n - 2
  const j = i - 2
  const lastRowSize = rest % 3
  if (lastRowSize === 1 && j === rest - 1) return 12
  if (lastRowSize === 2 && j >= rest - 2) return 6
  return 4
}

function tileVars(p: ProductDef): React.CSSProperties {
  return { '--bg-t': p.bg, '--ink-t': p.ink } as React.CSSProperties
}

const LANGS: { key: Lang; label: string }[] = [
  { key: 'ru', label: 'Рус' },
  { key: 'kk', label: 'Қаз' },
  { key: 'en', label: 'Eng' },
]

export default function ProductsHub({ fontClass }: { fontClass: string }) {
  const [who, setWho] = useState<Who>({ state: 'loading' })
  const [mine, saveMine] = useMyProducts()
  // Guest's answer to "what do you do?" (narrows the tiles, applied after sign-in).
  const [persona, setPersona] = useState<string | null>(null)
  const { lang, setLang } = useLanguage()
  const t = HUB_COPY[lang]

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setWho({ state: 'guest' }); return }
      const { data } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      setWho({ state: 'user', isAdmin: !!data?.is_admin, isPro: getActivePlan(data).canAiAgent })
    }
    void load()
  }, [])

  const logged = who.state === 'user'
  const isAdmin = who.state === 'user' && who.isAdmin
  const isPro = who.state === 'user' && who.isPro
  const personaKeys = who.state === 'guest' ? personaProducts(persona) : null
  // teaser-карточки (сейчас CFO) видят все: доступ закрыт, но витрина есть.
  const shown = PRODUCTS.filter((p) => (!p.adminOnly || isAdmin || p.teaser) && (!personaKeys || personaKeys.includes(p.key)))
  // Asked of guests and of signed-in people who have not chosen products yet.
  const askPersona = who.state === 'guest' || (logged && mine === null)

  const pName = (p: ProductDef) => PRODUCT_I18N[p.key]?.name[lang] ?? p.name
  const pBlurb = (p: ProductDef) => PRODUCT_I18N[p.key]?.blurb[lang] ?? p.blurb

  function choosePersona(key: string | null) {
    if (logged) {
      const keys = personaProducts(key)
      if (keys) saveMine(keys)
      return
    }
    setPersona(key)
    try {
      if (key) localStorage.setItem(PENDING_PERSONA_KEY, key)
      else localStorage.removeItem(PENDING_PERSONA_KEY)
    } catch {
      // Blocked storage: the tiles still narrow, the account just stays unchosen.
    }
  }

  return (
    <main className={`prd-root ${fontClass}`}>
      <span className="prd-blob prd-b1" />
      <span className="prd-blob prd-b2" />
      <span className="prd-blob prd-b3" />
      {/* Цифра — число видимых карточек. SVG-текст вместо span: только у него
          штрих можно «прорисовать» (stroke-dasharray); key перезапускает
          анимацию при каждой смене числа — выбор персоны перерисовывает цифру. */}
      <svg key={shown.length} className="prd-ghost" aria-hidden="true">
        <text x="100%" y="0.84em" textAnchor="end">{shown.length}</text>
      </svg>

      <div className="prd-wrap">
        <div className="prd-top">
          <Link href="/" className="prd-mark"><i />invoices.kz</Link>
          <span style={{ flex: 1 }} />
          <div className="prd-lang" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l.key} type="button" data-on={lang === l.key} onClick={() => setLang(l.key)}><span>{l.label}</span></button>
            ))}
          </div>
          {who.state === 'guest' && <Link href="/login" className="prd-btn"><span>{t.signIn}</span></Link>}
          {logged && <Link href="/dashboard" className="prd-btn prd-alt"><span>{t.dashboard}</span></Link>}
        </div>

        <div className="prd-hero">
          <p className="prd-eyebrow">{logged ? t.eyebrowUser : t.eyebrowGuest}</p>
          <h1 className="prd-h1">{logged ? t.h1User : t.h1Guest}</h1>
          <p className="prd-sub">{logged ? t.subUser : t.subGuest}</p>
        </div>

        {askPersona && (
          <div className="prd-persona">
            <span className="prd-hand">{t.personaHand}</span>
            {PERSONAS.map((x) => (
              <button key={x.key} type="button" className="prd-chip" data-on={persona === x.key} onClick={() => choosePersona(x.key)}>
                <span>{PERSONA_LABELS[lang][x.key] ?? x.label}</span>
              </button>
            ))}
            {persona && <button type="button" className="prd-chip prd-chip-quiet" onClick={() => choosePersona(null)}><span>{t.showAll}</span></button>}
          </div>
        )}

        <div className="prd-grid">
          {shown.map((p, i) => {
            const style = { ...tileVars(p), gridColumn: `span ${spanFor(i, shown.length)}` }
            const big = i < 2
            // «Скоро»: заблокированные продукты и teaser-карточки для тех,
            // кому доступ ещё не открыт (CFO до клик-ревью основателя).
            if (p.locked || (p.adminOnly && !isAdmin)) {
              return (
                <div key={p.key} className="prd-tile" style={style} data-big={big} data-locked="true" aria-disabled="true" title={t.soonFoot}>
                  <span className="prd-pill prd-on">{t.soon}</span>
                  <span className="prd-tn">{pName(p)}</span>
                  <span className="prd-tl">{pBlurb(p)}</span>
                  <span className="prd-foot"><span className="prd-go"><span>{t.soonFoot}</span></span></span>
                  <span className="prd-art"><ProductArt product={p.key} /></span>
                </div>
              )
            }
            const inMenu = isInMyProducts(mine, p.key)
            // Guests (and accounts that can't open the cabinet, e.g. salon for now) see the product's public page.
            const target = p.landing && (!logged || (p.key === 'salon' && !isAdmin)) ? p.landing : p.href
            const proTag = p.proOnly && who.state === 'user' && !isPro && !isAdmin
            return (
              <div key={p.key} className="prd-tile" style={style} data-big={big} data-out={logged && !inMenu}>
                <Link href={target} className="prd-cover" aria-label={`${t.open}: ${pName(p)}`} />
                {logged && <span className={`prd-pill${inMenu ? ' prd-on' : ''}`}><span>{inMenu ? t.inMenu : t.notInMenu}</span></span>}
                <span className="prd-tn">{pName(p)}</span>
                <span className="prd-tl">{pBlurb(p)}{proTag ? t.proTag : ''}</span>
                <span className="prd-foot">
                  <span className="prd-go"><span>{logged ? t.open : t.whatsInside} →</span></span>
                  {logged && (
                    <button type="button" className="prd-toggle" onClick={() => saveMine(toggleProduct(mine, p.key))}>
                      <span>{inMenu ? t.removeFromMenu : t.addToMenu}</span>
                    </button>
                  )}
                </span>
                <span className="prd-art"><ProductArt product={p.key} /></span>
              </div>
            )
          })}
        </div>

        <p className="prd-note">{logged ? t.noteUser : t.noteGuest}</p>
      </div>
    </main>
  )
}
