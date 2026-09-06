'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, editLabel, deleteLabel, clearSearchLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'
import Skeleton from '@/components/Skeleton'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same input treatment as src/app/create/page.tsx's form fields.
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function TagIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--nav-text-muted)' }}>
      <path d="M12.6 3H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l8.2 8.2a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L13.6 3.6A2 2 0 0 0 12.6 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export default function Services() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [services, setServices] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', price: '', unit: 'шт', code: '', type: 'service'
  })

  useEffect(() => { loadServices() }, [])

  async function loadServices() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('services').select('*').eq('user_id', user.id).order('name')
    setServices(data || [])
    setLoading(false)
  }

  function startEdit(svc: any) {
    setEditingId(svc.id)
    setForm({
      name: svc.name,
      price: String(svc.price),
      unit: svc.unit || 'шт',
      code: svc.code || '',
      type: svc.type || 'service',
    })
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm({ name: '', price: '', unit: 'шт', code: '', type: 'service' })
    setShowForm(false)
  }

  async function saveService() {
    if (!form.name || !form.price) { alert(t.fillNameAndPriceAlert); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      name: form.name,
      price: Number(form.price),
      unit: form.unit,
      code: form.code || null,
      type: form.type,
    }

    if (editingId) {
      const { error } = await supabase.from('services').update(payload).eq('id', editingId)
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    } else {
      const { error } = await supabase.from('services').insert({ ...payload, user_id: user.id })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
    }

    resetForm()
    loadServices()
    setSaving(false)
  }

  async function deleteService(id: string) {
    if (!confirm(t.deleteItemConfirm)) return
    await supabase.from('services').delete().eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
  }

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.code || '').toLowerCase().includes(search.toLowerCase())
  )

  const servicesList = filtered.filter(s => !s.type || s.type === 'service')
  const productsList = filtered.filter(s => s.type === 'product')

  function ItemRow({ svc, i, total }: { svc: any; i: number; total: number }) {
    return (
      <motion.div key={svc.id}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduceMotion ? 0 : Math.min(i * 0.035, 0.3), duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        className="flex items-center px-4 py-3.5 transition-colors hover:bg-[var(--nav-surface-glass)]"
        style={{ borderBottom: i < total - 1 ? '1px solid var(--nav-border-soft)' : 'none' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate" style={{ color: 'var(--nav-text-primary)' }}>{svc.name}</span>
            {svc.code && (
              <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
                {svc.code}
              </span>
            )}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.unitLabel(svc.unit)}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm font-medium mr-1 tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
            {Number(svc.price).toLocaleString('ru-KZ')} ₸
          </span>
          <button onClick={() => startEdit(svc)} aria-label={editLabel(lang)}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)]"
            style={{ color: 'var(--nav-text-muted)' }}>
            <PencilIcon />
          </button>
          <button onClick={() => deleteService(svc.id)} aria-label={deleteLabel(lang)}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--nav-surface-glass)] hover:text-[color:var(--nav-critical)]"
            style={{ color: 'var(--nav-text-muted)' }}>
            <XIcon />
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <div className="max-w-lg lg:max-w-3xl mx-auto p-4">
          <motion.div
            className="flex items-center justify-between gap-3 mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => router.push('/profile')}
                aria-label={backLabel(lang)}
                className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors hover:bg-[var(--nav-surface-glass)]"
                style={{ color: 'var(--nav-text-muted)' }}
              >
                <ChevronLeftIcon />
              </button>
              <h2 className="text-xl font-bold truncate" style={{ color: 'var(--nav-text-primary)' }}>{t.servicesHeaderLabel}</h2>
            </div>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg flex-shrink-0 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                <PlusIcon />
                {t.openAddFormButton}
              </button>
            )}
          </motion.div>

          <motion.div
            className="nav-glass rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 }}
          >
            <span className="flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }}><SearchIcon /></span>
            <input
              className="flex-1 text-sm outline-none bg-transparent"
              placeholder={t.searchServicesPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ color: 'var(--nav-text-primary)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} aria-label={clearSearchLabel(lang)}
                className="flex-shrink-0 text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)] transition-colors">
                <XIcon />
              </button>
            )}
          </motion.div>

          {showForm && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.3, ease: EASE }}
              className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 space-y-3"
            >
              <div className="font-semibold text-sm mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                {editingId ? t.editItemHeading : t.newItemHeading}
              </div>

              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setForm({ ...form, type: 'service' })}
                  className="flex-1 px-3 py-2 text-xs rounded-lg font-semibold transition-colors"
                  style={{
                    background: form.type === 'service' ? 'var(--nav-accent)' : 'var(--nav-surface-glass)',
                    color: form.type === 'service' ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)',
                  }}>
                  {t.serviceTypeToggleLabel}
                </button>
                <button type="button"
                  onClick={() => setForm({ ...form, type: 'product' })}
                  className="flex-1 px-3 py-2 text-xs rounded-lg font-semibold transition-colors"
                  style={{
                    background: form.type === 'product' ? 'var(--nav-teal)' : 'var(--nav-surface-glass)',
                    color: form.type === 'product' ? 'white' : 'var(--nav-text-muted)',
                  }}>
                  {t.productTypeToggleLabel}
                </button>
              </div>

              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.itemNameFieldLabel}</label>
                <input
                  className={inputClass}
                  placeholder={form.type === 'service' ? t.serviceNamePlaceholder : t.productNamePlaceholder}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.itemCodeFieldLabel}</label>
                  <input
                    className={inputClass}
                    placeholder={t.itemCodePlaceholder}
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.itemPriceFieldLabel}</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder={t.itemPricePlaceholder}
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.itemUnitFieldLabel}</label>
                  <select
                    className={inputClass}
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}>
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{t.unitLabel(u)}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={resetForm}
                  className="flex-1 nav-glass rounded-xl py-3 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
                  style={{ color: 'var(--nav-text-secondary)' }}>
                  {t.cancelButton}
                </button>
                <button onClick={saveService} disabled={saving}
                  className="flex-1 rounded-xl py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.formSubmitLabel(saving, !!editingId)}
                </button>
              </div>
            </motion.div>
          )}

          {loading ? (
            <div className="nav-glass rounded-2xl overflow-hidden mb-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center px-4 py-3.5" style={{ borderBottom: i < 2 ? '1px solid var(--nav-border-soft)' : 'none' }}>
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12">
              <TagIcon />
              <p className="text-sm mt-3" style={{ color: 'var(--nav-text-secondary)' }}>{t.itemsEmptyStateLabel(!!search)}</p>
            </div>
          ) : (
            <>
              {servicesList.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
                    {t.servicesSectionLabel(servicesList.length)}
                  </div>
                  <div className="nav-glass rounded-2xl overflow-hidden">
                    {servicesList.map((svc, i) => <ItemRow key={svc.id} svc={svc} i={i} total={servicesList.length} />)}
                  </div>
                </div>
              )}

              {productsList.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>
                    {t.productsSectionLabel(productsList.length)}
                  </div>
                  <div className="nav-glass rounded-2xl overflow-hidden">
                    {productsList.map((svc, i) => <ItemRow key={svc.id} svc={svc} i={i} total={productsList.length} />)}
                  </div>
                </div>
              )}
            </>
          )}

          {!showForm && services.length > 0 && (
            <motion.button
              onClick={() => setShowForm(true)}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
            >
              <PlusIcon />
              {t.addItemButton}
            </motion.button>
          )}
        </div>
      </main>
    </DesktopShell>
  )
}
