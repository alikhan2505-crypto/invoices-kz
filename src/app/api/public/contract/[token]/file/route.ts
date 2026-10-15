import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveContractFilePath, signedDocumentUrl } from '@/lib/signedDocumentsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Файл договора для контрагента на /contract-view/[token]. Право смотреть —
// знание public_token договора (как и у всей публичной страницы). Вместо
// вечной публичной ссылки — переадресация на подписанную ссылку, которая
// живёт несколько минут; сама эта страница-ссылка не устаревает, пока жив
// токен, так что кнопка «Открыть файл» работает и через час.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('user_id, file_url')
    .eq('public_token', token)
    .maybeSingle()
  if (error) {
    console.error('public contract file lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Только файл из папки владельца договора — см. contractFilePath.
  const filePath = resolveContractFilePath(contract.file_url, contract.user_id)
  const url = filePath ? await signedDocumentUrl(supabase, filePath) : null
  if (!url) return NextResponse.json({ error: 'file_unavailable' }, { status: 404 })
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
