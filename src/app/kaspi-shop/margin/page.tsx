'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import {
  computeMargin, computeVerdict, estimateKaspiDeliveryFee,
  KASPI_CATEGORY_COMMISSIONS, DEFAULT_CARGO_RATE_PER_KG, DEFAULT_TARGET_MARGIN_PERCENT,
} from '@/lib/kaspiShop/margin'

// Same house conventions as the rest of Kaspi Shop (page.tsx, niches/page.tsx) --
// kept byte-identical rather than inventing new ones for this page.
const EASE = [0.16, 1, 0.3, 1] as const
const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
const MANUAL_CATEGORY = '__manual__'

type Evaluation = {
  id: string
  product_name: string
  kaspi_price: number
  sourcing_price: number
  weight_grams: number
  packaging_cost: number
  cargo_rate_per_kg: number
  category_label: string | null
  commission_rate_percent: number
  delivery_fee: number
  source_url: string | null
  city_code: string | null
  margin_percent: number
  profit_amount: number
  verdict: 'take' | 'skip'
  created_at: string
}

function XIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-KZ')
}

export default function KaspiShopMargin() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Form state -- all controlled as strings so an empty field reads as ''
  // rather than a coerced 0 that's hard to tell apart from "seller typed 0".
  const [productName, setProductName] = useState('')
  const [kaspiPrice, setKaspiPrice] = useState('')
  const [sourcingPrice, setSourcingPrice] = useState('')
  const [weightGrams, setWeightGrams] = useState('')
  const [packagingCost, setPackagingCost] = useState('')
  const [cargoRatePerKg, setCargoRatePerKg] = useState(String(DEFAULT_CARGO_RATE_PER_KG))
  const [categorySelection, setCategorySelection] = useState('')
  const [commissionRatePercent, setCommissionRatePercent] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [deliveryTouched, setDeliveryTouched] = useState(false)
  const [cityNote, setCityNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')

  const [targetMarginPercent, setTargetMarginPercent] = useState(String(DEFAULT_TARGET_MARGIN_PERCENT))
  const [savingTarget, setSavingTarget] = useState(false)

  const [whatIfPercent, setWhatIfPercent] = useState(100)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  // Auto-fill the delivery estimate from weight -- but only until the
  // seller directly edits the field. Same "don't clobber a manual override"
  // rule the rest of Kaspi Shop follows for tracked-city availability etc.
  useEffect(() => {
    if (deliveryTouched) return
    const w = Number(weightGrams)
    if (Number.isFinite(w) && w > 0) setDeliveryFee(String(estimateKaspiDeliveryFee(w)))
  }, [weightGrams, deliveryTouched])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
    if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/dashboard'); return }
    // Демпинг is the only page with the actual connect terminal (phone/OTP)
    // -- every other page redirects there instead of rendering its own broken
    // state when there's no active connection (2026-09-03 founder: check for a
    // connected store before opening any page or sub-page).
    const { data: { session } } = await supabase.auth.getSession()
    const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    const connData = await connRes.json().catch(() => null)
    if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/margin', { headers })
      if (res.ok) {
        const data = await res.json()
        setEvaluations(data.evaluations || [])
        if (typeof data.targetMarginPercent === 'number') setTargetMarginPercent(String(data.targetMarginPercent))
      } else {
        setLoadError('Не удалось загрузить сохранённые расчёты.')
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  function selectCategory(label: string) {
    setCategorySelection(label)
    if (label === MANUAL_CATEGORY || label === '') return
    const found = KASPI_CATEGORY_COMMISSIONS.find(c => c.label === label)
    if (found) setCommissionRatePercent(String(found.ratePercent))
  }

  async function saveTargetMargin() {
    const value = Number(targetMarginPercent)
    if (!Number.isFinite(value) || value < 0 || value > 100) return
    setSavingTarget(true)
    const headers = await authHeader()
    await fetch('/api/kaspi-shop/margin', { method: 'PATCH', headers, body: JSON.stringify({ targetMarginPercent: value }) })
    setSavingTarget(false)
  }

  // The live calculation -- recomputed on every keystroke via useMemo,
  // calling the pure src/lib/kaspiShop/margin.ts functions directly (no
  // network, no submit button needed).
  const baseInputs = useMemo(() => ({
    kaspiPrice: Number(kaspiPrice) || 0,
    commissionRatePercent: Number(commissionRatePercent) || 0,
    sourcingPrice: Number(sourcingPrice) || 0,
    weightGrams: Number(weightGrams) || 0,
    cargoRatePerKgTenge: Number(cargoRatePerKg) || 0,
    packagingCost: Number(packagingCost) || 0,
    deliveryFee: Number(deliveryFee) || 0,
  }), [kaspiPrice, commissionRatePercent, sourcingPrice, weightGrams, cargoRatePerKg, packagingCost, deliveryFee])

  const result = useMemo(() => computeMargin(baseInputs), [baseInputs])
  const targetNum = Number(targetMarginPercent) || 0
  const verdict = computeVerdict(result.marginPercent, targetNum)

  // Sensitivity: same cost structure, a lower simulated Kaspi price -- shows
  // how margin erodes if a Демпинг repricer race pushes this product's price
  // down, so the seller can pick a sane floor before setting one up.
  const whatIfPrice = baseInputs.kaspiPrice * (whatIfPercent / 100)
  const whatIfResult = useMemo(
    () => computeMargin({ ...baseInputs, kaspiPrice: whatIfPrice }),
    [baseInputs, whatIfPrice]
  )
  const whatIfVerdict = computeVerdict(whatIfResult.marginPercent, targetNum)

  const canSave = productName.trim() !== '' && baseInputs.kaspiPrice > 0

  async function saveEvaluation() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/margin', {
        method: 'POST', headers,
        body: JSON.stringify({
          productName: productName.trim(),
          kaspiPrice: baseInputs.kaspiPrice,
          sourcingPrice: baseInputs.sourcingPrice,
          weightGrams: baseInputs.weightGrams,
          packagingCost: baseInputs.packagingCost,
          cargoRatePerKg: baseInputs.cargoRatePerKgTenge,
          categoryLabel: categorySelection && categorySelection !== MANUAL_CATEGORY ? categorySelection : null,
          commissionRatePercent: baseInputs.commissionRatePercent,
          deliveryFee: baseInputs.deliveryFee,
          sourceUrl: sourceUrl.trim() || null,
          cityCode: cityNote.trim() || null,
          marginPercent: result.marginPercent,
          profitAmount: result.profit,
          verdict,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveError(data.error || 'Не удалось сохранить'); return }
      setEvaluations(prev => [data.evaluation, ...prev])
    } catch {
      setSaveError('Не удалось сохранить. Проверьте соединение.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvaluation(id: string) {
    setDeletingId(id)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/margin', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    if (res.ok) setEvaluations(prev => prev.filter(e => e.id !== id))
    setDeletingId(null)
  }

  if (loading) return <LoadingSpinner />

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={load} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Калькулятор маржи</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-1" style={{ color: 'var(--nav-text-primary)' }}>Брать или не брать?</h1>
          <p className="text-xs mb-6" style={{ color: 'var(--nav-text-muted)' }}>Посчитайте реальную маржу товара до того, как выставите его на Kaspi.</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input form */}
            <div className="flex flex-col gap-3">
              <label className="block">
                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Название товара</span>
                <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                  placeholder="Например: термокружка 500мл" value={productName} onChange={e => setProductName(e.target.value)} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена Kaspi, ₸</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={kaspiPrice} onChange={e => setKaspiPrice(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена 1688, ₸</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={sourcingPrice} onChange={e => setSourcingPrice(e.target.value)} />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Вес, г</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={weightGrams} onChange={e => setWeightGrams(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Упаковка, ₸</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={packagingCost} onChange={e => setPackagingCost(e.target.value)} />
                </label>
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Карго, ₸/кг</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={cargoRatePerKg} onChange={e => setCargoRatePerKg(e.target.value)} />
                </label>
              </div>

              <label className="block">
                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Категория Kaspi</span>
                <select className={`${INPUT_CLS} mb-2`} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)' }}
                  value={categorySelection} onChange={e => selectCategory(e.target.value)}>
                  <option value="">Выберите категорию…</option>
                  {KASPI_CATEGORY_COMMISSIONS.map(c => <option key={c.label} value={c.label}>{c.label} — {c.ratePercent}%</option>)}
                  <option value={MANUAL_CATEGORY}>Другое — указать комиссию вручную</option>
                </select>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}>Комиссия Kaspi, %</span>
                  <input className={`${INPUT_CLS} font-mono py-1.5`} type="number" step="0.1" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={commissionRatePercent} onChange={e => { setCommissionRatePercent(e.target.value); setCategorySelection(MANUAL_CATEGORY) }} />
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Доставка Kaspi, ₸</span>
                  <input className={`${INPUT_CLS} font-mono`} type="number" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    value={deliveryFee} onChange={e => { setDeliveryFee(e.target.value); setDeliveryTouched(true) }} />
                </label>
                <label className="block">
                  <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Город (для справки)</span>
                  <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                    placeholder="Алматы" value={cityNote} onChange={e => setCityNote(e.target.value)} />
                </label>
              </div>
              {deliveryTouched && (
                <button onClick={() => { setDeliveryTouched(false) }} className="text-[11px] self-start underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>
                  Пересчитать доставку по весу
                </button>
              )}

              <label className="block">
                <span className="text-[11px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Ссылка на 1688 (необязательно)</span>
                <input className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}
                  placeholder="https://detail.1688.com/..." value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
              </label>
            </div>

            {/* Result panel */}
            <div className="flex flex-col">
              <div className="nav-glass rounded-2xl p-5 mb-3" style={{ borderColor: verdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-2xl font-black tracking-tight px-4 py-1.5 rounded-full"
                    style={{ background: verdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)', color: '#fff' }}>
                    {verdict === 'take' ? 'Брать' : 'Не брать'}
                  </span>
                  <div className="text-right">
                    <div className="text-3xl font-black font-mono tabular-nums" style={{ color: verdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
                      {result.marginPercent.toFixed(1)}%
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>маржа</div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm mb-3">
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--nav-text-secondary)' }}>Цена Kaspi</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{fmt(baseInputs.kaspiPrice)} ₸</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--nav-text-secondary)' }}>− Комиссия Kaspi ({baseInputs.commissionRatePercent || 0}%)</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>−{fmt(result.commissionAmount)} ₸</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--nav-text-secondary)' }}>− Доставка Kaspi (с НДС)</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>−{fmt(baseInputs.deliveryFee)} ₸</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: 'var(--nav-text-secondary)' }}>− Себестоимость</span>
                    <span className="font-mono tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>−{fmt(result.cogs)} ₸</span>
                  </div>
                  <div className="pl-3 space-y-1 text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                    <div className="flex items-center justify-between"><span>1688</span><span className="font-mono">{fmt(baseInputs.sourcingPrice)} ₸</span></div>
                    <div className="flex items-center justify-between"><span>Карго ({(baseInputs.weightGrams / 1000).toFixed(2)} кг × {fmt(baseInputs.cargoRatePerKgTenge)})</span><span className="font-mono">{fmt(result.cargoCost)} ₸</span></div>
                    <div className="flex items-center justify-between"><span>Упаковка</span><span className="font-mono">{fmt(baseInputs.packagingCost)} ₸</span></div>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
                    <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>= Прибыль</span>
                    <span className="font-mono font-bold tabular-nums" style={{ color: result.profit >= 0 ? 'var(--nav-success)' : 'var(--nav-critical)' }}>{fmt(result.profit)} ₸</span>
                  </div>
                </div>
              </div>

              {/* Target margin */}
              <div className="nav-glass rounded-2xl p-4 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Цель по марже</span>
                  <div className="flex items-center gap-2">
                    <input className={`${INPUT_CLS} font-mono py-1 px-2 w-20 text-right`} type="number" style={{ color: 'var(--nav-text-primary)' }}
                      value={targetMarginPercent} onChange={e => setTargetMarginPercent(e.target.value)} onBlur={saveTargetMargin} />
                    <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>%</span>
                  </div>
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                  {savingTarget ? 'Сохраняем…' : 'Ниже этой маржи товар помечается «Не брать».'}
                </div>
              </div>

              {/* Sensitivity slider */}
              <div className="nav-glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-primary)' }}>Что если цена упадёт?</span>
                  <span className="text-xs font-mono" style={{ color: whatIfVerdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
                    {fmt(whatIfPrice)} ₸ · {whatIfResult.marginPercent.toFixed(1)}%
                  </span>
                </div>
                <input type="range" min={50} max={130} step={1} value={whatIfPercent}
                  onChange={e => setWhatIfPercent(Number(e.target.value))}
                  className="w-full accent-[var(--nav-accent)]" />
                <div className="flex items-center justify-between text-[11px] mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                  <span>−50%</span>
                  <span>{whatIfPercent}% от текущей цены</span>
                  <span>+30%</span>
                </div>
                <div className="text-[11px] mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                  Полезно перед тем, как настроить демпинг-репрайсер на этот товар — так видно, до какой цены ещё есть смысл опускаться.
                </div>
              </div>

              {saveError && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{saveError}</div>}
              <button onClick={saveEvaluation} disabled={!canSave || saving}
                className="mt-3 rounded-xl py-3 text-sm font-semibold disabled:opacity-40" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {saving ? 'Сохраняем...' : 'Сохранить в список'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Saved evaluations */}
        <div className="nav-glass rounded-2xl overflow-hidden">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--nav-text-muted)' }}>
            Сохранённые расчёты {evaluations.length > 0 && `(${evaluations.length})`}
          </div>
          {evaluations.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Пока ничего не сохранено.</div>
          ) : (
            <AnimatePresence initial={false}>
              {evaluations.map((ev, i) => (
                <motion.div key={ev.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.03, 0.2) }}
                  className={`px-4 py-3 flex items-center justify-between gap-3 ${CARD_HOVER}`}
                  style={{ borderTop: i > 0 ? '1px solid var(--nav-border-soft)' : undefined }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{ev.product_name}</div>
                    <div className="text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                      {fmt(ev.kaspi_price)} ₸ · {ev.category_label || 'без категории'} · {new Date(ev.created_at).toLocaleDateString('ru-KZ')}
                      {ev.source_url && <> · <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">1688 ↗</a></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <div className="font-mono font-bold text-sm tabular-nums" style={{ color: ev.verdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)' }}>
                        {Number(ev.margin_percent).toFixed(1)}%
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block"
                        style={{ background: ev.verdict === 'take' ? 'var(--nav-success)' : 'var(--nav-critical)', color: '#fff' }}>
                        {ev.verdict === 'take' ? 'Брать' : 'Не брать'}
                      </span>
                    </div>
                    <button onClick={() => deleteEvaluation(ev.id)} disabled={deletingId === ev.id}
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40"
                      style={{ color: 'var(--nav-text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--nav-critical)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--nav-text-muted)')}>
                      <XIcon />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </main>
    </DesktopShell>
  )
}
