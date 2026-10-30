import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canUsePersonCheck } from '@/lib/personCheck/config'
import { isPersonIin, runPersonCheck } from '@/lib/personCheck/run'
import { bearerUserId } from '@/lib/toolQuota'

// Проверка физического лица по ИИН (вкладка «Физлицо · СБ» на /tools/kontragent).
// Пока включён админ-гейт (src/lib/personCheck/config.ts), отвечает только
// вошедшему админу; личность берётся из Bearer-токена сессии, не из тела запроса.
// GET без ИИН: «можно ли мне»; страница спрашивает его, чтобы решить, показывать
// ли вкладку.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Access = { ok: true } | { ok: false; status: 401 | 403 | 503; error: 'unauthorized' | 'admin_only' | 'unavailable' }

async function resolveAccess(req: NextRequest): Promise<Access> {
  const userId = await bearerUserId(supabase, req.headers)
  if (!userId) return { ok: false, status: 401, error: 'unauthorized' }
  const { data, error } = await supabase.from('profiles').select('is_admin, deleted_at').eq('id', userId).maybeSingle()
  if (error) return { ok: false, status: 503, error: 'unavailable' }
  const profile = data as { is_admin?: boolean | null; deleted_at?: string | null } | null
  if (!profile || profile.deleted_at || !canUsePersonCheck(profile.is_admin === true)) {
    return { ok: false, status: 403, error: 'admin_only' }
  }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const access = await resolveAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  return NextResponse.json({ allowed: true })
}

export async function POST(req: NextRequest) {
  const access = await resolveAccess(req)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await req.json().catch(() => ({}))
  const iin = typeof body?.iin === 'string' ? body.iin.replace(/\D/g, '') : ''
  if (!isPersonIin(iin)) {
    return NextResponse.json({ error: 'invalid_iin' }, { status: 400 })
  }

  const result = await runPersonCheck(supabase, iin)
  // Оба источника не ответили: это не «чисто» и не «не найдено», но и 503 мы не
  // отдаём: часть строк всё равно честно «не удалось проверить», показываем их.
  return NextResponse.json({ result })
}
