'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { extractAttributes } from '@/lib/kaspiShop/salesAnalytics'

const EASE = [0.16, 1, 0.3, 1] as const

type OfferPoint = { storeCode: string; cityName: string | null; stockCount: number | null }

type Offer = {
  sku: string
  masterSku: string | null
  title: string
  brandName: string | null
  minPrice: number
  points: OfferPoint[]
}

type Tab = 'active' | 'removed'

// Per-row lifecycle: idle -> busy (request in flight) -> sent (Kaspi
// accepted, processes asynchronously -- the cabinet's own UI shows the same
// «В обработке» state, usually done within the hour).
type RowState = 'idle' | 'busy' | 'sent'

function RestoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10 5v14M15 5v14" />
    </svg>
  )
}

type StockEntry = {
  storeCode: string
  cityId: string | null
  cityName: string | null
  price: number | null
  stockCount: number | null
  available: string | null
}

type StockModalState = {
  offer: Offer
  loading: boolean
  error: string
  masterSku: string | null
  model: string
  entries: StockEntry[]
  edits: Record<string, { price: string; stockCount: string }>
  saving: boolean
  saved: boolean
}

type CatalogProduct = {
  id: string
  title: string
  categoryName: string | null
  imageUrl: string | null
  shopLink: string | null
}

type AddCity = { cityId: string; cityName: string; points: { storeCode: string; displayName: string }[] }

// «Добавить товар → Создать новую карточку»: category tree -> brand -> photo
// -> dynamic attribute form (schema-driven, generic across every Kaspi
// category) -> price/stock -> submit to Kaspi moderation. See
// docs/superpowers/specs/2026-08-27-kaspi-add-product-phase2-design.md.
type NewCardCategory = { code: string; name: string; hasChildren: boolean; closed: boolean; imageUrl: string | null }
type NewCardBrandOpt = { code: string; name: string; restricted: boolean }
type AttributeOptionUI = { code: string; name: string }
type AttributeFieldUI = { name: string; attributeCode: string; mandatory: boolean; type: string; multiValued: boolean; options: AttributeOptionUI[] }
type ClassificationGroupUI = { code: string; name: string; features: AttributeFieldUI[] }

type NewCardModalState = {
  step: 'category' | 'brand' | 'photo' | 'attributes'
  breadcrumb: { code: string; name: string }[]
  categories: NewCardCategory[]
  categoriesLoading: boolean
  selectedCategoryCode: string | null
  selectedCategoryName: string | null
  brandQuery: string
  brands: NewCardBrandOpt[]
  brandsLoading: boolean
  selectedBrand: { code: string; name: string } | null
  photoPreviewUrl: string | null
  photoUploading: boolean
  imageId: string | null
  imageUrls: { large: string; medium: string; small: string } | null
  youtubeLink: string
  schema: ClassificationGroupUI[]
  schemaLoading: boolean
  suggestedSku: string
  attributeValues: Record<string, string[]>
  cities: AddCity[]
  priceEdits: Record<string, { price: string; stocks: Record<string, string> }>
  error: string
  saving: boolean
  saved: boolean
}

// Add-product wizard, mirroring the cabinet's «Присоединиться к существующей
// карточке» flow: search step -> price/stock step -> async success.
type AddModalState = {
  step: 'search' | 'form'
  query: string
  searching: boolean
  results: CatalogProduct[]
  total: number
  selected: CatalogProduct | null
  infoLoading: boolean
  suggestedSku: string
  lowestPrice: number | null
  cities: AddCity[]
  edits: Record<string, { price: string; stocks: Record<string, string> }>
  error: string
  saving: boolean
  saved: boolean
}

export default function KaspiShopProductAvailability() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [active, setActive] = useState<Offer[]>([])
  const [removed, setRemoved] = useState<Offer[]>([])
  // «В продаже» first (founder request) -- these are the products being
  // worked with; load() flips to the removed tab only when there is
  // nothing on sale at all.
  const [tab, setTab] = useState<Tab>('active')
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [stockModal, setStockModal] = useState<StockModalState | null>(null)
  const [search, setSearch] = useState('')
  const [addModal, setAddModal] = useState<AddModalState | null>(null)
  const [newCardModal, setNewCardModal] = useState<NewCardModalState | null>(null)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    setLoadError('')
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/removed-products', { headers })
      const data = await res.json()
      if (!res.ok) {
        setLoadError(data.error || 'Не удалось загрузить товары')
      } else {
        setActive(data.active || [])
        setRemoved(data.removed || [])
        if ((data.active || []).length === 0 && (data.removed || []).length > 0) setTab('removed')
      }
    } catch {
      setLoadError('Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  async function openStockModal(offer: Offer) {
    setStockModal({ offer, loading: true, error: '', masterSku: null, model: '', entries: [], edits: {}, saving: false, saved: false })
    const headers = await authHeader()
    const res = await fetch(`/api/kaspi-shop/offer-stocks?sku=${encodeURIComponent(offer.sku)}`, { headers })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setStockModal(prev => prev ? { ...prev, loading: false, error: data.error || 'Не удалось загрузить данные точек' } : prev)
      return
    }
    const entries: StockEntry[] = data.entries || []
    const edits: Record<string, { price: string; stockCount: string }> = {}
    for (const e of entries) {
      edits[e.storeCode] = {
        price: e.price !== null ? String(e.price) : (data.minPrice !== null ? String(data.minPrice) : ''),
        stockCount: e.stockCount !== null ? String(e.stockCount) : '',
      }
    }
    setStockModal(prev => prev ? {
      ...prev, loading: false,
      masterSku: data.masterSku ?? null,
      model: data.model || offer.title,
      entries, edits,
    } : prev)
  }

  async function saveStockModal() {
    if (!stockModal || stockModal.saving) return
    const payloadEntries = stockModal.entries
      .filter(e => e.cityId)
      .map(e => ({
        storeCode: e.storeCode,
        cityId: e.cityId,
        price: Number(stockModal.edits[e.storeCode]?.price),
        stockCount: stockModal.edits[e.storeCode]?.stockCount.trim() === '' ? null : Number(stockModal.edits[e.storeCode]?.stockCount),
      }))
      .filter(e => Number.isFinite(e.price) && e.price > 0)
    if (payloadEntries.length === 0) {
      setStockModal(prev => prev ? { ...prev, error: 'Нет точек с городом и ценой — сохранять нечего.' } : prev)
      return
    }
    setStockModal(prev => prev ? { ...prev, saving: true, error: '' } : prev)
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/offer-stocks', {
      method: 'POST', headers,
      body: JSON.stringify({ sku: stockModal.offer.sku, masterSku: stockModal.masterSku, model: stockModal.model, entries: payloadEntries }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      const failMsg = (data.results || []).filter((r: any) => !r.ok).map((r: any) => `${r.storeCode}: ${r.message}`).join('; ')
      setStockModal(prev => prev ? { ...prev, saving: false, error: data.error || failMsg || 'Не удалось сохранить' } : prev)
      return
    }
    setStockModal(prev => prev ? { ...prev, saving: false, saved: true } : prev)
    // Auto-close shortly after the success notice (founder request) --
    // unless the user already started editing again (any input resets
    // `saved`), in which case the modal stays put.
    setTimeout(() => {
      setStockModal(prev => (prev && prev.saved && !prev.saving ? null : prev))
    }, 2000)
  }

  function openAddModal() {
    setAddModal({
      step: 'search', query: '', searching: false, results: [], total: 0,
      selected: null, infoLoading: false, suggestedSku: '', lowestPrice: null,
      cities: [], edits: {}, error: '', saving: false, saved: false,
    })
  }

  async function runAddSearch() {
    if (!addModal || !addModal.query.trim() || addModal.searching) return
    setAddModal(prev => prev ? { ...prev, searching: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/products/search?text=${encodeURIComponent(addModal.query.trim())}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddModal(prev => prev ? { ...prev, searching: false, error: data.error || 'Не удалось выполнить поиск' } : prev)
        return
      }
      setAddModal(prev => prev ? { ...prev, searching: false, results: data.products || [], total: data.total || 0 } : prev)
    } catch {
      setAddModal(prev => prev ? { ...prev, searching: false, error: 'Не удалось выполнить поиск. Проверьте соединение.' } : prev)
    }
  }

  async function selectAddProduct(product: CatalogProduct) {
    setAddModal(prev => prev ? { ...prev, step: 'form', selected: product, infoLoading: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/products/add-info?code=${encodeURIComponent(product.id)}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddModal(prev => prev ? { ...prev, infoLoading: false, error: data.error || 'Не удалось загрузить данные для добавления' } : prev)
        return
      }
      const cities: AddCity[] = data.cities || []
      const edits: AddModalState['edits'] = {}
      for (const c of cities) edits[c.cityId] = { price: '', stocks: {} }
      setAddModal(prev => prev ? {
        ...prev, infoLoading: false,
        suggestedSku: data.suggestedSku || '',
        lowestPrice: data.lowestPrice ?? null,
        cities, edits,
      } : prev)
    } catch {
      setAddModal(prev => prev ? { ...prev, infoLoading: false, error: 'Не удалось загрузить данные. Проверьте соединение.' } : prev)
    }
  }

  async function submitAdd() {
    if (!addModal || !addModal.selected || addModal.saving) return
    const entries = addModal.cities
      .map(c => {
        const price = Number(addModal.edits[c.cityId]?.price)
        if (!Number.isFinite(price) || price <= 0) return null
        return {
          cityId: c.cityId,
          price,
          points: c.points.map(p => ({
            storeCode: p.storeCode,
            stockCount: addModal.edits[c.cityId]?.stocks[p.storeCode]?.trim() ? Number(addModal.edits[c.cityId].stocks[p.storeCode]) : null,
          })),
        }
      })
      .filter(Boolean)
    if (entries.length === 0) {
      setAddModal(prev => prev ? { ...prev, error: 'Укажите цену хотя бы для одного города.' } : prev)
      return
    }
    setAddModal(prev => prev ? { ...prev, saving: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products/add', {
        method: 'POST', headers,
        body: JSON.stringify({
          masterProductCode: addModal.selected.id,
          sku: addModal.suggestedSku,
          model: addModal.selected.title,
          entries,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setAddModal(prev => prev ? { ...prev, saving: false, error: data.error || 'Не удалось добавить товар' } : prev)
        return
      }
      setAddModal(prev => prev ? { ...prev, saving: false, saved: true } : prev)
      // Same auto-close pattern as the stock modal; the fresh offer shows up
      // through the regular list reload once Kaspi processes it.
      setTimeout(() => {
        setAddModal(prev => (prev && prev.saved && !prev.saving ? null : prev))
        load()
      }, 2500)
    } catch {
      setAddModal(prev => prev ? { ...prev, saving: false, error: 'Не удалось добавить товар. Проверьте соединение.' } : prev)
    }
  }

  async function loadCategoryLevel(parentCode: string | null, breadcrumb: { code: string; name: string }[]) {
    setNewCardModal(prev => prev ? { ...prev, categoriesLoading: true, breadcrumb, error: '' } : prev)
    try {
      const headers = await authHeader()
      const url = parentCode
        ? `/api/kaspi-shop/products/new-card/categories?parent=${encodeURIComponent(parentCode)}`
        : '/api/kaspi-shop/products/new-card/categories'
      const res = await fetch(url, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewCardModal(prev => prev ? { ...prev, categoriesLoading: false, error: data.error || 'Не удалось загрузить категории' } : prev)
        return
      }
      setNewCardModal(prev => prev ? { ...prev, categoriesLoading: false, categories: data.categories || [] } : prev)
    } catch {
      setNewCardModal(prev => prev ? { ...prev, categoriesLoading: false, error: 'Не удалось загрузить категории. Проверьте соединение.' } : prev)
    }
  }

  function openNewCardModal() {
    setNewCardModal({
      step: 'category', breadcrumb: [], categories: [], categoriesLoading: true,
      selectedCategoryCode: null, selectedCategoryName: null,
      brandQuery: '', brands: [], brandsLoading: false, selectedBrand: null,
      photoPreviewUrl: null, photoUploading: false, imageId: null, imageUrls: null, youtubeLink: '',
      schema: [], schemaLoading: false, suggestedSku: '', attributeValues: {},
      cities: [], priceEdits: {}, error: '', saving: false, saved: false,
    })
    loadCategoryLevel(null, [])
  }

  async function searchNewCardBrands(categoryCode: string, prefix: string) {
    setNewCardModal(prev => prev ? { ...prev, brandsLoading: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/products/new-card/brands?category=${encodeURIComponent(categoryCode)}&prefix=${encodeURIComponent(prefix)}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewCardModal(prev => prev ? { ...prev, brandsLoading: false, error: data.error || 'Не удалось загрузить бренды' } : prev)
        return
      }
      const brands: NewCardBrandOpt[] = data.brands || []
      setNewCardModal(prev => {
        if (!prev) return prev
        // Pre-select «Без бренда» the first time brands load (empty prefix) --
        // resolved by exact name, never a hardcoded/guessed code. The founder
        // can still pick a real brand afterward.
        const noBrand = brands.find(b => b.name === 'Без бренда') || null
        return { ...prev, brandsLoading: false, brands, selectedBrand: prev.selectedBrand ?? noBrand }
      })
    } catch {
      setNewCardModal(prev => prev ? { ...prev, brandsLoading: false, error: 'Не удалось загрузить бренды. Проверьте соединение.' } : prev)
    }
  }

  function clickCategory(cat: NewCardCategory) {
    if (cat.closed || !newCardModal) return
    if (cat.hasChildren) {
      loadCategoryLevel(cat.code, [...newCardModal.breadcrumb, { code: cat.code, name: cat.name }])
    } else {
      setNewCardModal(prev => prev ? { ...prev, step: 'brand', selectedCategoryCode: cat.code, selectedCategoryName: cat.name } : prev)
      searchNewCardBrands(cat.code, '')
    }
  }

  function categoryBack() {
    if (!newCardModal || newCardModal.breadcrumb.length === 0) return
    const nextCrumb = newCardModal.breadcrumb.slice(0, -1)
    const parent = nextCrumb.length > 0 ? nextCrumb[nextCrumb.length - 1].code : null
    loadCategoryLevel(parent, nextCrumb)
  }

  function selectBrand(b: NewCardBrandOpt) {
    if (b.restricted) return
    setNewCardModal(prev => prev ? { ...prev, selectedBrand: { code: b.code, name: b.name }, step: 'photo' } : prev)
  }

  async function uploadNewCardPhoto(file: File) {
    setNewCardModal(prev => prev ? { ...prev, photoUploading: true, error: '' } : prev)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const form = new FormData()
      form.append('file', file, file.name)
      const res = await fetch('/api/kaspi-shop/products/new-card/photo', {
        method: 'POST',
        // No Content-Type here on purpose -- the browser derives the
        // multipart boundary from the FormData body itself.
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewCardModal(prev => prev ? { ...prev, photoUploading: false, error: data.error || 'Не удалось загрузить фото' } : prev)
        return
      }
      setNewCardModal(prev => prev ? {
        ...prev, photoUploading: false, imageId: data.imageId, imageUrls: data.urls,
        photoPreviewUrl: URL.createObjectURL(file),
      } : prev)
    } catch {
      setNewCardModal(prev => prev ? { ...prev, photoUploading: false, error: 'Не удалось загрузить фото. Проверьте соединение.' } : prev)
    }
  }

  async function proceedToAttributes() {
    if (!newCardModal || !newCardModal.selectedCategoryCode) return
    setNewCardModal(prev => prev ? { ...prev, step: 'attributes', schemaLoading: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/kaspi-shop/products/new-card/attribute-schema?category=${encodeURIComponent(newCardModal.selectedCategoryCode)}`, { headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNewCardModal(prev => prev ? { ...prev, schemaLoading: false, error: data.error || 'Не удалось загрузить характеристики' } : prev)
        return
      }
      const cities: AddCity[] = data.cities || []
      const priceEdits: NewCardModalState['priceEdits'] = {}
      for (const c of cities) priceEdits[c.cityId] = { price: '', stocks: {} }
      setNewCardModal(prev => prev ? {
        ...prev, schemaLoading: false,
        schema: data.classifications || [], suggestedSku: data.suggestedSku || '',
        cities, priceEdits,
      } : prev)
    } catch {
      setNewCardModal(prev => prev ? { ...prev, schemaLoading: false, error: 'Не удалось загрузить характеристики. Проверьте соединение.' } : prev)
    }
  }

  function setAttributeValue(attributeCode: string, values: string[]) {
    setNewCardModal(prev => prev ? { ...prev, saved: false, attributeValues: { ...prev.attributeValues, [attributeCode]: values } } : prev)
  }

  function toggleMultiEnumValue(attributeCode: string, code: string) {
    const current = newCardModal?.attributeValues[attributeCode] || []
    setAttributeValue(attributeCode, current.includes(code) ? current.filter(c => c !== code) : [...current, code])
  }

  function missingMandatoryFields(m: NewCardModalState): string[] {
    return m.schema.flatMap(g => g.features)
      .filter(f => f.mandatory && (m.attributeValues[f.attributeCode] ?? []).length === 0)
      .map(f => f.name)
  }

  async function submitNewCard() {
    if (!newCardModal || newCardModal.saving) return
    if (!newCardModal.selectedCategoryCode || !newCardModal.selectedBrand || !newCardModal.imageId || !newCardModal.imageUrls) return
    if (missingMandatoryFields(newCardModal).length > 0) return
    const entries = newCardModal.cities
      .map(c => {
        const price = Number(newCardModal.priceEdits[c.cityId]?.price)
        if (!Number.isFinite(price) || price <= 0) return null
        return {
          cityId: c.cityId,
          price,
          points: c.points.map(p => ({
            storeCode: p.storeCode,
            stockCount: newCardModal.priceEdits[c.cityId]?.stocks[p.storeCode]?.trim() ? Number(newCardModal.priceEdits[c.cityId].stocks[p.storeCode]) : null,
          })),
        }
      })
      .filter(Boolean)
    setNewCardModal(prev => prev ? { ...prev, saving: true, error: '' } : prev)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/kaspi-shop/products/new-card/create', {
        method: 'POST', headers,
        body: JSON.stringify({
          categoryCode: newCardModal.selectedCategoryCode,
          categoryName: newCardModal.selectedCategoryName,
          brand: newCardModal.selectedBrand,
          sku: newCardModal.suggestedSku,
          attributes: newCardModal.attributeValues,
          imageId: newCardModal.imageId,
          imageUrls: newCardModal.imageUrls,
          youtubeLink: newCardModal.youtubeLink || undefined,
          entries,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setNewCardModal(prev => prev ? { ...prev, saving: false, error: data.error || 'Не удалось создать карточку' } : prev)
        return
      }
      setNewCardModal(prev => prev ? { ...prev, saving: false, saved: true } : prev)
      setTimeout(() => {
        setNewCardModal(prev => (prev && prev.saved && !prev.saving ? null : prev))
        load()
      }, 3000)
    } catch {
      setNewCardModal(prev => prev ? { ...prev, saving: false, error: 'Не удалось создать карточку. Проверьте соединение.' } : prev)
    }
  }

  async function toggle(sku: string, action: 'restore' | 'remove') {
    setRowStates(prev => ({ ...prev, [sku]: 'busy' }))
    setRowErrors(prev => ({ ...prev, [sku]: '' }))
    const headers = await authHeader()
    const res = await fetch('/api/kaspi-shop/removed-products', { method: 'POST', headers, body: JSON.stringify({ sku, action }) })
    const data = await res.json()
    if (!res.ok) {
      setRowStates(prev => ({ ...prev, [sku]: 'idle' }))
      setRowErrors(prev => ({ ...prev, [sku]: data.error || 'Не удалось выполнить операцию' }))
      return
    }
    setRowStates(prev => ({ ...prev, [sku]: 'sent' }))
  }

  if (loading) return <LoadingSpinner />

  const tabOffers = tab === 'removed' ? removed : active
  // Filter above the grid (founder request 2026-08-22): with 500+ removed
  // offers, finding one specific product by scrolling was impractical.
  const query = search.trim().toLowerCase()
  const matchesQuery = (o: Offer) => !query || o.title.toLowerCase().includes(query) || o.sku.toLowerCase().includes(query)
  const offers = tabOffers.filter(matchesQuery)
  // Tab pill counts reflect the active search filter too (founder request
  // 2026-08-22) -- previously always showed the full unfiltered totals even
  // while a query was narrowing the list below them.
  const removedCount = removed.filter(matchesQuery).length
  const activeCount = active.filter(matchesQuery).length

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="flex-1 min-w-0 p-4 lg:p-6 pb-24 lg:pb-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
          className="nav-glass nav-card-accent rounded-[28px] p-6 lg:p-8 mb-4">
          <div className="text-[11px] font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--nav-text-muted)' }}>Kaspi Bot</div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: 'var(--nav-text-primary)' }}>Управление товарами</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--nav-text-secondary)' }}>
            Снимайте товары с продажи и возвращайте обратно — как в кабинете Kaspi, но прямо отсюда. Обе операции Kaspi
            обрабатывает сам, обычно в течение часа. При снятии с продажи правило демпинга для товара автоматически
            выключается, чтобы репрайсер случайно не вернул его в продажу.
          </p>
        </motion.div>

        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-1.5">
            {([['removed', `Сняты с продажи (${removedCount})`], ['active', `В продаже (${activeCount})`]] as [Tab, string][]).map(([key, label]) => {
              const selected = tab === key
              return (
                <button key={key} onClick={() => setTab(key)}
                  className="relative px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors"
                  style={selected
                    ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                    : { color: 'var(--nav-text-secondary)' }}>
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search filter (founder request 2026-08-22) -- with 500+
                removed offers, finding one product by name was impractical. */}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по названию или SKU..."
              className="text-sm rounded-full px-4 py-1.5 outline-none w-full sm:w-64"
              style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border-soft)' }} />
            <button onClick={openAddModal}
              className="text-xs font-semibold rounded-full px-3.5 py-2 transition-transform hover:-translate-y-0.5"
              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
              + Добавить товар
            </button>
            <button onClick={openNewCardModal}
              className="nav-glass text-xs font-semibold rounded-full px-3.5 py-2 transition-transform hover:-translate-y-0.5"
              style={{ color: 'var(--nav-text-primary)' }}>
              + Новая карточка
            </button>
          </div>
        </div>

        {loadError && (
          <div className="nav-glass rounded-2xl p-4 flex items-center justify-between gap-3 mb-4">
            <span className="text-sm" style={{ color: 'var(--nav-critical)' }}>{loadError}</span>
            <button onClick={() => { setLoading(true); load() }} className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>Повторить</button>
          </div>
        )}

        {!loadError && offers.length === 0 && (
          <div className="nav-glass rounded-2xl p-8 text-center">
            <div className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
              {tab === 'removed' ? 'Снятых с продажи товаров нет' : 'Товаров в продаже нет'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
              {tab === 'removed' ? 'Все товары активного магазина сейчас в продаже.' : 'Недавно отправленные товары Kaspi может ещё обрабатывать.'}
            </div>
          </div>
        )}

        {/* Same card grid as the Демпинг page (2026-08-21 founder request)
            -- compact cards, up to 4 per row on wide screens. */}
        <div className="grid lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
          {offers.map((offer, i) => {
            const state = rowStates[offer.sku] || 'idle'
            const error = rowErrors[offer.sku]
            const action = tab === 'removed' ? 'restore' : 'remove'
            // Whole card opens «Цена и остатки» now (founder feedback
            // 2026-08-22: "не могу зайти в карточку и изменить параметры" --
            // only the small text link at the bottom was clickable before).
            const cardOpensStockModal = tab === 'active' && state !== 'sent'
            return (
              <motion.div key={offer.sku}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
                onClick={cardOpensStockModal ? () => openStockModal(offer) : undefined}
                className={`nav-glass rounded-2xl p-4 ${cardOpensStockModal ? 'cursor-pointer transition-transform hover:-translate-y-0.5' : ''}`}>
                <div className="text-sm font-semibold truncate" title={offer.title} style={{ color: 'var(--nav-text-primary)' }}>{offer.title}</div>
                <div className="text-[11px] mb-1.5" style={{ color: 'var(--nav-text-muted)' }}>
                  {offer.brandName ? `${offer.brandName} · ` : ''}{offer.sku}
                </div>
                {/* Цвет/размер (founder request 2026-08-22): извлечены из
                    названия товара, тем же способом, что и ABC-разрезы на
                    Финансах -- Kaspi не отдаёт характеристики отдельно. */}
                {(() => {
                  const { color, size } = extractAttributes(offer.title)
                  if (!color && !size) return null
                  return (
                    <div className="flex items-center gap-1.5 mb-2">
                      {color && (
                        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>{color}</span>
                      )}
                      {size && (
                        <span className="text-[10px] font-medium rounded-full px-2 py-0.5" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>Размер {size}</span>
                      )}
                    </div>
                  )
                })()}
                {/* Город точки + остаток по ней (founder request 2026-08-21);
                    остаток «не указан» = безопасное состояние по формулировке
                    самого Kaspi. */}
                <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
                  {(offer.points || []).length === 0
                    ? 'Все города'
                    : (offer.points || []).map(pt => `${pt.cityName || pt.storeCode}: ${pt.stockCount !== null ? `${pt.stockCount} шт` : 'остаток не указан'}`).join(' · ')}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--nav-text-muted)' }}>Цена</div>
                    <div className="font-mono font-bold text-xl tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>
                      {offer.minPrice.toLocaleString('ru-KZ')} ₸
                    </div>
                  </div>
                  {state === 'sent' ? (
                    <span className="text-[11px] font-semibold rounded-full px-3 py-2 text-center" style={{ background: 'var(--nav-success)', color: '#fff' }}>
                      Kaspi обрабатывает
                    </span>
                  ) : action === 'restore' ? (
                    <button onClick={e => { e.stopPropagation(); toggle(offer.sku, 'restore') }} disabled={state === 'busy'}
                      className="text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      <RestoreIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Вернуть в продажу'}
                    </button>
                  ) : (
                    <button onClick={e => { e.stopPropagation(); toggle(offer.sku, 'remove') }} disabled={state === 'busy'}
                      className="nav-glass text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-1.5 transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                      style={{ color: 'var(--nav-critical)' }}>
                      <PauseIcon />
                      {state === 'busy' ? 'Отправляем…' : 'Снять с продажи'}
                    </button>
                  )}
                </div>
                {cardOpensStockModal && (
                  <div className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--nav-accent)' }}>
                    Цена и остатки →
                  </div>
                )}
                {error && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* «Цена и остатки» -- per-point (склад/город) price+stock editor,
          mirroring the cabinet's own modal; saves go through the captured
          ON_SALE__PRICE_SAVE chain, one save per point. */}
      {stockModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setStockModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-md max-h-[86vh] overflow-y-auto"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>Цена и остатки</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>{stockModal.offer.title}</div>
                </div>
                <button onClick={() => setStockModal(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>
              <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                Как в кабинете Kaspi: цена и остаток по каждой точке. Остаток можно оставить пустым — товар останется в продаже без учёта остатков.
              </p>

              {stockModal.loading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем точки…</div>}

              {!stockModal.loading && stockModal.entries.length === 0 && !stockModal.error && (
                <div className="text-xs py-4" style={{ color: 'var(--nav-text-secondary)' }}>
                  Не удалось распознать точки товара в данных Kaspi — управляйте ценой и остатками пока через кабинет Kaspi.
                </div>
              )}

              {stockModal.entries.map(e => (
                <div key={e.storeCode} className="rounded-xl p-3 mb-2" style={{ background: 'var(--nav-bg)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
                    {e.cityName ? `${e.cityName} · ` : ''}{e.storeCode}
                    {!e.cityId && <span className="font-normal" style={{ color: 'var(--nav-text-muted)' }}> — город не распознан, сохранение недоступно</span>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена, ₸</span>
                      <input type="number" disabled={!e.cityId}
                        className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                        style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                        value={stockModal.edits[e.storeCode]?.price ?? ''}
                        onChange={ev => setStockModal(prev => prev ? { ...prev, saved: false, edits: { ...prev.edits, [e.storeCode]: { ...prev.edits[e.storeCode], price: ev.target.value } } } : prev)} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Остаток, шт</span>
                      <input type="number" placeholder="Не указан" disabled={!e.cityId}
                        className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                        style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                        value={stockModal.edits[e.storeCode]?.stockCount ?? ''}
                        onChange={ev => setStockModal(prev => prev ? { ...prev, saved: false, edits: { ...prev.edits, [e.storeCode]: { ...prev.edits[e.storeCode], stockCount: ev.target.value } } } : prev)} />
                    </label>
                  </div>
                </div>
              ))}

              {stockModal.error && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-critical)' }}>{stockModal.error}</div>}
              {stockModal.saved && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-success)' }}>Отправлено — Kaspi применит изменения в течение часа.</div>}

              {stockModal.entries.some(e => e.cityId) && (
                <button onClick={saveStockModal} disabled={stockModal.saving}
                  className="w-full mt-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {stockModal.saving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* «Добавить товар» -- присоединение к существующей карточке Kaspi:
          поиск по каталогу -> цена и остатки по городам -> Kaspi выставляет
          на продажу асинхронно, как и в кабинете. */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setAddModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-md max-h-[86vh] overflow-y-auto"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>Добавить товар</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>
                    {addModal.step === 'search' ? 'Найдите товар в каталоге Kaspi' : addModal.selected?.title}
                  </div>
                </div>
                <button onClick={() => setAddModal(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>

              {addModal.step === 'search' ? (
                <>
                  <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                    Как в кабинете Kaspi: найдите товар, который уже продаётся на Kaspi.kz, и присоединитесь к его карточке.
                  </p>
                  <div className="flex gap-2 mb-3">
                    <input value={addModal.query}
                      onChange={ev => setAddModal(prev => prev ? { ...prev, query: ev.target.value } : prev)}
                      onKeyDown={ev => { if (ev.key === 'Enter') runAddSearch() }}
                      placeholder="Название или артикул..."
                      className="flex-1 text-sm rounded-lg px-3 py-2 outline-none border"
                      style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                    <button onClick={runAddSearch} disabled={addModal.searching || !addModal.query.trim()}
                      className="text-xs font-semibold rounded-lg px-3.5 disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {addModal.searching ? '...' : 'Найти'}
                    </button>
                  </div>

                  {addModal.error && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{addModal.error}</div>}

                  {addModal.results.map(p => (
                    <button key={p.id} onClick={() => selectAddProduct(p)}
                      className="w-full flex items-center gap-3 rounded-xl p-2.5 mb-2 text-left transition-transform hover:-translate-y-0.5"
                      style={{ background: 'var(--nav-bg)' }}>
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-surface-glass)' }} />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>{p.title}</div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--nav-text-muted)' }}>{p.categoryName || p.id}</div>
                      </div>
                    </button>
                  ))}

                  {!addModal.searching && addModal.results.length === 0 && !addModal.error && addModal.query.trim() && (
                    <div className="text-xs py-2" style={{ color: 'var(--nav-text-secondary)' }}>Нажмите «Найти», чтобы начать поиск.</div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] mb-4" style={{ color: 'var(--nav-text-muted)' }}>
                    Цена и остаток по каждому городу. Остаток можно оставить пустым — Kaspi выставит товар без учёта остатков.
                  </p>

                  {addModal.infoLoading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем точки продаж…</div>}

                  {!addModal.infoLoading && addModal.suggestedSku && (
                    <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                      Артикул: <span className="font-mono">{addModal.suggestedSku}</span>
                      {addModal.lowestPrice !== null && <> · Самая низкая цена на Kaspi: {addModal.lowestPrice.toLocaleString('ru-KZ')} ₸</>}
                    </div>
                  )}

                  {!addModal.infoLoading && addModal.cities.length === 0 && !addModal.error && (
                    <div className="text-xs py-4" style={{ color: 'var(--nav-text-secondary)' }}>
                      Не удалось загрузить точки продаж — добавьте товар пока через кабинет Kaspi.
                    </div>
                  )}

                  {addModal.cities.map(c => (
                    <div key={c.cityId} className="rounded-xl p-3 mb-2" style={{ background: 'var(--nav-bg)' }}>
                      <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{c.cityName}</div>
                      <label className="block mb-2">
                        <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена, ₸</span>
                        <input type="number"
                          className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                          style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                          value={addModal.edits[c.cityId]?.price ?? ''}
                          onChange={ev => setAddModal(prev => prev ? { ...prev, saved: false, edits: { ...prev.edits, [c.cityId]: { ...prev.edits[c.cityId], price: ev.target.value } } } : prev)} />
                      </label>
                      {c.points.map(p => (
                        <label key={p.storeCode} className="block mb-1.5">
                          <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Остаток, {p.displayName}</span>
                          <input type="number" placeholder="Не указан"
                            className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                            style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                            value={addModal.edits[c.cityId]?.stocks[p.storeCode] ?? ''}
                            onChange={ev => setAddModal(prev => prev ? {
                              ...prev, saved: false,
                              edits: { ...prev.edits, [c.cityId]: { ...prev.edits[c.cityId], stocks: { ...prev.edits[c.cityId]?.stocks, [p.storeCode]: ev.target.value } } },
                            } : prev)} />
                        </label>
                      ))}
                    </div>
                  ))}

                  {addModal.error && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-critical)' }}>{addModal.error}</div>}
                  {addModal.saved && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-success)' }}>Отправлено — Kaspi выставит товар на продажу в течение часа.</div>}

                  {!addModal.infoLoading && addModal.cities.length > 0 && (
                    <button onClick={submitAdd} disabled={addModal.saving}
                      className="w-full mt-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {addModal.saving ? 'Добавляем…' : 'Добавить товар'}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* «Добавить товар → Создать новую карточку» -- category tree -> brand
          -> photo -> dynamic attribute form (schema-driven, works for any
          Kaspi category) -> price/stock -> submit to moderation. */}
      {newCardModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-3 bg-black/30" onClick={() => setNewCardModal(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="relative nav-glass rounded-[24px] w-full max-w-lg max-h-[86vh] overflow-y-auto"
            style={{ boxShadow: '0 34px 80px -20px rgba(10,10,15,0.4), var(--nav-card-glow)' }}
            onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[24px]" style={{ background: 'linear-gradient(90deg, var(--nav-accent), var(--nav-teal))' }} />
            <div className="p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold tracking-wider uppercase mb-0.5" style={{ color: 'var(--nav-text-muted)' }}>Новая карточка</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--nav-text-primary)' }}>
                    {newCardModal.step === 'category' && 'Выберите категорию'}
                    {newCardModal.step === 'brand' && 'Выберите бренд'}
                    {newCardModal.step === 'photo' && 'Фото товара'}
                    {newCardModal.step === 'attributes' && 'Характеристики'}
                  </div>
                </div>
                <button onClick={() => setNewCardModal(null)} className="text-lg leading-none flex-shrink-0" style={{ color: 'var(--nav-text-secondary)' }}>✕</button>
              </div>

              {newCardModal.step === 'category' && (
                <>
                  <div className="flex items-center flex-wrap gap-1 mb-3 text-[11px]" style={{ color: 'var(--nav-text-muted)' }}>
                    <button onClick={() => loadCategoryLevel(null, [])} className="hover:underline">Все категории</button>
                    {newCardModal.breadcrumb.map((c, i) => (
                      <span key={c.code} className="flex items-center gap-1">
                        <span>/</span>
                        <button onClick={() => loadCategoryLevel(c.code, newCardModal.breadcrumb.slice(0, i + 1))} className="hover:underline">{c.name}</button>
                      </span>
                    ))}
                  </div>
                  {newCardModal.breadcrumb.length > 0 && (
                    <button onClick={categoryBack} className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-accent)' }}>← Назад</button>
                  )}
                  {newCardModal.categoriesLoading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем категории…</div>}
                  {!newCardModal.categoriesLoading && newCardModal.categories.map(cat => (
                    <button key={cat.code} onClick={() => clickCategory(cat)} disabled={cat.closed}
                      className="w-full flex items-center justify-between gap-3 rounded-xl p-2.5 mb-1.5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      style={{ background: 'var(--nav-bg)' }}>
                      <span className="text-xs font-semibold truncate" style={{ color: 'var(--nav-text-primary)' }}>
                        {cat.name}{cat.closed && ' — категория ограничена'}
                      </span>
                      {cat.hasChildren && <span style={{ color: 'var(--nav-text-muted)' }}>›</span>}
                    </button>
                  ))}
                </>
              )}

              {newCardModal.step === 'brand' && (
                <>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>Категория: {newCardModal.selectedCategoryName}</p>
                  <input value={newCardModal.brandQuery}
                    onChange={ev => {
                      const q = ev.target.value
                      setNewCardModal(prev => prev ? { ...prev, brandQuery: q } : prev)
                      if (newCardModal.selectedCategoryCode) searchNewCardBrands(newCardModal.selectedCategoryCode, q)
                    }}
                    placeholder="Поиск бренда..."
                    className="w-full text-sm rounded-lg px-3 py-2 outline-none border mb-3"
                    style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                  {newCardModal.brandsLoading && <div className="text-xs py-4 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем бренды…</div>}
                  {!newCardModal.brandsLoading && newCardModal.brands.map(b => (
                    <button key={b.code} onClick={() => selectBrand(b)} disabled={b.restricted}
                      className="w-full flex items-center justify-between gap-3 rounded-xl p-2.5 mb-1.5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                      style={{ background: newCardModal.selectedBrand?.code === b.code ? 'var(--nav-accent)' : 'var(--nav-bg)' }}>
                      <span className="text-xs font-semibold truncate" style={{ color: newCardModal.selectedBrand?.code === b.code ? 'var(--nav-accent-ink)' : 'var(--nav-text-primary)' }}>
                        {b.name}{b.restricted && ' — бренд ограничен'}
                      </span>
                    </button>
                  ))}
                </>
              )}

              {newCardModal.step === 'photo' && (
                <>
                  <p className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                    Минимум одно фото — как в кабинете Kaspi. Требования: реальное фото товара, без чужих логотипов и водяных знаков.
                  </p>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl p-6 mb-3 cursor-pointer" style={{ background: 'var(--nav-bg)', border: '1px dashed var(--nav-border-soft)' }}>
                    {newCardModal.photoPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={newCardModal.photoPreviewUrl} alt="" className="w-24 h-24 rounded-lg object-cover" />
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
                        {newCardModal.photoUploading ? 'Загружаем…' : 'Нажмите, чтобы выбрать фото'}
                      </span>
                    )}
                    <input type="file" accept="image/*" className="hidden" disabled={newCardModal.photoUploading}
                      onChange={ev => { const f = ev.target.files?.[0]; if (f) uploadNewCardPhoto(f) }} />
                  </label>
                  <label className="block mb-3">
                    <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Ссылка на Youtube (необязательно)</span>
                    <input value={newCardModal.youtubeLink}
                      onChange={ev => setNewCardModal(prev => prev ? { ...prev, youtubeLink: ev.target.value } : prev)}
                      className="w-full text-sm rounded-lg px-3 py-2 outline-none border"
                      style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                  </label>
                  {newCardModal.error && <div className="text-xs mb-2" style={{ color: 'var(--nav-critical)' }}>{newCardModal.error}</div>}
                  {newCardModal.imageId && (
                    <button onClick={proceedToAttributes}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      Продолжить
                    </button>
                  )}
                </>
              )}

              {newCardModal.step === 'attributes' && (
                <>
                  {newCardModal.schemaLoading && <div className="text-xs py-6 text-center" style={{ color: 'var(--nav-text-secondary)' }}>Загружаем характеристики…</div>}
                  {!newCardModal.schemaLoading && (
                    <>
                      <div className="text-[11px] mb-3" style={{ color: 'var(--nav-text-muted)' }}>
                        Артикул: <span className="font-mono">{newCardModal.suggestedSku}</span>
                      </div>
                      {newCardModal.schema.filter(g => g.features.length > 0).map(group => (
                        <div key={group.code} className="rounded-xl p-3 mb-2" style={{ background: 'var(--nav-bg)' }}>
                          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{group.name}</div>
                          {group.features.map(f => {
                            const values = newCardModal.attributeValues[f.attributeCode] ?? []
                            return (
                              <div key={f.attributeCode} className="mb-2.5">
                                <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>
                                  {f.name}{f.mandatory && ' *'}
                                </span>
                                {f.type === 'enum' && f.multiValued && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {f.options.map(o => (
                                      <button key={o.code} onClick={() => toggleMultiEnumValue(f.attributeCode, o.code)}
                                        className="text-[11px] font-medium rounded-full px-2.5 py-1"
                                        style={values.includes(o.code)
                                          ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }
                                          : { background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-secondary)', border: '1px solid var(--nav-border-soft)' }}>
                                        {o.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {f.type === 'enum' && !f.multiValued && (
                                  <select value={values[0] ?? ''} onChange={ev => setAttributeValue(f.attributeCode, ev.target.value ? [ev.target.value] : [])}
                                    className="w-full text-sm rounded-lg px-2 py-1.5 outline-none border"
                                    style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}>
                                    <option value="">— не выбрано —</option>
                                    {f.options.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                                  </select>
                                )}
                                {(f.type === 'string' || f.type === 'number') && (
                                  <input type={f.type === 'number' ? 'number' : 'text'} value={values[0] ?? ''}
                                    onChange={ev => setAttributeValue(f.attributeCode, ev.target.value ? [ev.target.value] : [])}
                                    className="w-full text-sm rounded-lg px-2 py-1.5 outline-none border"
                                    style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }} />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}

                      {newCardModal.cities.map(c => (
                        <div key={c.cityId} className="rounded-xl p-3 mb-2" style={{ background: 'var(--nav-bg)' }}>
                          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{c.cityName}</div>
                          <label className="block mb-2">
                            <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Цена, ₸</span>
                            <input type="number"
                              className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                              style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                              value={newCardModal.priceEdits[c.cityId]?.price ?? ''}
                              onChange={ev => setNewCardModal(prev => prev ? { ...prev, saved: false, priceEdits: { ...prev.priceEdits, [c.cityId]: { ...prev.priceEdits[c.cityId], price: ev.target.value } } } : prev)} />
                          </label>
                          {c.points.map(p => (
                            <label key={p.storeCode} className="block mb-1.5">
                              <span className="text-[10px] mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>Остаток, {p.displayName}</span>
                              <input type="number" placeholder="Не указан"
                                className="w-full rounded-lg px-2 py-1.5 text-sm font-mono outline-none border"
                                style={{ borderColor: 'var(--nav-border-soft)', background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-primary)' }}
                                value={newCardModal.priceEdits[c.cityId]?.stocks[p.storeCode] ?? ''}
                                onChange={ev => setNewCardModal(prev => prev ? {
                                  ...prev, saved: false,
                                  priceEdits: { ...prev.priceEdits, [c.cityId]: { ...prev.priceEdits[c.cityId], stocks: { ...prev.priceEdits[c.cityId]?.stocks, [p.storeCode]: ev.target.value } } },
                                } : prev)} />
                            </label>
                          ))}
                        </div>
                      ))}
                      <p className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                        Если не указать цену и остатки, товар попадёт в «Сняты с продажи» — заполнить можно позже.
                      </p>

                      {newCardModal.error && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-critical)' }}>{newCardModal.error}</div>}
                      {newCardModal.saved && <div className="text-xs mt-2 mb-2" style={{ color: 'var(--nav-success)' }}>Товар отправлен на проверку. Kaspi проверит его в течение 3 дней.</div>}

                      {(() => {
                        const missing = missingMandatoryFields(newCardModal)
                        return (
                          <>
                            {missing.length > 0 && (
                              <div className="text-[11px] mb-2" style={{ color: 'var(--nav-text-muted)' }}>
                                Заполните: {missing.join(', ')}
                              </div>
                            )}
                            <button onClick={submitNewCard} disabled={newCardModal.saving || missing.length > 0}
                              className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                              style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                              {newCardModal.saving ? 'Отправляем…' : 'Отправить на модерацию'}
                            </button>
                          </>
                        )
                      })()}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </main>
    </DesktopShell>
  )
}
