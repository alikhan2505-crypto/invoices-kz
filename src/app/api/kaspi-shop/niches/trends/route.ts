import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KASPI_TRENDING_CATEGORIES, type TrendProduct } from '@/lib/kaspiShop/nicheTrends'
import { getActivePlan } from '@/lib/plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// kaspi_shop_niche_trends has no owner column (it's global/shared Kaspi
// catalog data, same for every customer) and RLS with no policies
// (service-role only) -- requiring is_admin here matches the same gate
// the rest of this feature already uses (see
// src/app/api/kaspi-shop/niches/request/route.ts's requireAdmin comment),
// since the whole "Ниши" page is admin-only in practice today.
async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
  return (profile?.is_admin || getActivePlan(profile).canKaspiShop) ? user : null
}

const PAGE_SIZE = 5
const TOP_SHARE_COUNT = 8
const TRENDING_ALL_LIMIT = 20

type Row = {
  category_key: string
  category_label: string
  demand_score: number
  total_reviews: number
  product_count: number
  products: TrendProduct[]
  computed_at: string
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1)
  const categoryParam = req.nextUrl.searchParams.get('category')

  const { data, error } = await supabase
    .from('kaspi_shop_niche_trends')
    .select('category_key, category_label, demand_score, total_reviews, product_count, products, computed_at')
    .order('demand_score', { ascending: false })

  if (error) {
    console.error('kaspi-shop niches trends: fetch failed:', error.message)
    return NextResponse.json({ error: 'Не удалось загрузить данные' }, { status: 502 })
  }

  const rows = (data || []) as Row[]

  // Cache not populated yet (e.g. before the first cron run has ever
  // completed) -- not an error, just an empty-but-valid dashboard state.
  if (rows.length === 0) {
    return NextResponse.json({
      computedAt: null,
      categories: [],
      page: 1,
      pageSize: PAGE_SIZE,
      totalCategories: 0,
      categoryOptions: KASPI_TRENDING_CATEGORIES,
      topShare: [],
      trendingAll: [],
      selectedCategory: null,
      trendingCategory: null,
    })
  }

  const computedAt = rows.reduce((latest, r) => (r.computed_at > latest ? r.computed_at : latest), rows[0].computed_at)

  const totalCategories = rows.length
  const start = (page - 1) * PAGE_SIZE
  const categories = rows.slice(start, start + PAGE_SIZE).map(r => ({
    key: r.category_key, label: r.category_label, demandScore: r.demand_score,
    totalReviews: r.total_reviews, productCount: r.product_count,
  }))

  const top = rows.slice(0, TOP_SHARE_COUNT)
  const topTotal = top.reduce((sum, r) => sum + Math.max(0, r.demand_score), 0)
  const topShare = top.map(r => ({
    key: r.category_key, label: r.category_label, demandScore: r.demand_score,
    share: topTotal > 0 ? Math.max(0, r.demand_score) / topTotal : 0,
  }))

  const trendingAll = rows
    .flatMap(r => (r.products || []).map(p => ({ ...p, category: r.category_label })))
    .sort((a, b) => b.score - a.score)
    .slice(0, TRENDING_ALL_LIMIT)

  let trendingCategory: (TrendProduct & { category: string })[] | null = null
  let selectedCategory: string | null = null
  if (categoryParam) {
    const match = rows.find(r => r.category_key === categoryParam)
    if (match) {
      selectedCategory = match.category_key
      trendingCategory = [...(match.products || [])]
        .sort((a, b) => b.score - a.score)
        .map(p => ({ ...p, category: match.category_label }))
    }
  }

  return NextResponse.json({
    computedAt,
    categories,
    page,
    pageSize: PAGE_SIZE,
    totalCategories,
    categoryOptions: rows.map(r => ({ key: r.category_key, label: r.category_label })),
    topShare,
    trendingAll,
    selectedCategory,
    trendingCategory,
  })
}
