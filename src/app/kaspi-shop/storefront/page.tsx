'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'

const EASE = [0.16, 1, 0.3, 1] as const

type Settings = {
  connectionId: string; companyName: string; slug: string | null; published: boolean; cashierConnected: boolean; visibleProductCount: number
  backgroundColor: string | null; deliveryInfo: string | null; chatWidgetEnabled: boolean; hasWebsiteWidget: boolean
}

// Mirrors STOREFRONT_BACKGROUND_PRESETS in src/lib/kaspiShop/storefront.ts --
// duplicated here (not imported) since this is a 'use client' component and
// that module pulls in the service-role Supabase client.
const BACKGROUND_PRESETS = ['#ffffff', '#f5f4f0', '#eef2ff', '#fdf2f8', '#ecfdf5', '#111827'] as const
type KaspiCatalogProduct = { id: string; name: string; price: number; imageUrl: string | null; showOnStorefront: boolean; categoryId: string | null }
type CustomCatalogProduct = { id: string; name: string; price: number; imageUrl: string | null; stockCount: number | null; categoryId: string | null }
type StorefrontCategory = { id: string; name: string; sortOrder: number }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

export default function KaspiShopStorefrontSettings() {
  const router = useRouter()
  const reduceMotion = !!useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [noConnection, setNoConnection] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [slugInput, setSlugInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'settings' | 'catalog'>('settings')

  // Каталог tab state
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [kaspiProducts, setKaspiProducts] = useState<KaspiCatalogProduct[]>([])
  const [customProducts, setCustomProducts] = useState<CustomCatalogProduct[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newStock, setNewStock] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Разделы (categories) state
  const [categories, setCategories] = useState<StorefrontCategory[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  // Оформление (appearance) state -- independent save action from the
  // slug/publish one above.
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [deliveryInfo, setDeliveryInfo] = useState('')
  const [chatWidgetEnabled, setChatWidgetEnabled] = useState(false)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [appearanceError, setAppearanceError] = useState('')
  const [appearanceSaved, setAppearanceSaved] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const load = useCallback(async () => {
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/storefront', { headers })
    if (res.status === 404) { setNoConnection(true); setLoading(false); return }
    if (res.ok) {
      const data = await res.json()
      setSettings(data)
      setSlugInput(data.slug || '')
      setBackgroundColor(data.backgroundColor || null)
      setDeliveryInfo(data.deliveryInfo || '')
      setChatWidgetEnabled(!!data.chatWidgetEnabled)
    }
    setLoading(false)
  }, [])

  async function saveAppearance() {
    setAppearanceError('')
    setAppearanceSaved(false)
    setAppearanceSaving(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/appearance', {
        method: 'POST', headers, body: JSON.stringify({ backgroundColor, deliveryInfo, chatWidgetEnabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAppearanceError(data.error === 'widget_not_connected' ? 'Сначала подключите канал сайта в AI-агенте' : 'Не удалось сохранить')
        return
      }
      setAppearanceSaved(true)
      setTimeout(() => setAppearanceSaved(false), 2000)
    } catch {
      setAppearanceError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setAppearanceSaving(false)
    }
  }

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true)
    setCatalogError('')
    try {
      const headers = await authHeader()
      const [catalogRes, categoriesRes] = await Promise.all([
        fetch('/api/kaspi-shop/storefront/catalog', { headers }),
        fetch('/api/kaspi-shop/storefront/categories', { headers }),
      ])
      const data = await catalogRes.json().catch(() => null)
      if (!catalogRes.ok) { setCatalogError(data?.error || 'Не удалось загрузить каталог'); return }
      setKaspiProducts(data.kaspiProducts || [])
      setCustomProducts(data.customProducts || [])
      const categoriesData = await categoriesRes.json().catch(() => null)
      if (categoriesRes.ok) setCategories(categoriesData.categories || [])
    } catch {
      setCatalogError('Не удалось загрузить каталог. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Same admin-only gate as every other kaspi-shop/* page (audit finding,
      // 2026-09-02) -- this page and storefront-orders were the only two
      // missing it, so any authenticated invoices.kz user could reach a
      // founder-only-until-reviewed feature by typing the URL directly.
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
      await load()
    }
    init()
  }, [router, load])

  useEffect(() => {
    if (tab === 'catalog' && !loading) loadCatalog()
  }, [tab, loading, loadCatalog])

  async function save(published: boolean) {
    setError(null)
    setSaving(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront', {
        method: 'POST', headers, body: JSON.stringify({ slug: slugInput, published }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(
          data.error === 'slug_taken' ? 'Такая ссылка уже занята, выберите другую'
          : data.error === 'invalid_slug' ? 'Ссылка может содержать только латинские буквы, цифры и дефис'
          : data.error === 'cashier_not_connected' ? 'Сначала подключите Kaspi Pay Кассир'
          : 'Не удалось сохранить'
        )
        return
      }
      await load()
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  function copyLink() {
    if (!settings?.slug) return
    navigator.clipboard.writeText(`${window.location.origin}/shop/${settings.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function toggleKaspiVisibility(product: KaspiCatalogProduct) {
    setTogglingId(product.id)
    setCatalogError('')
    const nextShow = !product.showOnStorefront
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/catalog/kaspi-visibility', {
        method: 'POST', headers, body: JSON.stringify({ trackedProductId: product.id, show: nextShow }),
      })
      if (!res.ok) { setCatalogError('Не удалось обновить товар'); return }
      setKaspiProducts(prev => prev.map(p => p.id === product.id ? { ...p, showOnStorefront: nextShow } : p))
      if (settings) setSettings({ ...settings, visibleProductCount: settings.visibleProductCount + (nextShow ? 1 : -1) })
    } catch {
      setCatalogError('Не удалось обновить товар. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setTogglingId(null)
    }
  }

  async function createProduct() {
    setCreateError('')
    const price = Number(newPrice)
    if (!newName.trim()) { setCreateError('Укажите название'); return }
    if (!Number.isFinite(price) || price <= 0) { setCreateError('Укажите цену'); return }
    setCreating(true)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/catalog', {
        method: 'POST', headers,
        body: JSON.stringify({
          name: newName.trim(), price,
          imageUrl: newImageUrl.trim() || null,
          stockCount: newStock.trim() ? Number(newStock) : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateError(data.error || 'Не удалось добавить товар'); return }
      setCustomProducts(prev => [data.product, ...prev])
      setNewName(''); setNewPrice(''); setNewImageUrl(''); setNewStock('')
    } catch {
      setCreateError('Не удалось добавить товар. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteProduct(id: string) {
    setDeletingId(id)
    setCatalogError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/catalog/custom', {
        method: 'DELETE', headers, body: JSON.stringify({ id }),
      })
      if (!res.ok) { setCatalogError('Не удалось удалить товар'); return }
      setCustomProducts(prev => prev.filter(p => p.id !== id))
    } catch {
      setCatalogError('Не удалось удалить товар. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setDeletingId(null)
    }
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return
    setCreatingCategory(true)
    setCatalogError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/categories', {
        method: 'POST', headers, body: JSON.stringify({ name: newCategoryName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setCatalogError(data.error || 'Не удалось добавить раздел'); return }
      setCategories(prev => [...prev, data.category])
      setNewCategoryName('')
    } catch {
      setCatalogError('Не удалось добавить раздел. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setCreatingCategory(false)
    }
  }

  async function deleteCategory(id: string) {
    setDeletingCategoryId(id)
    setCatalogError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/categories', {
        method: 'DELETE', headers, body: JSON.stringify({ id }),
      })
      if (!res.ok) { setCatalogError('Не удалось удалить раздел'); return }
      setCategories(prev => prev.filter(c => c.id !== id))
      // Products in the deleted category fall back to "Без раздела" -- the DB
      // FK is ON DELETE SET NULL, so this just mirrors that server-side effect.
      setKaspiProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: null } : p))
      setCustomProducts(prev => prev.map(p => p.categoryId === id ? { ...p, categoryId: null } : p))
    } catch {
      setCatalogError('Не удалось удалить раздел. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setDeletingCategoryId(null)
    }
  }

  async function assignCategory(productId: string, source: 'kaspi' | 'custom', categoryId: string | null) {
    setAssigningId(productId)
    setCatalogError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/catalog/category', {
        method: 'POST', headers, body: JSON.stringify({ productId, source, categoryId }),
      })
      if (!res.ok) { setCatalogError('Не удалось изменить раздел товара'); return }
      if (source === 'kaspi') setKaspiProducts(prev => prev.map(p => p.id === productId ? { ...p, categoryId } : p))
      else setCustomProducts(prev => prev.map(p => p.id === productId ? { ...p, categoryId } : p))
    } catch {
      setCatalogError('Не удалось изменить раздел товара. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setAssigningId(null)
    }
  }

  if (loading) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>
    </main>
    </DesktopShell>
  )

  if (noConnection) return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="p-8 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Сначала подключите магазин Kaspi Shop</div>
    </main>
    </DesktopShell>
  )

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
      <SiteNav />
      <div className="max-w-3xl mx-auto p-4 lg:p-6 pb-6">
        <motion.div
          className="mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--nav-text-primary)' }}>Витрина</h1>
          <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>Публичная страница с вашими товарами — делитесь ссылкой в Instagram/WhatsApp</p>
        </motion.div>

        <div className="flex items-center gap-1 flex-wrap nav-glass rounded-full p-1 w-fit mb-4">
          {([['settings', 'Настройки'], ['catalog', 'Каталог']] as const).map(([value, label]) => {
            const active = tab === value
            return (
              <button key={value} onClick={() => setTab(value)}
                className="relative text-sm font-medium rounded-full px-4 py-1.5 transition-colors"
                style={{ color: active ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)' }}>
                {active && (
                  <motion.span layoutId="storefrontTabPill" className="absolute inset-0 rounded-full" style={{ background: 'var(--nav-accent)', zIndex: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }} />
                )}
                <span className="relative" style={{ zIndex: 1 }}>{label}</span>
              </button>
            )
          })}
        </div>

        {tab === 'settings' && (
          <>
            {!settings?.cashierConnected ? (
              <div className="nav-glass rounded-2xl p-5 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                Для приёма оплаты на витрине нужен подключённый Kaspi Pay Кассир.{' '}
                <a href="/kaspi-api" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Подключить →</a>
              </div>
            ) : (
              <div className="nav-glass rounded-2xl p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Ссылка витрины</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>invoices.kz/shop/</span>
                    <input value={slugInput} onChange={e => setSlugInput(e.target.value.toLowerCase())}
                      placeholder="my-store"
                      className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  </div>
                </div>

                {error && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

                <div className="flex items-center gap-3">
                  <button onClick={() => save(!settings.published)} disabled={saving || !slugInput.trim()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ background: settings.published ? 'var(--nav-critical)' : 'var(--nav-accent)', color: '#fff' }}>
                    {settings.published ? 'Снять с публикации' : 'Опубликовать'}
                  </button>
                  {settings.published && settings.slug && (
                    <button onClick={copyLink} className="text-xs font-semibold nav-glass rounded-lg px-3 py-2" style={{ color: 'var(--nav-accent)' }}>
                      {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {settings?.cashierConnected && (
              <div className="nav-glass rounded-2xl p-5 mt-4">
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
                  На витрине сейчас: {settings.visibleProductCount} {settings.visibleProductCount === 1 ? 'товар' : 'товаров'}
                </div>
                <p className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                  На витрине показываются только товары, которые вы включили во вкладке «Каталог» — плюс любые добавленные вручную. Товар из Kaspi пропадает оттуда, если вы снимете его с продажи или остаток закончится.{' '}
                  <button onClick={() => setTab('catalog')} className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Открыть каталог →</button>
                </p>
              </div>
            )}

            <div className="nav-glass rounded-2xl p-5 mt-4 space-y-4">
              <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>Оформление</div>

              <div>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--nav-text-muted)' }}>Фон страницы</label>
                <div className="flex items-center gap-2">
                  {BACKGROUND_PRESETS.map(color => (
                    <button key={color} onClick={() => setBackgroundColor(color)} aria-label={`Фон ${color}`}
                      className="w-11 h-11 flex items-center justify-center rounded-full flex-shrink-0">
                      <span className="w-8 h-8 rounded-full border block"
                        style={{ background: color, borderColor: backgroundColor === color ? 'var(--nav-accent)' : 'var(--nav-border)', borderWidth: backgroundColor === color ? 2 : 1 }} />
                    </button>
                  ))}
                  <button onClick={() => setBackgroundColor(null)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full nav-glass"
                    style={{ color: backgroundColor === null ? 'var(--nav-accent)' : 'var(--nav-text-muted)' }}>
                    По умолчанию
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Доставка (описание и стоимость)</label>
                <textarea value={deliveryInfo} onChange={e => setDeliveryInfo(e.target.value)} rows={3}
                  placeholder="Например: доставка по Алматы — 1 500 ₸, по Казахстану — Kaspi Почтой"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] resize-none"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Чат-бот на витрине</label>
                {settings?.hasWebsiteWidget ? (
                  <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                    <input type="checkbox" checked={chatWidgetEnabled} onChange={e => setChatWidgetEnabled(e.target.checked)} />
                    Показывать чат с AI-агентом на витрине
                  </label>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                    Сначала подключите канал «Сайт» в AI-агенте.{' '}
                    <a href="/ai-agent/settings" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Настроить →</a>
                  </p>
                )}
              </div>

              {appearanceError && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{appearanceError}</div>}
              <button onClick={saveAppearance} disabled={appearanceSaving}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {appearanceSaving ? 'Сохраняем…' : appearanceSaved ? 'Сохранено ✓' : 'Сохранить оформление'}
              </button>
            </div>
          </>
        )}

        {tab === 'catalog' && (
          <div className="space-y-6">
            {catalogError && (
              <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{catalogError}</span>
                <button onClick={loadCatalog} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
              </div>
            )}

            <div>
              <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--nav-text-primary)' }}>Разделы</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>Группируйте товары по разделам — на витрине они покажутся отдельными блоками.</p>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {categories.map(c => (
                    <div key={c.id} className="nav-glass rounded-full pl-3 pr-1.5 py-1 flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{c.name}</span>
                      <button onClick={() => deleteCategory(c.id)} disabled={deletingCategoryId === c.id}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-xs disabled:opacity-50"
                        style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-muted)' }}
                        aria-label={`Удалить раздел ${c.name}`}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mb-6">
                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createCategory() }}
                  placeholder="Новый раздел, например «Футболки»"
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                <button onClick={createCategory} disabled={creatingCategory || !newCategoryName.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex-shrink-0"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {creatingCategory ? '…' : 'Добавить'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--nav-critical)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>Товары из Kaspi</h2>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>Включите нужные товары — они появятся на витрине с красной рамкой ниже.</p>
              {catalogLoading ? (
                <div className="nav-glass rounded-2xl p-6 text-center text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загружаем…</div>
              ) : kaspiProducts.length === 0 ? (
                <div className="nav-glass rounded-2xl p-6 text-center text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                  Нет товаров в продаже. Проверьте <a href="/kaspi-shop/removed" className="font-semibold" style={{ color: 'var(--nav-accent)' }}>Управление товарами</a>.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {kaspiProducts.map(p => (
                    <div key={p.id} className="nav-glass rounded-xl overflow-hidden"
                      style={p.showOnStorefront ? { boxShadow: '0 0 0 2px var(--nav-critical)' } : undefined}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="p-2">
                        <div className="text-[11px] font-semibold line-clamp-2 min-h-[2em]" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                        <div className="font-mono font-bold text-xs mt-0.5" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.price)}</div>
                        {categories.length > 0 && (
                          <select value={p.categoryId || ''} disabled={assigningId === p.id}
                            onChange={e => assignCategory(p.id, 'kaspi', e.target.value || null)}
                            className="w-full mt-1.5 rounded-lg py-1 px-1.5 text-[11px] outline-none border border-[color:var(--nav-border)] disabled:opacity-50"
                            style={{ color: 'var(--nav-text-secondary)', background: 'var(--nav-bg)' }}>
                            <option value="">Без раздела</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <button onClick={() => toggleKaspiVisibility(p)} disabled={togglingId === p.id}
                          className="w-full mt-1.5 rounded-lg py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: p.showOnStorefront ? 'var(--nav-critical)' : 'var(--nav-accent)', color: '#fff' }}>
                          {togglingId === p.id ? '…' : p.showOnStorefront ? 'Убрать с витрины' : 'Показать на витрине'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--nav-teal)' }} />
                <h2 className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>Свои товары</h2>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>Товары, не связанные с Kaspi — всегда показываются на витрине с синей рамкой.</p>

              {customProducts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
                  {customProducts.map(p => (
                    <div key={p.id} className="nav-glass rounded-xl overflow-hidden" style={{ boxShadow: '0 0 0 2px var(--nav-teal)' }}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full aspect-square object-cover" style={{ background: 'var(--nav-bg)' }} />
                      ) : (
                        <div className="w-full aspect-square" style={{ background: 'var(--nav-bg)' }} />
                      )}
                      <div className="p-2">
                        <div className="text-[11px] font-semibold line-clamp-2 min-h-[2em]" style={{ color: 'var(--nav-text-primary)' }}>{p.name}</div>
                        <div className="font-mono font-bold text-xs mt-0.5" style={{ color: 'var(--nav-text-primary)' }}>{formatPrice(p.price)}</div>
                        {categories.length > 0 && (
                          <select value={p.categoryId || ''} disabled={assigningId === p.id}
                            onChange={e => assignCategory(p.id, 'custom', e.target.value || null)}
                            className="w-full mt-1.5 rounded-lg py-1 px-1.5 text-[11px] outline-none border border-[color:var(--nav-border)] disabled:opacity-50"
                            style={{ color: 'var(--nav-text-secondary)', background: 'var(--nav-bg)' }}>
                            <option value="">Без раздела</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        <button onClick={() => deleteProduct(p.id)} disabled={deletingId === p.id}
                          className="w-full mt-1.5 rounded-lg py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: 'var(--nav-critical)', color: '#fff' }}>
                          {deletingId === p.id ? '…' : 'Удалить'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="nav-glass rounded-2xl p-4 space-y-2">
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>+ Добавить товар</div>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                <div className="flex gap-2">
                  <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Цена, ₸" inputMode="numeric"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                  <input value={newStock} onChange={e => setNewStock(e.target.value)} placeholder="Остаток (необязательно)" inputMode="numeric"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                    style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                </div>
                <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Ссылка на фото (необязательно)"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]"
                  style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
                {createError && <div className="text-xs" style={{ color: 'var(--nav-critical)' }}>{createError}</div>}
                <button onClick={createProduct} disabled={creating}
                  className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {creating ? 'Добавляем…' : 'Добавить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
    </DesktopShell>
  )
}
