import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { removeMetaConnections } from '@/lib/metaDataRemoval'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// «Data deletion request URL» приложения Meta: человек просит Meta удалить данные, связанные с
// приложением. Meta ждёт в ответ JSON { url, confirmation_code }: ссылку, где человек увидит статус.
// Подключения каналов и токены стираются сразу (metaDataRemoval.ts), статус - на странице
// /data-deletion; остальные данные аккаунта удаляются по письму, как там и описано.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const result = await removeMetaConnections(supabase, form)
  if (!result.userId) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  if (!result.ok) return NextResponse.json({ error: 'failed' }, { status: 500 })

  const code = randomBytes(9).toString('hex')
  console.log('meta data deletion request handled: connections removed =', result.removed, '; code =', code)
  return NextResponse.json({ url: `https://invoices.kz/data-deletion?code=${code}`, confirmation_code: code })
}
