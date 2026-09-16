import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => null)

  const variantId = typeof body?.variantId === 'string' ? body.variantId : ''
  if (!variantId) return NextResponse.json({ error: 'variant_id_required' }, { status: 400 })

  const { data: variant } = await serviceSupabase
    .from('salon_site_variants')
    .select('id, html')
    .eq('id', variantId)
    .eq('site_id', id)
    .single()

  if (!variant) return NextResponse.json({ error: 'variant_not_found' }, { status: 404 })

  // Публикуем снимок HTML, а не ссылку на вариант: следующая перегенерация
  // черновика не должна менять то, что уже открыто у клиентов салона.
  const { data, error } = await serviceSupabase
    .from('salon_sites')
    .update({
      status: 'published',
      published_variant_id: variant.id,
      published_html: variant.html,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, slug, status, published_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ site: data })
}
