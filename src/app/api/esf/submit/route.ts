import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { loadEsfConnectionByUserId } from '@/lib/esfXml/connection'
import { buildInvoiceXml } from '@/lib/esfXml/buildInvoiceXml'
import { buildEsfInvoiceInputForInvoice } from '@/lib/esfXml/buildEsfInvoiceInputForInvoice'
import { createEsfSession, syncInvoice } from '@/lib/esfXml/client'
import { extractSignatureAndCertificate } from '@/lib/esfXml/extractSignatureAndCertificate'
import { lookupVatStatus, normalizeBin, isValidBin } from '@/lib/binLookup'

// Matches the repo-wide two-client auth pattern confirmed in Task 7's
// review (src/app/api/bcc/connect/route.ts and every other authenticated
// route) -- auth.getUser must go through the ANON key, never the
// service-role client used for the actual DB reads/writes below.
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized', errorCode: 'unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).maybeSingle()
  if (!getActivePlan(profile).canEsf) return NextResponse.json({ error: 'Требуется тариф Про', errorCode: 'not_pro' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const invoiceId = body?.invoiceId
  const cmsSignatureBase64 = body?.cmsSignatureBase64 // the raw runSigexQrSigning() output over the exact XML /api/esf/prepare returned -- signature + signing certificate both get extracted from this single blob below
  const lines = body?.lines // same lines the browser sent to /api/esf/prepare -- rebuilding from them here (not trusting a client-echoed XML string) is what makes the two-step flow safe
  if (!invoiceId || !cmsSignatureBase64 || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'invoiceId, cmsSignatureBase64, lines обязательны', errorCode: 'missing_fields' }, { status: 400 })
  }

  const connection = await loadEsfConnectionByUserId(user.id)
  if (!connection) return NextResponse.json({ error: 'ЭСФ не подключён', errorCode: 'not_connected' }, { status: 400 })
  if (!connection.authCertificateBase64) return NextResponse.json({ error: 'Не загружен сертификат аутентификации ЭСФ', errorCode: 'no_auth_certificate' }, { status: 400 })

  const built = await buildEsfInvoiceInputForInvoice(user.id, invoiceId, lines)
  if ('error' in built) return NextResponse.json({ error: built.error, errorCode: built.errorCode }, { status: built.status })

  // Same is_vat_payer-or-fresh-lookup fallback as /api/esf/prepare -- this
  // route re-checks independently rather than trusting that prepare was
  // ever called, since a client could call submit directly.
  let isVatPayer = built.invoice.is_vat_payer as boolean | null
  if (isVatPayer !== true && built.invoice.client_bin && isValidBin(built.invoice.client_bin)) {
    const freshLookup = await lookupVatStatus(normalizeBin(built.invoice.client_bin)).catch(() => undefined)
    isVatPayer = freshLookup?.isVatPayer ?? isVatPayer
  }
  if (!isVatPayer) return NextResponse.json({ error: 'Покупатель не отмечен как плательщик НДС', errorCode: 'not_vat_payer' }, { status: 400 })

  const invoiceXml = buildInvoiceXml(built.input)

  let result
  try {
    const { signatureBase64, certificateBase64 } = extractSignatureAndCertificate(cmsSignatureBase64)
    const sessionId = await createEsfSession(connection.login, connection.password, connection.authCertificateBase64)
    result = await syncInvoice(sessionId, invoiceXml, signatureBase64, certificateBase64)
  } catch (e: any) {
    await supabase.from('esf_submissions').insert({
      invoice_id: invoiceId, user_id: user.id, status: 'declined',
      error_code: 'TRANSPORT_ERROR', error_description: e?.message || String(e),
      invoice_xml_snapshot: invoiceXml,
    })
    return NextResponse.json({ error: 'Ошибка связи с ИС ЭСФ: ' + (e?.message || String(e)), errorCode: 'transport_error' }, { status: 502 })
  }

  if (result.accepted) {
    await supabase.from('esf_submissions').insert({
      invoice_id: invoiceId, user_id: user.id, status: 'accepted',
      esf_registration_id: result.registrationId, esf_num: result.num,
      invoice_xml_snapshot: invoiceXml,
    })
    return NextResponse.json({ ok: true, registrationId: result.registrationId })
  }

  await supabase.from('esf_submissions').insert({
    invoice_id: invoiceId, user_id: user.id, status: 'declined',
    error_code: result.errorCode, error_description: result.errorDescription,
    invoice_xml_snapshot: invoiceXml,
  })
  return NextResponse.json({ error: result.errorDescription, errorCode: result.errorCode }, { status: 422 })
}
