import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/salonSites/adminAuth'
import { fetch2gisPlace } from '@/lib/salonSites/fetch2gis'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const url = typeof body?.url === 'string' ? body.url.trim() : ''
  if (!url) return NextResponse.json({ error: 'bad_url' }, { status: 400 })

  try {
    const place = await fetch2gisPlace(url)
    return NextResponse.json({ place })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'не удалось получить данные из 2ГИС'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
