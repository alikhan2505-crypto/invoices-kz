'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { PRODUCTS, isInMyProducts, toggleProduct, type ProductDef } from '@/lib/products'
import { useMyProducts } from '@/lib/useMyProducts'
import ProductArt from '@/components/products/ProductArt'

type Who = { state: 'loading' } | { state: 'guest' } | { state: 'user'; isAdmin: boolean; isPro: boolean }

// Grid spans: two big tiles first, then rows of three; a short last row
// stretches so nothing sits alone next to dead space.
function spanFor(i: number, n: number): number {
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

export default function ProductsHub({ fontClass }: { fontClass: string }) {
  const [who, setWho] = useState<Who>({ state: 'loading' })
  const [mine, saveMine] = useMyProducts()

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
  const shown = PRODUCTS.filter((p) => !p.adminOnly || isAdmin)

  return (
    <main className={`prd-root ${fontClass}`}>
      <span className="prd-blob prd-b1" />
      <span className="prd-blob prd-b2" />
      <span className="prd-blob prd-b3" />
      <span className="prd-ghost" aria-hidden="true">{shown.length}</span>

      <div className="prd-wrap">
        <div className="prd-top">
          <Link href="/" className="prd-mark"><i />invoices.kz</Link>
          <span style={{ flex: 1 }} />
          {who.state === 'guest' && <Link href="/login" className="prd-btn"><span>Войти</span></Link>}
          {logged && <Link href="/dashboard" className="prd-btn prd-alt"><span>Дашборд</span></Link>}
        </div>

        <div className="prd-hero">
          <p className="prd-eyebrow">{logged ? 'Ваши продукты' : 'Счета, Kaspi, API, агенты'}</p>
          <h1 className="prd-h1">{logged ? 'Что показывать в меню' : 'Один аккаунт. Каждый инструмент — отдельно.'}</h1>
          <p className="prd-sub">
            {logged
              ? 'Отметьте продукты, которые нужны вам. Остальные уйдут из меню, но по прямой ссылке откроются — ничего не удаляется.'
              : 'Не продаёте на Kaspi — не увидите его в меню. Понадобится позже — добавите в один клик.'}
          </p>
        </div>

        <div className="prd-grid">
          {shown.map((p, i) => {
            const style = { ...tileVars(p), gridColumn: `span ${spanFor(i, shown.length)}` }
            const big = i < 2
            if (p.locked) {
              return (
                <div key={p.key} className="prd-tile" style={style} data-big={big} data-locked="true" aria-disabled="true" title="Раздел ещё дорабатывается">
                  <span className="prd-pill prd-on">Скоро</span>
                  <span className="prd-tn">{p.name}</span>
                  <span className="prd-tl">{p.blurb}</span>
                  <span className="prd-foot"><span className="prd-go"><span>Раздел дорабатывается</span></span></span>
                  <span className="prd-art"><ProductArt product={p.key} /></span>
                </div>
              )
            }
            const inMenu = isInMyProducts(mine, p.key)
            const proTag = p.proOnly && who.state === 'user' && !isPro && !isAdmin
            return (
              <div key={p.key} className="prd-tile" style={style} data-big={big} data-out={logged && !inMenu}>
                <Link href={p.href} className="prd-cover" aria-label={`Открыть: ${p.name}`} />
                {logged && <span className={`prd-pill${inMenu ? ' prd-on' : ''}`}><span>{inMenu ? 'В меню' : 'Не в меню'}</span></span>}
                <span className="prd-tn">{p.name}</span>
                <span className="prd-tl">{p.blurb}{proTag ? ' · тариф Про' : ''}</span>
                <span className="prd-foot">
                  <span className="prd-go"><span>{logged ? 'Открыть' : 'Что внутри'} →</span></span>
                  {logged && (
                    <button type="button" className="prd-toggle" onClick={() => saveMine(toggleProduct(mine, p.key))}>
                      <span>{inMenu ? 'Убрать из меню' : 'Добавить в меню'}</span>
                    </button>
                  )}
                </span>
                <span className="prd-art"><ProductArt product={p.key} /></span>
              </div>
            )
          })}
        </div>

        <p className="prd-note">
          {logged
            ? 'Меню — это только ваш выбор, что показывать. Доступ к продуктам он не меняет: тариф и права остаются прежними.'
            : 'Аккаунт, тариф и кошелёк — общие для всех продуктов. Войдёте один раз — дальше не нужно.'}
        </p>
      </div>
    </main>
  )
}
