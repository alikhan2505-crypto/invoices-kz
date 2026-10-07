import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DOCUMENT_TABLES: Record<string, string> = {
  invoice: 'invoices',
  contract: 'contracts',
}

// Only what SignatureSection renders in client mode, plus snapshot_pdf_url
// (the bytes the client signs). The CMS blobs and document hash stay server-side.
const SIGNATURE_FIELDS = 'id, status, owner_signed_at, client_signed_at, owner_signer_name, owner_signer_iin, client_signer_name, client_signer_iin, ddc_pdf_url, snapshot_pdf_url, display_pdf_url'

// The signature row for a public document page (/view/[token], /contract-view/[token]).
// The 2026-09-04 audit dropped the anonymous read policy on document_signatures
// (it granted read to any row whose document merely HAD a token), but
// SignatureSection's client mode kept reading the table from the browser, so it
// silently got zero rows and rendered nothing -- no sign button, no QR. Resolving
// by token here makes presenting the right token the actual requirement.
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
    console.error('public signature lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: signature } = await supabase
    .from('document_signatures')
    .select(SIGNATURE_FIELDS)
    .eq('document_type', type)
    .eq('document_id', doc.id)
    .maybeSingle()

  return NextResponse.json({ signature: signature || null })
}
