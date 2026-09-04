import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Public contract page (/contract-view/[token]), server-side for the same
// reason as the invoice one: the old RLS policy granted anonymous read to
// every contract that merely HAD a token, rather than to whoever presented
// it. See src/app/api/public/invoice/[token]/route.ts for the full note.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('public_token', token)
    .maybeSingle()
  if (error) {
    console.error('public contract lookup failed:', error.message)
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  }
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_name')
    .eq('id', contract.user_id)
    .maybeSingle()

  // Signatures already on this contract -- the page shows who has signed.
  // Scoped to this contract only, so the old blanket "any signature whose
  // document has a token" policy is no longer needed.
  const { data: signatures } = await supabase
    .from('document_signatures')
    .select('*')
    .eq('document_type', 'contract')
    .eq('document_id', contract.id)

  return NextResponse.json({ contract, profile: profile || null, signatures: signatures || [] })
}
