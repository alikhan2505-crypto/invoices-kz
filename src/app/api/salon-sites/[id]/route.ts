import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'
import { parseSalonData } from '@/lib/salonSites/parseSalon'
import { findPattern } from '@/lib/salonSites/patterns'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  const [{ data: site, error: siteError }, { data: variants }] = await Promise.all([
    serviceSupabase.from('salon_sites').select('*').eq('id', id).single(),
    serviceSupabase
      .from('salon_site_variants')
      .select('id, variant_no, direction, html, created_at')
      .eq('site_id', id)
      .order('variant_no'),
  ])

  if (siteError || !site) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ site, variants: variants ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => null)

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body?.salon !== undefined) {
    const salon = parseSalonData(body.salon)
    if (!salon) return NextResponse.json({ error: 'bad_salon_data' }, { status: 400 })
    update.salon = salon
  }

  if (body?.pattern !== undefined) {
    if (!findPattern(String(body.pattern))) return NextResponse.json({ error: 'bad_pattern' }, { status: 400 })
    update.pattern = body.pattern
  }

  const { data, error } = await serviceSupabase
    .from('salon_sites')
    .update(update)
    .eq('id', id)
    .select('id, slug, salon, pattern, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ site: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  const { error } = await serviceSupabase.from('salon_sites').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
