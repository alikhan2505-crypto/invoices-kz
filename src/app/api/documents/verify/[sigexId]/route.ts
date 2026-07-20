import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public, no auth — this is the page a QR code on the printed document (or
// the "Карточка"/DDC) points to, and the SIGEX document ID printed next to
// it is the human-typeable fallback. Looked up by `sigex_document_id`
// rather than our own row id so the code printed on paper matches exactly
// what SIGEX itself shows as the document's identifier.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sigexId: string }> }
) {
  const { sigexId } = await params

  const { data: row } = await supabase
    .from('document_signatures')
    .select('id, document_type, document_id, owner_signed_at, client_signed_at, owner_signer_name, owner_signer_iin, client_signer_name, client_signer_iin, owner_user_id, sigex_document_id')
    .eq('sigex_document_id', sigexId)
    .single()

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [documentTitleResult, { data: owner }] = await Promise.all([
    row.document_type === 'contract'
      ? supabase.from('contracts').select('title').eq('id', row.document_id).single()
      : supabase.from('invoices').select('number').eq('id', row.document_id).single(),
    supabase.from('profiles').select('company_name').eq('id', row.owner_user_id).single(),
  ])
  const documentTitle = row.document_type === 'contract'
    ? (documentTitleResult.data as any)?.title || null
    : (documentTitleResult.data as any)?.number ? `Счёт №${(documentTitleResult.data as any).number}` : null

  return NextResponse.json({
    sigexDocumentId: row.sigex_document_id,
    documentTitle,
    companyName: owner?.company_name || null,
    ownerSignerName: row.owner_signer_name,
    ownerSignerIin: row.owner_signer_iin,
    ownerSignedAt: row.owner_signed_at,
    clientSignerName: row.client_signer_name,
    clientSignerIin: row.client_signer_iin,
    clientSignedAt: row.client_signed_at,
    documentUrl: `/api/documents/${row.id}/document`,
    cardUrl: `/api/documents/${row.id}/card`,
  })
}
