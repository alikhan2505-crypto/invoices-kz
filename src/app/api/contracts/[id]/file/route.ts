import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveContractFilePath, signedDocumentUrl } from '@/lib/signedDocumentsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Короткая подписанная ссылка на файл договора — для владельца в
// /contract/[id] («Открыть файл» и подписание ЭЦП). Бакет signed-documents
// закрыт для браузера (см. src/lib/signedDocuments.ts), поэтому ссылку
// выдаёт сервер после проверки, что договор принадлежит вошедшему.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: contract } = await supabase
    .from('contracts')
    .select('user_id, file_url')
    .eq('id', id)
    .maybeSingle()
  // Один и тот же 404 и для чужого, и для несуществующего договора.
  if (!contract || contract.user_id !== user.id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Только файл из папки владельца: file_url пишет браузер, путь к чужому
  // объекту бакета не отдаём.
  const filePath = resolveContractFilePath(contract.file_url, contract.user_id)
  const url = filePath ? await signedDocumentUrl(supabase, filePath) : null
  if (!url) return NextResponse.json({ error: 'file_unavailable' }, { status: 404 })
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
}
