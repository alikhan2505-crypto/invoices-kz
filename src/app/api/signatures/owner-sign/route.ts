import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { sigexRegisterDocument, sigexUploadDocumentData, sigexBuildDDC, sigexGetDocument, parseSignerName } from '@/lib/sigex'
import { getActivePlan } from '@/lib/plan'

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
// sign it. An АВР/накладная/contract is a mutual acknowledgment between both
// parties, so both sign. АВР/накладная aren't wired up yet (no public
// client-facing page for them), but the flag is here so wiring them in
// later doesn't require touching this logic again.
const REQUIRES_CLIENT_SIGNATURE: Record<string, boolean> = {
  invoice: false,
  kp: false,
  avr: true,
  nakladnaya: true,
  contract: true,
}

type DocumentRecord = {
  id: string
  title: string
  clientEmail: string | null
  userId: string
  publicUrl: string
}

async function loadDocumentRecord(documentType: string, documentId: string): Promise<DocumentRecord | null> {
  if (documentType === 'invoice') {
    const { data } = await supabase
      .from('invoices')
      .select('id, number, client_email, user_id, public_token')
      .eq('id', documentId)
      .single()
    if (!data) return null
    return {
      id: data.id,
      title: `Счёт №${data.number}`,
      clientEmail: data.client_email,
      userId: data.user_id,
      publicUrl: `https://invoices.kz/view/${data.public_token}`,
    }
  }
  if (documentType === 'contract') {
    const { data } = await supabase
      .from('contracts')
      .select('id, title, client_email, user_id, public_token')
      .eq('id', documentId)
      .single()
    if (!data) return null
    return {
      id: data.id,
      title: data.title,
      clientEmail: data.client_email,
      userId: data.user_id,
      publicUrl: `https://invoices.kz/contract-view/${data.public_token}`,
    }
  }
  return null
}

// Called after the owner has already completed the SIGEX QR/eGov mobile
// ceremony client-side and holds a real CMS signature. This route registers
// the document with SIGEX's permanent registry (so it has a durable,
// third-party-verifiable record independent of invoices.kz). For document
// types that don't need a counter-signature it finalizes immediately
// (builds the DDC and marks the row signed); otherwise it opens the
// signature request for the client to complete on the public page.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { documentType, documentId, snapshotPdfUrl, signatureCms } = await req.json()
  if (!['invoice', 'contract'].includes(documentType) || !documentId || !snapshotPdfUrl || !signatureCms) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const doc = await loadDocumentRecord(documentType, documentId)
  if (!doc || doc.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ЭЦП is a Pro-only feature — checked server-side since it's the actual
  // authority (the owner-mode UI already hides the signing button for
  // non-Pro accounts, but that's just UX, not enforcement).
  const { data: signerProfile } = await supabase.from('profiles').select('plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', user.id).single()
  if (!getActivePlan(signerProfile).canEcp) {
    return NextResponse.json({ error: 'ЭЦП доступна только на тарифе Про' }, { status: 403 })
  }

  const pdfRes = await fetch(snapshotPdfUrl)
  if (!pdfRes.ok) return NextResponse.json({ error: 'Could not fetch snapshot PDF' }, { status: 400 })
  const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
  const documentHash = crypto.createHash('sha256').update(pdfBytes).digest('hex')

  let sigexDocumentId: string
  let ownerSignerName: string | null = null
  let ownerSignerIin: string | null = null
  try {
    const registered = await sigexRegisterDocument(doc.title, signatureCms)
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
      const ddcBytes = await sigexBuildDDC(sigexDocumentId, pdfBytes, `${doc.title.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`)
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
      document_type: documentType,
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

  if (doc.clientEmail) {
    const subject = requiresClient
      ? `«${doc.title}» ожидает вашей подписи ЭЦП`
      : `«${doc.title}» подписан ЭЦП`
    const body = requiresClient
      ? `«${doc.title}» подписан отправителем и ожидает вашей подписи ЭЦП. Подписать можно через приложение eGov mobile — QR-код для сканирования на странице документа.`
      : `«${doc.title}» подписан отправителем электронной цифровой подписью. Подписанную версию можно скачать на странице документа.`
    const buttonText = requiresClient ? 'Открыть и подписать' : 'Открыть документ'

    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: doc.clientEmail,
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
    <a href="${doc.publicUrl}" style="display:block; background:#2DC48D; color:white; text-align:center; padding:14px; border-radius:10px; text-decoration:none; font-size:16px; font-weight:bold;">
      ${buttonText}
    </a>
  </div>
</div>
</body>
</html>
      `,
    })
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    status: row.status,
    ownerSignerName,
    ownerSignerIin,
    sigexDocumentId,
  })
}
