'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

const EASE = [0.16, 1, 0.3, 1] as const

type NktProduct = {
  id: string
  kaspiSku: string
  productName: string
  brand: string | null
  kaspiCategory: string | null
  ntinStatus: 'not_started' | 'suggested' | 'submitted' | 'approved' | 'rejected'
  suggestedOktruCode: string | null
  suggestedOktruName: string | null
  suggestedTnvedCode: string | null
  suggestionReasoning: string | null
  suggestionConfident: boolean | null
  submittedAt: string | null
}

// Same token palette every other kaspi-shop status chip already uses
// (orders, tracked-product enabled/disabled) -- no new CSS variables.
const STATUS_CHIP: Record<NktProduct['ntinStatus'], { label: string; bg: string; fg: string }> = {
  not_started: { label: 'Не начато', bg: 'var(--nav-surface-chrome)', fg: 'var(--nav-text-muted)' },
  suggested: { label: 'Категория предложена', bg: 'var(--nav-accent-soft)', fg: 'var(--nav-accent)' },
  submitted: { label: 'Подано (самоотчёт)', bg: 'var(--nav-teal-soft)', fg: 'var(--nav-teal)' },
  approved: { label: 'NTIN получен', bg: 'var(--nav-success-soft)', fg: 'var(--nav-success)' },
  rejected: { label: 'Отклонено', bg: 'rgba(220, 38, 38, 0.12)', fg: 'var(--nav-critical)' },
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can fail silently (permissions, insecure context)
      // -- the code is still selectable/visible on screen either way, so
      // this isn't worth surfacing an error for.
    }
  }
  return (
    <button onClick={copy} className="flex items-center gap-1.5 text-left nav-glass rounded-lg px-2.5 py-1.5 transition-colors hover:border-[color:var(--nav-accent)]">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--nav-text-muted)' }}>{label}</span>
      <span className="text-xs font-mono font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{value}</span>
      <span className="text-[10px]" style={{ color: copied ? 'var(--nav-success)' : 'var(--nav-text-muted)' }}>{copied ? 'скопировано' : 'копировать'}</span>
    </button>
  )
}

export default function KaspiShopNkt() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<NktProduct[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<Record<string, string>>({})

  useEffect(() => { checkAccess() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setLoading(false)
    loadProducts()
  }

  async function loadProducts() {
    setListLoading(true)
    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/nkt', { headers })
      const data = await res.json()
      if (!res.ok) { setLoadError(data.error || 'Не удалось загрузить товары'); setProducts([]); return }
      setProducts(data.products || [])
    } catch {
      setLoadError('Не удалось загрузить товары. Проверьте соединение и попробуйте ещё раз.')
      setProducts([])
    } finally {
      setListLoading(false)
    }
  }

  async function runAction(trackedProductId: string, action: 'suggest' | 'mark_submitted') {
    setBusyId(trackedProductId)
    setActionError(prev => ({ ...prev, [trackedProductId]: '' }))
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/nkt', {
        method: 'POST', headers, body: JSON.stringify({ action, trackedProductId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setActionError(prev => ({ ...prev, [trackedProductId]: data.error || 'Не удалось выполнить действие' }))
        return
      }
      setProducts(prev => prev.map(p => p.id === trackedProductId ? {
        ...p,
        ntinStatus: data.ntinStatus ?? p.ntinStatus,
        suggestedOktruCode: 'suggestedOktruCode' in data ? data.suggestedOktruCode : p.suggestedOktruCode,
        suggestedOktruName: 'suggestedOktruName' in data ? data.suggestedOktruName : p.suggestedOktruName,
        suggestedTnvedCode: 'suggestedTnvedCode' in data ? data.suggestedTnvedCode : p.suggestedTnvedCode,
        suggestionReasoning: 'suggestionReasoning' in data ? data.suggestionReasoning : p.suggestionReasoning,
        suggestionConfident: 'suggestionConfident' in data ? data.suggestionConfident : p.suggestionConfident,
        submittedAt: 'submittedAt' in data ? data.submittedAt : p.submittedAt,
      } : p))
    } catch {
      setActionError(prev => ({ ...prev, [trackedProductId]: 'Проверьте соединение и попробуйте ещё раз.' }))
    } finally {
      setBusyId(null)
    }
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
            <button onClick={loadProducts} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Каталог НКТ</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-3" style={{ color: 'var(--nav-text-primary)' }}>
            Национальный каталог товаров {products.length > 0 && <span style={{ color: 'var(--nav-text-muted)' }}>· {products.length}</span>}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
            С 2026 года регистрация NTIN (кода товара) в НКТ обязательна для продажи на Kaspi.kz. ИИ помогает подобрать вероятный код категории ОКТРУ и код ТН ВЭД — <b>это предложение, а не гарантированно верный код</b>: обязательно проверьте перед подачей. Сама подача заявки происходит на сайте{' '}
            <a href="https://nationalcatalog.kz" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: 'var(--nav-accent)' }}>nationalcatalog.kz</a>{' '}
            — прямой автоматической подачи из этого кабинета нет (мы не нашли подтверждённого способа сделать это программно ни через Kaspi, ни через НКТ).
          </p>
        </motion.div>

        {listLoading ? (
          <div className="nav-glass rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем товары...</div>
        ) : products.length === 0 ? (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Отслеживаемых товаров пока нет.</div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {products.map((p, i) => {
              const chip = STATUS_CHIP[p.ntinStatus] || STATUS_CHIP.not_started
              const busy = busyId === p.id
              const hasSuggestion = p.ntinStatus === 'suggested' || p.ntinStatus === 'submitted' || p.ntinStatus === 'approved'
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.02, 0.2) }}
                  className="nav-glass rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{p.productName}</div>
                      <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>
                        {p.brand && <span>{p.brand}</span>}
                        {p.kaspiCategory && <span>{p.brand ? ' · ' : ''}{p.kaspiCategory}</span>}
                        {' · SKU '}{p.kaspiSku}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 flex-shrink-0" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                  </div>

                  {hasSuggestion && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {p.suggestedOktruCode && p.suggestedOktruName ? (
                          <CopyField label={`ОКТРУ · ${p.suggestedOktruName}`} value={p.suggestedOktruCode} />
                        ) : (
                          <span className="text-xs rounded-lg px-2.5 py-1.5" style={{ color: 'var(--nav-text-muted)', background: 'var(--nav-surface-chrome)' }}>ОКТРУ: ИИ не уверен</span>
                        )}
                        {p.suggestedTnvedCode ? (
                          <CopyField label="ТН ВЭД" value={p.suggestedTnvedCode} />
                        ) : (
                          <span className="text-xs rounded-lg px-2.5 py-1.5" style={{ color: 'var(--nav-text-muted)', background: 'var(--nav-surface-chrome)' }}>ТН ВЭД: ИИ не уверен</span>
                        )}
                      </div>
                      {p.suggestionReasoning && (
                        <div className="text-[11px] leading-relaxed" style={{ color: 'var(--nav-text-muted)' }}>{p.suggestionReasoning}</div>
                      )}
                      {p.suggestionConfident === false && (
                        <div className="text-[11px] font-medium" style={{ color: 'var(--nav-critical)' }}>ИИ не уверен в предложенных кодах — проверьте вручную перед подачей.</div>
                      )}
                    </div>
                  )}

                  {actionError[p.id] && (
                    <div className="mt-2 text-xs" style={{ color: 'var(--nav-critical)' }}>{actionError[p.id]}</div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => runAction(p.id, 'suggest')} disabled={busy}
                      className="text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {busy ? 'Подбираем...' : hasSuggestion ? 'Предложить заново' : 'Предложить категорию'}
                    </button>
                    {p.ntinStatus === 'suggested' && (
                      <button onClick={() => runAction(p.id, 'mark_submitted')} disabled={busy}
                        className="nav-glass text-xs font-medium rounded-lg px-3 py-1.5 disabled:opacity-50" style={{ color: 'var(--nav-text-primary)' }}>
                        Я подал(а) заявку в НКТ
                      </button>
                    )}
                    {p.submittedAt && (
                      <span className="text-[11px] self-center" style={{ color: 'var(--nav-text-muted)' }}>
                        Отмечено {new Date(p.submittedAt).toLocaleDateString('ru-KZ')}
                      </span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
