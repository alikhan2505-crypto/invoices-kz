import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { removeMetaConnections } from '@/lib/metaDataRemoval'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// «Deauthorize callback URL» приложения Meta: человек отозвал доступ приложения invoices.kz в настройках
// Instagram/Facebook. Meta шлёт POST с полем signed_request (форма). Подписанный запрос проверяется по
// app secret, подключения каналов этого пользователя удаляются вместе с токеном (metaDataRemoval.ts).
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await removeMetaConnections(supabase, form)
  if (!result.userId) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  // Сбой базы: 500, чтобы Meta повторила вызов; без текста ошибки.
  if (!result.ok) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
