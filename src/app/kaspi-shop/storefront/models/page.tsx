'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { getActivePlan } from '@/lib/plan'
import BrandLoader from '@/components/BrandLoader'
import { usePageDocumentTitle } from '@/lib/usePageDocumentTitle'
import PageHeader from '@/components/PageHeader'
import PageContainer, { PROSE_WIDE_CLS } from '@/components/PageContainer'

type Variant = { id: string; size: string; color: string; stockCount: number | null }
type Model = { id: string; name: string; price: number; imageUrl: string | null; categoryId: string | null; variants: Variant[] }
type Category = { id: string; name: string; sortOrder: number }

function formatPrice(price: number): string {
  return new Intl.NumberFormat('ru-KZ').format(price) + ' ₸'
}

// Коды ошибок API -> человеческий текст (как на странице витрины).
function humanError(code: unknown, fallback: string): string {
  if (code === 'no_connection') return 'Сначала подключите магазин Kaspi Shop'
  return typeof code === 'string' && code ? code : fallback
}

export default function WholesaleModelsPage() {
  // Заголовок вкладки и на время загрузки (PageHeader ещё не отрисован); строка та же, что ставит PageHeader.
  usePageDocumentTitle('Модели (оптовый каталог)')
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [models, setModels] = useState<Model[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [creating, setCreating] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [variantSize, setVariantSize] = useState('')
  const [variantColor, setVariantColor] = useState('')
  const [variantStock, setVariantStock] = useState('')
  const [addingVariant, setAddingVariant] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  const load = useCallback(async () => {
    setError('')
    try {
      const headers = await authHeader()
      const [modelsRes, categoriesRes] = await Promise.all([
        fetch('/api/kaspi-shop/storefront/models', { headers }),
        fetch('/api/kaspi-shop/storefront/categories', { headers }),
      ])
      const modelsData = await modelsRes.json().catch(() => null)
      if (!modelsRes.ok) { setError(humanError(modelsData?.error, 'Не удалось загрузить модели')); return }
      setModels(modelsData.models || [])
      const categoriesData = await categoriesRes.json().catch(() => null)
      if (categoriesRes.ok) setCategories(categoriesData.categories || [])
    } catch {
      setError('Не удалось загрузить модели. Проверьте соединение и попробуйте ещё раз.')
    }
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
      if (!profile?.is_admin && !getActivePlan(profile).canKaspiShop) { router.push('/upgrade'); return }
      const { data: { session } } = await supabase.auth.getSession()
      const connRes = await fetch('/api/kaspi-shop/wallet', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const connData = await connRes.json().catch(() => null)
      if (!connData?.connected || connData?.sessionStatus === 'session_expired') { router.push('/kaspi-shop'); return }
      await load()
      setLoading(false)
    }
    init()
  }, [router, load])

  async function createModel() {
    const price = Number(newPrice)
    if (!newName.trim()) { setError('Укажите название'); return }
    if (!Number.isFinite(price) || price <= 0) { setError('Укажите цену'); return }
    setCreating(true)
    setError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/storefront/models', {
        method: 'POST', headers,
        body: JSON.stringify({ name: newName.trim(), price, imageUrl: newImageUrl.trim() || null, categoryId: newCategoryId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(humanError(data.error, 'Не удалось создать модель')); return }
      setNewName(''); setNewPrice(''); setNewImageUrl(''); setNewCategoryId('')
      await load()
    } catch {
      setError('Не удалось создать модель. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteModel(id: string) {
    if (!confirm('Удалить модель и все её варианты размер/цвет?')) return
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${id}`, { method: 'DELETE', headers })
      await load()
    } catch {
      setError('Не удалось удалить модель.')
    }
  }

  async function addVariant(modelId: string) {
    if (!variantSize.trim() || !variantColor.trim()) { setError('Укажите размер и цвет'); return }
    setAddingVariant(true)
    setError('')
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants`, {
        method: 'POST', headers,
        body: JSON.stringify({ size: variantSize.trim(), color: variantColor.trim(), stockCount: variantStock === '' ? null : Number(variantStock) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(humanError(data.error, 'Не удалось добавить вариант')); return }
      setVariantSize(''); setVariantColor(''); setVariantStock('')
      await load()
    } catch {
      setError('Не удалось добавить вариант. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setAddingVariant(false)
    }
  }

  async function deleteVariant(modelId: string, variantId: string) {
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants/${variantId}`, { method: 'DELETE', headers })
      await load()
    } catch {
      setError('Не удалось удалить вариант.')
    }
  }

  async function updateVariantStock(modelId: string, variantId: string, stockCount: number | null) {
    try {
      const headers = await authHeader()
      await fetch(`/api/kaspi-shop/storefront/models/${modelId}/variants/${variantId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ stockCount }),
      })
      await load()
    } catch {
      setError('Не удалось обновить остаток.')
    }
  }

  if (loading) return <BrandLoader />

  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <SiteNav />
        <PageContainer variant="full" className="flex-1 min-w-0 pb-6">
          <PageHeader
            title="Модели (оптовый каталог)"
            subtitle="Отдельный каталог для публичной витрины, не связан с товарами Kaspi"
            backHref="/kaspi-shop/storefront"
          />

          <div className="nav-glass rounded-2xl p-4 mb-4 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
            <p className={PROSE_WIDE_CLS}>У каждой модели своя цена и сетка размер × цвет с остатком. Если остаток 0 или не указан, покупатель видит кнопку «Оформить пошив на заказ».</p>
          </div>

          {error && <div className="nav-glass rounded-2xl p-3 mb-4 text-sm" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

          {/* xl+: список моделей слева, форма «Новая модель» липкой колонкой справа (380px).
              В DOM форма первая, поэтому на узком экране порядок прежний. */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
          <div className="nav-glass rounded-2xl p-4 space-y-2 xl:col-start-2 xl:row-start-1 xl:sticky xl:top-4">
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Новая модель</div>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название (напр. «Лонгслив однотонный Long01»)"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="Цена, ₸" type="number"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Ссылка на фото"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }} />
            <select value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-bg)' }}>
              <option value="">Без раздела</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={createModel} disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              {creating ? 'Создаём…' : 'Добавить модель'}
            </button>
          </div>

          <div className="space-y-3 min-w-0 xl:col-start-1 xl:row-start-1">
            {models.map(m => (
              <div key={m.id} className="nav-glass rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {m.imageUrl ? (
                      <img src={m.imageUrl} alt={m.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                    ) : (
                      <div className="w-12 h-12 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-bg)' }} />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{m.name}</div>
                      <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{formatPrice(m.price)} · {m.variants.length} вариантов</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setExpandedId(expandedId === m.id ? null : m.id)} className="text-xs font-medium rounded-lg px-3 py-1.5 nav-glass" style={{ color: 'var(--nav-text-primary)' }}>
                      {expandedId === m.id ? 'Скрыть варианты' : 'Варианты'}
                    </button>
                    <button onClick={() => deleteModel(m.id)} className="text-xs font-medium rounded-lg px-3 py-1.5" style={{ color: 'var(--nav-critical)' }}>Удалить</button>
                  </div>
                </div>

                {expandedId === m.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--nav-border)' }}>
                    <table className="w-full text-sm mb-3">
                      <thead>
                        <tr style={{ color: 'var(--nav-text-muted)' }}>
                          <th className="text-left font-medium pb-2">Размер</th>
                          <th className="text-left font-medium pb-2">Цвет</th>
                          <th className="text-left font-medium pb-2">Остаток</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.variants.map(v => (
                          <tr key={v.id} style={{ color: 'var(--nav-text-primary)' }}>
                            <td className="py-1">{v.size}</td>
                            <td className="py-1">{v.color}</td>
                            <td className="py-1">
                              <input
                                type="number"
                                defaultValue={v.stockCount ?? ''}
                                placeholder="пошив"
                                onBlur={e => updateVariantStock(m.id, v.id, e.target.value === '' ? null : Number(e.target.value))}
                                className="w-20 rounded px-2 py-1 text-xs outline-none border border-[color:var(--nav-border)]"
                                style={{ background: 'var(--nav-bg)' }}
                              />
                            </td>
                            <td className="py-1 text-right">
                              <button onClick={() => deleteVariant(m.id, v.id)} className="text-xs" style={{ color: 'var(--nav-critical)' }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex flex-wrap gap-2">
                      <input value={variantSize} onChange={e => setVariantSize(e.target.value)} placeholder="Размер (M, 56-60...)"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-28" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <input value={variantColor} onChange={e => setVariantColor(e.target.value)} placeholder="Цвет"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-28" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <input value={variantStock} onChange={e => setVariantStock(e.target.value)} placeholder="Остаток (пусто = пошив)" type="number"
                        className="rounded-lg px-2 py-1.5 text-xs outline-none border border-[color:var(--nav-border)] w-40" style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)' }} />
                      <button onClick={() => addVariant(m.id)} disabled={addingVariant}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                        {addingVariant ? 'Добавляем…' : 'Добавить вариант'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {models.length === 0 && (
              <div className="text-sm text-center py-8" style={{ color: 'var(--nav-text-muted)' }}>Пока нет ни одной модели</div>
            )}
          </div>
          </div>
        </PageContainer>
      </main>
    </DesktopShell>
  )
}
