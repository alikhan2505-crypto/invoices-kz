import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signedDocumentUrl } from '@/lib/signedDocumentsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCUMENT_TABLES: Record<string, string> = {
  invoice: 'invoices',
  contract: 'contracts',
}

// Байты, которые подписывает контрагент (SignatureSection в режиме client,
// /view/[token] и /contract-view/[token]). Раньше браузер скачивал
// snapshot_pdf_url напрямую из публичного бакета; бакет закрывается (см.
// src/lib/signedDocuments.ts), поэтому право на файл — знание public_token
// документа, проверенное здесь, а отдаётся переадресация на короткую
// подписанную ссылку. Хранилище Supabase отвечает с
// Access-Control-Allow-Origin: *, так что fetch() из браузера проходит и
// после переадресации.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const type = req.nextUrl.searchParams.get('type') || ''
  const table = DOCUMENT_TABLES[type]
  if (!token || !table) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: doc, error } = await supabase
    .from(table)
    .select('id')
    .eq('public_token', token)
    .maybeSingle()
  if (error) {
    console.error('public signature snapshot lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: signature } = await supabase
    .from('document_signatures')
    .select('snapshot_pdf_url')
    .eq('document_type', type)
    .eq('document_id', doc.id)
    .maybeSingle()
  if (!signature?.snapshot_pdf_url) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const url = await signedDocumentUrl(supabase, signature.snapshot_pdf_url)
  if (!url) return NextResponse.json({ error: 'file_unavailable' }, { status: 404 })
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
