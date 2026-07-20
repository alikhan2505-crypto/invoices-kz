import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sigexAddSignature, sigexBuildDDC, sigexGetDocument, parseSignerName } from '@/lib/sigex'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

async function loadDocumentTitleAndToken(documentType: string, documentId: string) {
  if (documentType === 'invoice') {
    const { data } = await supabase.from('invoices').select('number, public_token').eq('id', documentId).single()
    return data ? { title: `Счёт №${data.number}`, publicToken: data.public_token } : null
  }
  if (documentType === 'contract') {
    const { data } = await supabase.from('contracts').select('title, public_token').eq('id', documentId).single()
    return data ? { title: data.title, publicToken: data.public_token } : null
  }
  return null
}

// No auth — the client is never a registered invoices.kz user. Called from
// the public document page after the client completes their own SIGEX QR/eGov
// mobile ceremony. Access is gated by already knowing `signatureId`, which
// is only ever shown on the public-token-gated document pages.
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

  const doc = await loadDocumentTitleAndToken(row.document_type, row.document_id)
  if (!doc?.publicToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pdfRes = await fetch(row.snapshot_pdf_url)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch snapshot PDF' }, { status: 400 })
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())

  let clientSignerName: string | null = null
  let clientSignerIin: string | null = null
  try {
    await sigexAddSignature(row.sigex_document_id, signatureCms)
    const { signatures } = await sigexGetDocument(row.sigex_document_id)
    const clientSig = signatures[signatures.length - 1]
    clientSignerName = parseSignerName(clientSig?.subject)
    clientSignerIin = clientSig?.userId || null
  } catch (e: any) {
    return NextResponse.json({ error: `SIGEX: ${e.message}` }, { status: 502 })
  }

  let ddcPdfUrl: string | null = null
  try {
    const ddcBytes = await sigexBuildDDC(row.sigex_document_id, pdfBytes, `${doc.title.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`)
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
      client_signer_name: clientSignerName,
      client_signer_iin: clientSignerIin,
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
      subject: `«${doc.title}» подписан обеими сторонами`,
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
      Клиент подписал «${doc.title}» своей ЭЦП. Документ подписан обеими сторонами.
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
