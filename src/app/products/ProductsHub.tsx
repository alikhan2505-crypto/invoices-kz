'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { PRODUCTS, PERSONAS, PENDING_PERSONA_KEY, personasProducts, selectablePersonaProducts, isInMyProducts, toggleProduct, type ProductDef } from '@/lib/products'
import { useMyProducts } from '@/lib/useMyProducts'
import { useLanguage, type Lang } from '@/components/LanguageProvider'
import { HUB_COPY, FOOTER_COPY, PERSONA_LABELS, PRODUCT_I18N } from '@/lib/i18n/productsHub'
import ProductArt from '@/components/products/ProductArt'
import { BrandWordmarkSvg } from '@/components/BrandWordmark'
import './hub-extras.css'
import { useDropStaleFocus } from '@/lib/useDropStaleFocus'

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
  // Answers to "what do you do?" — several at once since 13.10.2026 (their
  // products add up). A guest's answers narrow the tiles and are applied to
  // the account after sign-in; a signed-in person's answers fill their menu.
  const [persona, setPersona] = useState<string[]>([])
  // Signed-in, menu not chosen yet: the row stays while they keep picking
  // (the first pick already fills the menu, which would otherwise hide it).
  const [personaTouched, setPersonaTouched] = useState(false)
  const { lang, setLang } = useLanguage()
  const t = HUB_COPY[lang]
  // Заголовок вкладки на языке страницы. Язык живёт в браузере (localStorage),
  // сервер его не знает — поэтому серверный <title> лишь стартовый, а здесь
  // он подменяется под выбранный язык (ревизия 13.10: «почему вкладка
  // по-русски, когда страница на казахском?»).
  useDropStaleFocus()
  useEffect(() => { document.title = t.docTitle }, [t.docTitle])
  // Шапка закреплена (sticky): после первого скролла под ней появляется
  // тонкая линия — граница «стекла» становится видна только когда есть что отделять.
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
  const personaKeys = who.state === 'guest' ? personasProducts(persona) : null
  // teaser-карточки (сейчас CFO) видят все: доступ закрыт, но витрина есть.
  const shown = PRODUCTS.filter((p) => (!p.adminOnly || isAdmin || p.teaser) && (!personaKeys || personaKeys.includes(p.key)))
  // Asked of guests and of signed-in people who have not chosen products yet.
  const askPersona = who.state === 'guest' || (logged && (mine === null || personaTouched))

  const pName = (p: ProductDef) => PRODUCT_I18N[p.key]?.name[lang] ?? p.name
  const pBlurb = (p: ProductDef) => PRODUCT_I18N[p.key]?.blurb[lang] ?? p.blurb

  function togglePersona(key: string) {
    const next = persona.includes(key) ? persona.filter((k) => k !== key) : [...persona, key]
    setPersona(next)
    if (logged) {
      setPersonaTouched(true)
      // Only products this person can open go into the menu; un-picking the
      // last answer keeps the menu as it is rather than emptying it.
      const keys = selectablePersonaProducts(next, isAdmin)
      if (keys) saveMine(keys)
      return
    }
    try {
      if (next.length) localStorage.setItem(PENDING_PERSONA_KEY, next.join(','))
      else localStorage.removeItem(PENDING_PERSONA_KEY)
    } catch {
      // Blocked storage: the tiles still narrow, the account just stays unchosen.
    }
  }

  function clearPersona() {
    setPersona([])
    try { localStorage.removeItem(PENDING_PERSONA_KEY) } catch { /* see above */ }
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
        <div className="prd-top" data-stuck={stuck}>
          <Link href="/" className="prd-mark" aria-label="invoices.kz"><BrandWordmarkSvg height={17} /></Link>
          <span style={{ flex: 1 }} />
          <div className="prd-lang" role="group" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l.key} type="button" data-on={lang === l.key} onClick={() => setLang(l.key)}><span>{l.label}</span></button>
            ))}
          </div>
          {/* Слот фиксированной ширины под самый длинный вариант подписи
              (Dashboard): кнопка меняет свою ширину ВНУТРИ слота, поэтому
              переключатель языка слева от неё не сдвигается ни на пиксель
              (замечание основателя, ревизия 13.10 — язык слева, но на месте). */}
          <div className="prd-auth-slot">
            {who.state === 'guest' && <Link href="/login" className="prd-btn"><span>{t.signIn}</span></Link>}
            {logged && <Link href="/dashboard" className="prd-btn prd-alt"><span>{t.dashboard}</span></Link>}
          </div>
        </div>

        <div className="prd-hero">
          {/* Заголовок и подзаголовок всех трёх языков лежат стопкой в одной
              ячейке сетки; видим только активный, остальные visibility:hidden,
              но высоту занимают. Ячейка автоматически равна самому высокому
              варианту — плитки ниже стоят на одном уровне при любом языке и
              ширине экрана, а пустота (если она есть) оказывается ПОД
              подзаголовком, а не разрезает заголовок (ревизия 13.10: резерв
              «на 3 строки» оставлял дыру между ними в казахском/английском).
              Настоящий <h1> — только у активного языка. Второе предложение
              заголовка — всегда с новой строки: balance-перенос рвал фразу. */}
          <div className="prd-hero-stack">
            {(['ru', 'kk', 'en'] as Lang[]).map((l) => {
              const c = HUB_COPY[l]
              const active = l === lang
              const text = logged ? c.h1User : c.h1Guest
              const i = text.indexOf('. ')
              const heading = i === -1 ? text : <>{text.slice(0, i + 1)}<br />{text.slice(i + 2)}</>
              const Head = active ? 'h1' : 'div'
              return (
                <div key={l} className="prd-hero-lang" data-active={active} aria-hidden={!active} lang={l}>
                  <p className="prd-eyebrow">{logged ? c.eyebrowUser : c.eyebrowGuest}</p>
                  <Head className="prd-h1">{heading}</Head>
                  <p className="prd-sub">{logged ? c.subUser : c.subGuest}</p>
                </div>
              )
            })}
          </div>
        </div>

        {askPersona && (
          /* Тот же приём, что у заголовка: ряд чипов трёх языков стопкой в
             одной ячейке, виден один. Надписи разной длины переносятся в
             разное число строк (казахские длиннее) — без стопки сетка плиток
             сдвигалась на ширинах <1100px. Скрытые копии: visibility:hidden —
             их кнопки не кликаются и не попадают в Tab. */
          <div className="prd-persona-stack">
            {(['ru', 'kk', 'en'] as Lang[]).map((l) => {
              const active = l === lang
              const c = HUB_COPY[l]
              return (
                <div key={l} className="prd-persona" data-active={active} aria-hidden={!active} lang={l} role="group" aria-label={c.personaHand}>
                  <span className="prd-hand">{c.personaHand}</span>
                  {PERSONAS.map((x) => (
                    <button key={x.key} type="button" tabIndex={active ? 0 : -1} className="prd-chip" data-on={persona.includes(x.key)} aria-pressed={persona.includes(x.key)} onClick={() => togglePersona(x.key)}>
                      <span>{PERSONA_LABELS[l][x.key] ?? x.label}</span>
                    </button>
                  ))}
                  {who.state === 'guest' && persona.length > 0 && (
                    <button type="button" tabIndex={active ? 0 : -1} className="prd-chip prd-chip-quiet" onClick={clearPersona}><span>{c.showAll}</span></button>
                  )}
                </div>
              )
            })}
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

        {/* Футер: политики, реквизиты и контакты (ревизия 13.10). Страницы
            /privacy, /terms и /data-deletion существуют и заявлены в Meta App. */}
        <footer className="prd-footer">
          <span className="prd-footer-co">{FOOTER_COPY[lang].company}</span>
          <nav className="prd-footer-links" aria-label="Documents and contacts">
            <Link href="/privacy">{FOOTER_COPY[lang].privacy}</Link>
            <Link href="/terms">{FOOTER_COPY[lang].terms}</Link>
            <Link href="/data-deletion">{FOOTER_COPY[lang].dataDeletion}</Link>
            <a href="mailto:mail@invoices.kz">{FOOTER_COPY[lang].contacts}: mail@invoices.kz</a>
            <a href="https://www.instagram.com/invoices.kz/" target="_blank" rel="noopener noreferrer">Instagram</a>
          </nav>
        </footer>
      </div>
    </main>
  )
}
