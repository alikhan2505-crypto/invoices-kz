import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/salonSites/adminAuth'
import { fetch2gisPlace } from '@/lib/salonSites/fetch2gis'

// Тексты ошибок fetch2gisPlace про саму ссылку - их можно показать админу как есть.
const SAFE_2GIS_MESSAGES = new Set([
  'не удалось распознать ID организации в этой ссылке 2ГИС',
  'организация не найдена в 2ГИС по этой ссылке',
])

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
    const raw = err instanceof Error ? err.message : ''
    console.error('salon-sites fetch-2gis failed:', raw || err)
    // Человеку отдаём только два сообщения про его ссылку; остальные (нет ключа
    // API, статус ответа 2ГИС) - внутренние, они только в логе.
    const message = SAFE_2GIS_MESSAGES.has(raw) ? raw : 'не удалось получить данные из 2ГИС'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
