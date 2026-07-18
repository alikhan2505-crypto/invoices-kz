import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sigexAddSignature, sigexBuildDDC } from '@/lib/sigex'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// No auth — the client is never a registered invoices.kz user. Called from
// the public invoice page after the client completes their own SIGEX QR/eGov
// mobile ceremony. Access is gated by already knowing `signatureId`, which
// is only ever shown on the public-token-gated invoice page (same trust
// model as the invoice itself).
export async function POST(req: NextRequest) {
  const { signatureId, signatureCms } = await req.json()
  if (!signatureId || !signatureCms) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data: row } = await supabase
    .from('document_signatures')
    .select('id, document_type, document_id, status, snapshot_pdf_url, sigex_document_id, owner_user_id')
    .eq('id', signatureId)
    .single()

  if (!row || row.status !== 'awaiting_client') {
    return NextResponse.json({ error: 'Not awaiting a client signature' }, { status: 400 })
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, number, public_token')
    .eq('id', row.document_id)
    .single()

  if (!invoice?.public_token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pdfRes = await fetch(row.snapshot_pdf_url)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch snapshot PDF' }, { status: 400 })
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())

  try {
    await sigexAddSignature(row.sigex_document_id, signatureCms)
  } catch (e: any) {
    return NextResponse.json({ error: `SIGEX: ${e.message}` }, { status: 502 })
  }

  let ddcPdfUrl: string | null = null
  try {
    const ddcBytes = await sigexBuildDDC(row.sigex_document_id, pdfBytes)
    const path = `${row.document_id}/${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('signed-documents')
      .upload(path, ddcBytes, { contentType: 'application/pdf', upsert: false })
    if (!uploadError) {
      ddcPdfUrl = supabase.storage.from('signed-documents').getPublicUrl(path).data.publicUrl
    }
  } catch (e) {
    // Best-effort — the actual signatures are already safely recorded above.
    // The verification "card" PDF can be regenerated/fixed later without
    // touching the signatures themselves.
    console.error('SIGEX buildDDC failed:', e)
  }

  const { error: updateError } = await supabase
    .from('document_signatures')
    .update({
      status: 'signed',
      client_signed_at: new Date().toISOString(),
      client_signature_cms: signatureCms,
      ddc_pdf_url: ddcPdfUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', signatureId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const { data: owner } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', row.owner_user_id)
    .single()

  if (owner?.email) {
    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: owner.email,
      subject: `Счёт №${invoice.number} подписан обеими сторонами`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#2DC48D; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Документ подписан</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0; font-size:14px; color:#333;">
      Клиент подписал счёт №${invoice.number} своей ЭЦП. Документ подписан обеими сторонами — скачать можно на странице счёта.
    </p>
  </div>
</div>
</body>
</html>
      `,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, ddcPdfUrl })
}
