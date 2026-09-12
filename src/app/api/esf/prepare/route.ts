import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { buildInvoiceXml } from '@/lib/esfXml/buildInvoiceXml'
import { buildEsfInvoiceInputForInvoice } from '@/lib/esfXml/buildEsfInvoiceInputForInvoice'
import { lookupVatStatus, normalizeBin, isValidBin } from '@/lib/binLookup'

const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Builds the exact ЭСФ XML for one invoice, WITHOUT submitting anything --
// the browser signs exactly this text via one runSigexQrSigning() ceremony,
// then /api/esf/submit rebuilds the identical XML from the same inputs
// (deterministic -- same invoice/profile/connection/lines in, same XML out)
// and actually submits it alongside the signature. See extractSignatureAndCertificate.ts
// and submit/route.ts for why this had to be two round trips: the exact
// bytes to sign depend on server-held data (seller profile, the ЭСФ
// connection's VAT certificate number/series) the browser doesn't have.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken ? await supabaseAuth.auth.getUser(accessToken) : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized', errorCode: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).maybeSingle()
  if (!getActivePlan(profile).canEsf) return NextResponse.json({ error: 'Требуется тариф Про', errorCode: 'not_pro' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const invoiceId = body?.invoiceId
  const lines = body?.lines
  if (!invoiceId || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'invoiceId, lines обязательны', errorCode: 'missing_fields' }, { status: 400 })
  }

  const built = await buildEsfInvoiceInputForInvoice(user.id, invoiceId, lines)
  if ('error' in built) return NextResponse.json({ error: built.error, errorCode: built.errorCode }, { status: built.status })

  // Same is_vat_payer-or-fresh-lookup fallback as the submit route below --
  // see that route's comment for why a stored `false`/`null` doesn't
  // necessarily mean "not a VAT payer" (Task 8's review finding).
  let isVatPayer = built.invoice.is_vat_payer as boolean | null
  if (isVatPayer !== true && built.invoice.client_bin && isValidBin(built.invoice.client_bin)) {
    const freshLookup = await lookupVatStatus(normalizeBin(built.invoice.client_bin)).catch(() => undefined)
    isVatPayer = freshLookup?.isVatPayer ?? isVatPayer
  }
  if (!isVatPayer) return NextResponse.json({ error: 'Покупатель не отмечен как плательщик НДС', errorCode: 'not_vat_payer' }, { status: 400 })

  return NextResponse.json({ invoiceXml: buildInvoiceXml(built.input) })
}
