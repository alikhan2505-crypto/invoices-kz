import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'
import { parseSalonData, parseSlug } from '@/lib/salonSites/parseSalon'
import { findPattern } from '@/lib/salonSites/patterns'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await serviceSupabase
    .from('salon_sites')
    .select('id, slug, salon, pattern, status, published_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sites: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)

  const slug = parseSlug(body?.slug)
  if (!slug) return NextResponse.json({ error: 'bad_slug' }, { status: 400 })

  const salon = parseSalonData(body?.salon)
  if (!salon) return NextResponse.json({ error: 'bad_salon_data' }, { status: 400 })

  const pattern = typeof body?.pattern === 'string' ? body.pattern : ''
  if (!findPattern(pattern)) return NextResponse.json({ error: 'bad_pattern' }, { status: 400 })

  const { data, error } = await serviceSupabase
    .from('salon_sites')
    .insert({ slug, salon, pattern, created_by: auth.userId })
    .select('id, slug, salon, pattern, status')
    .single()

  if (error) {
    // Поддомен уже занят другим салоном.
    if (error.code === '23505') return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ site: data })
}
