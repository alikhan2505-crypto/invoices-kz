import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Attaches the human-readable "display" PDF (same document, plus a visible
// ЭЦП attestation block) to an already-signed row. Kept as its own route
// rather than folding into owner-sign because it runs client-side *after*
// that call returns (rendering the attestation copy needs the signer name
// owner-sign only just found out) — no signature/legal data is touched
// here, just an extra convenience artifact.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { signatureId, displayPdfUrl } = await req.json()
  if (!signatureId || !displayPdfUrl) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data: row } = await supabase
    .from('document_signatures')
    .select('owner_user_id')
    .eq('id', signatureId)
    .single()

  if (!row || row.owner_user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('document_signatures')
    .update({ display_pdf_url: displayPdfUrl, updated_at: new Date().toISOString() })
    .eq('id', signatureId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
