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
  // Не JSON или не объект - 400, а не «успешное» обновление одного updated_at.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 })
  }

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

  if (error) {
    // Текст ошибки базы (таблицы, колонки) в ответ не отдаём, он только в логе.
    console.error('salon-sites update failed:', error.message)
    return NextResponse.json({ error: 'Не удалось сохранить сайт' }, { status: 500 })
  }
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
  if (error) {
    console.error('salon-sites delete failed:', error.message)
    return NextResponse.json({ error: 'Не удалось удалить сайт' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
