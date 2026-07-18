import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { sigexRegisterDocument, sigexUploadDocumentData, sigexBuildDDC, sigexGetDocument, parseSignerName } from '@/lib/sigex'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

// Which document types need the client to counter-sign vs. just the sender.
// An invoice/КП is a one-directional statement from the sender — only they
// sign it. An АВР/накладная is a mutual acknowledgment between both parties,
// so both sign (per the user's own call, 2026-07-18). АВР/накладная aren't
// wired up yet (no public client-facing page for them), but the flag is
// here so wiring them in later doesn't require touching this logic again.
const REQUIRES_CLIENT_SIGNATURE: Record<string, boolean> = {
  invoice: false,
  kp: false,
  avr: true,
  nakladnaya: true,
}

// Called after the owner has already completed the SIGEX QR/eGov mobile
// ceremony client-side and holds a real CMS signature. This route registers
// the document with SIGEX's permanent registry (so it has a durable,
// third-party-verifiable record independent of invoices.kz). For document
// types that don't need a counter-signature it finalizes immediately
// (builds the DDC and marks the row signed); otherwise it opens the
// signature request for the client to complete on the public invoice page.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { documentType, documentId, snapshotPdfUrl, signatureCms } = await req.json()
  if (documentType !== 'invoice' || !documentId || !snapshotPdfUrl || !signatureCms) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, number, client_email, client_name, user_id, public_token')
    .eq('id', documentId)
    .single()

  if (!invoice || invoice.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pdfRes = await fetch(snapshotPdfUrl)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch snapshot PDF' }, { status: 400 })
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
  const documentHash = crypto.createHash('sha256').update(pdfBytes).digest('hex')

  let sigexDocumentId: string
  let ownerSignerName: string | null = null
  let ownerSignerIin: string | null = null
  try {
    const registered = await sigexRegisterDocument(`Счёт №${invoice.number}`, signatureCms)
    sigexDocumentId = registered.documentId
    await sigexUploadDocumentData(sigexDocumentId, pdfBytes)
    const { signatures } = await sigexGetDocument(sigexDocumentId)
    const ownerSig = signatures[0]
    ownerSignerName = parseSignerName(ownerSig?.subject)
    ownerSignerIin = ownerSig?.userId || null
  } catch (e: any) {
    return NextResponse.json({ error: `SIGEX: ${e.message}` }, { status: 502 })
  }

  const requiresClient = REQUIRES_CLIENT_SIGNATURE[documentType] ?? true
  let ddcPdfUrl: string | null = null

  if (!requiresClient) {
    try {
      const ddcBytes = await sigexBuildDDC(sigexDocumentId, pdfBytes, `Schet-${invoice.number}.pdf`)
      const path = `${documentId}/${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('signed-documents')
        .upload(path, ddcBytes, { contentType: 'application/pdf', upsert: false })
      if (!uploadError) {
        ddcPdfUrl = supabase.storage.from('signed-documents').getPublicUrl(path).data.publicUrl
      }
    } catch (e) {
      // Best-effort — the owner's CMS signature is already safely
      // registered with SIGEX at this point; the verification card can be
      // regenerated later without redoing the signature itself.
      console.error('SIGEX buildDDC failed:', e)
    }
  }

  const { data: row, error } = await supabase
    .from('document_signatures')
    .insert({
      document_type: 'invoice',
      document_id: documentId,
      owner_user_id: user.id,
      status: requiresClient ? 'awaiting_client' : 'signed',
      snapshot_pdf_url: snapshotPdfUrl,
      document_hash: documentHash,
      owner_signed_at: new Date().toISOString(),
      owner_signature_cms: signatureCms,
      owner_signer_name: ownerSignerName,
      owner_signer_iin: ownerSignerIin,
      sigex_document_id: sigexDocumentId,
      ddc_pdf_url: ddcPdfUrl,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (invoice.client_email) {
    const publicLink = `https://invoices.kz/view/${invoice.public_token}`
    const subject = requiresClient
      ? `Счёт №${invoice.number} ожидает вашей подписи ЭЦП`
      : `Счёт №${invoice.number} подписан ЭЦП`
    const body = requiresClient
      ? `Счёт №${invoice.number} подписан отправителем и ожидает вашей подписи ЭЦП. Подписать можно через приложение eGov mobile — QR-код для сканирования на странице счёта.`
      : `Счёт №${invoice.number} подписан отправителем электронной цифровой подписью. Подписанную версию можно скачать на странице счёта.`
    const buttonText = requiresClient ? 'Открыть счёт и подписать' : 'Открыть счёт'

    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: invoice.client_email,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<div style="max-width:560px; margin:30px auto; background:white; border:1px solid #e0e0e0;">
  <div style="background:#1C2056; padding:24px 32px;">
    <div style="color:white; font-size:18px; font-weight:bold; letter-spacing:1px;">Электронная подпись</div>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px; font-size:14px; color:#333;">${body}</p>
    <a href="${publicLink}" style="display:block; background:#2DC48D; color:white; text-align:center; padding:14px; border-radius:10px; text-decoration:none; font-size:16px; font-weight:bold;">
      ${buttonText}
    </a>
  </div>
</div>
</body>
</html>
      `,
    })
  }

  return NextResponse.json({ ok: true, id: row.id })
}
