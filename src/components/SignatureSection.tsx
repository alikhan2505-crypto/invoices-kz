'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/date'
import { renderPdfBlob, uploadSnapshot, runSigexQrSigning, injectAttestationBlock, buildAttestationHtml, SigexQrState } from '@/lib/signDocument'
import { useLanguage } from '@/components/LanguageProvider'
import { signatureDict } from '@/lib/i18n/signature'

// SIGEX itself keeps the QR valid for ~15 minutes (its own `expireAt`, not
// surfaced by the client library), but leaving someone staring at a QR with
// zero feedback for that long reads as "frozen" — this is a much shorter,
// client-side give-up point after which we show an explicit message instead
// of silence. Well under the real QR expiry, so it never fires while a
// signature is still genuinely possible on the phone side.
const SIGNING_TIMEOUT_MS = 4 * 60 * 1000

type Row = {
  id: string
  status: 'awaiting_owner' | 'awaiting_client' | 'signed' | 'failed'
  owner_signed_at: string | null
  client_signed_at: string | null
  owner_signer_name: string | null
  owner_signer_iin: string | null
  client_signer_name: string | null
  client_signer_iin: string | null
  ddc_pdf_url: string | null
  snapshot_pdf_url: string
  display_pdf_url: string | null
}

type Props = {
  documentId: string
  documentTitle: string
  documentType?: 'invoice' | 'contract'
  ownerCompanyName?: string
} & (
  // Invoice-style: no file exists yet, generate one from HTML each time.
  | { mode: 'owner'; getHtml: () => Promise<string>; getPdfUrl?: never }
  // Contract-style: an already-uploaded file is what gets signed as-is.
  | { mode: 'owner'; getPdfUrl: () => Promise<string>; getHtml?: never }
  | { mode: 'client' }
)

export default function SignatureSection(props: Props) {
  const { documentId, documentTitle, mode, ownerCompanyName } = props
  const documentType = props.documentType || 'invoice'
  const { lang } = useLanguage()
  const t = signatureDict[lang]

  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [qr, setQr] = useState<SigexQrState | null>(null)
  const [error, setError] = useState('')
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => { loadRow() }, [documentId])

  // Wraps the real SIGEX ceremony (which otherwise waits patiently on
  // whatever sigex.kz does, up to its own ~15min QR expiry) with an escape
  // hatch: either the user clicks Отмена (cancelRef, wired to the QR panel)
  // or SIGNING_TIMEOUT_MS elapses. Either way we stop waiting and reset the
  // UI — the abandoned network calls just get ignored, not aborted.
  function signWithEscape(pdfBlob: Blob): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false
      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        reject(Object.assign(new Error('Signing wait timed out'), { timedOut: true }))
      }, SIGNING_TIMEOUT_MS)
      cancelRef.current = () => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        reject(Object.assign(new Error('Signing cancelled by user'), { userCancelled: true }))
      }
      runSigexQrSigning(documentTitle, pdfBlob, setQr)
        .then((sig) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          resolve(sig)
        })
        .catch((err) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          reject(err)
        })
    })
  }

  async function loadRow() {
    const { data } = await supabase
      .from('document_signatures')
      .select('id, status, owner_signed_at, client_signed_at, owner_signer_name, owner_signer_iin, client_signer_name, client_signer_iin, ddc_pdf_url, snapshot_pdf_url, display_pdf_url')
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .maybeSingle()
    setRow(data)
    setLoading(false)
  }

  async function ownerSign() {
    if (props.mode !== 'owner') return
    setSigning(true)
    setError('')
    setQr(null)
    try {
      let html: string | null = null
      let pdfBlob: Blob
      let snapshotPdfUrl: string

      if (props.getHtml) {
        html = await props.getHtml()
        pdfBlob = await renderPdfBlob(html)
        snapshotPdfUrl = await uploadSnapshot(documentId, pdfBlob)
      } else {
        // Contract-style: the file was already uploaded — sign it as-is.
        snapshotPdfUrl = await props.getPdfUrl!()
        pdfBlob = await (await fetch(snapshotPdfUrl)).blob()
      }

      const signatureCms = await signWithEscape(pdfBlob)
      setQr(null)

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/signatures/owner-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ documentType, documentId, snapshotPdfUrl, signatureCms }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      await loadRow()

      // Best-effort — the signature itself is already safely recorded above.
      // This just builds a second, human-readable copy with a visible
      // "signed with ЭЦП" block so opening the file directly (no
      // invoices.kz UI around it) still shows who signed and when. Only
      // possible when we have the source HTML to re-render — an uploaded
      // contract file has no such source, so it's skipped there (the DDC
      // verification card is still available for those).
      if (html && json.status === 'signed' && json.ownerSignerName) {
        try {
          const block = await buildAttestationHtml({
            title: t.attestationTitle,
            signerName: json.ownerSignerName,
            signerIin: json.ownerSignerIin,
            dateLabel: t.attestationDateLabel,
            date: formatDateTime(new Date().toISOString()),
            onBehalfOfText: ownerCompanyName ? t.onBehalfOfPrefix(ownerCompanyName) : undefined,
            iinText: json.ownerSignerIin ? t.iinPrefix(json.ownerSignerIin) : undefined,
            sigexDocumentId: json.sigexDocumentId,
            verifyCodeLabel: t.attestationVerifyCodeLabel,
          })
          const displayBlob = await renderPdfBlob(injectAttestationBlock(html, block))
          const displayPdfUrl = await uploadSnapshot(documentId, displayBlob, 'display')
          await fetch('/api/signatures/set-display-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ signatureId: json.id, displayPdfUrl }),
          })
          await loadRow()
        } catch {
          // Non-critical — the plain snapshot is still a valid download.
        }
      }
    } catch (e: any) {
      // sigex-qr-signing-client flags this for more than just an explicit
      // "cancel" tap in the eGov app — a session timeout or an interrupted
      // ceremony can land here too, and the previous silent `return` gave
      // the user zero feedback: the QR just vanished and the button went
      // back to "Подписать ЭЦП" with no indication of what happened or
      // that a retry was expected. Always show something now — a neutral,
      // non-alarming message, not the raw error framing, since a genuine
      // user-initiated cancel isn't really a bug.
      if (e?.userCancelled) { return }
      if (e?.timedOut) { setError(t.signingTimedOutMessage); return }
      if (e?.canceledByUser) { setError(t.signingNotCompletedMessage); return }
      setError(e?.message || String(e))
    } finally {
      setSigning(false)
      setQr(null)
    }
  }

  async function clientSign() {
    if (!row) return
    setSigning(true)
    setError('')
    setQr(null)
    try {
      const pdfRes = await fetch(row.snapshot_pdf_url)
      const pdfBlob = await pdfRes.blob()

      const signatureCms = await signWithEscape(pdfBlob)
      setQr(null)

      const res = await fetch('/api/signatures/client-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureId: row.id, signatureCms }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      await loadRow()
    } catch (e: any) {
      // sigex-qr-signing-client flags this for more than just an explicit
      // "cancel" tap in the eGov app — a session timeout or an interrupted
      // ceremony can land here too, and the previous silent `return` gave
      // the user zero feedback: the QR just vanished and the button went
      // back to "Подписать ЭЦП" with no indication of what happened or
      // that a retry was expected. Always show something now — a neutral,
      // non-alarming message, not the raw error framing, since a genuine
      // user-initiated cancel isn't really a bug.
      if (e?.userCancelled) { return }
      if (e?.timedOut) { setError(t.signingTimedOutMessage); return }
      if (e?.canceledByUser) { setError(t.signingNotCompletedMessage); return }
      setError(e?.message || String(e))
    } finally {
      setSigning(false)
      setQr(null)
    }
  }

  if (loading) return null
  // Client mode has nothing to show until the owner has started the process.
  if (mode === 'client' && !row) return null

  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.sectionLabel}</div>
      <div className="bg-white rounded-2xl shadow-sm p-4">
        {qr ? (
          <div className="text-center py-2">
            {qr.qrImage && (
              <img src={`data:image/png;base64,${qr.qrImage}`} alt="QR" className="mx-auto w-48 h-48 mb-3" />
            )}
            <p className="text-sm text-gray-500 mb-3">{t.scanQrHint}</p>
            {qr.mobileLink && (
              <a href={qr.mobileLink} className="inline-block text-xs text-[#1C2056] border border-[#1C2056] rounded-lg px-4 py-2 mb-2">
                {t.openInEgovButton}
              </a>
            )}
            <p className="text-xs text-gray-400 mb-2">{t.signingLabel}</p>
            <button onClick={() => cancelRef.current?.()} className="text-xs text-gray-400 underline">
              {t.cancelButton}
            </button>
          </div>
        ) : row?.status === 'signed' ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#2DC48D]/10 flex items-center justify-center text-xl">✅</div>
              <div className="text-sm font-medium text-[#2DC48D]">
                {row.client_signed_at ? t.signedBothStatus : t.signedOwnerOnlyStatus}
              </div>
            </div>
            {row.owner_signer_name && (
              <div className="text-xs text-gray-600 mb-1">
                <span className="text-gray-400">{t.signedByLabel}</span>{' '}
                <span className="font-medium">{row.owner_signer_name}</span>
                {ownerCompanyName && <span>, {t.onBehalfOfPrefix(ownerCompanyName)}</span>}
                {row.owner_signer_iin && <span className="text-gray-400"> · {t.iinPrefix(row.owner_signer_iin)}</span>}
              </div>
            )}
            {row.owner_signed_at && (
              <div className="text-xs text-gray-400">{t.signedOwnerDatePrefix(formatDateTime(row.owner_signed_at))}</div>
            )}
            {row.client_signer_name && (
              <div className="text-xs text-gray-600 mt-2 mb-1">
                <span className="text-gray-400">{t.signedByLabel}</span>{' '}
                <span className="font-medium">{row.client_signer_name}</span>
                {row.client_signer_iin && <span className="text-gray-400"> · {t.iinPrefix(row.client_signer_iin)}</span>}
              </div>
            )}
            {row.client_signed_at && (
              <div className="text-xs text-gray-400 mb-3">{t.signedClientDatePrefix(formatDateTime(row.client_signed_at))}</div>
            )}
            <div className="flex gap-2 mt-1">
              <a href={`/api/documents/${row.id}/document`} target="_blank" rel="noreferrer"
                className="flex-1 text-center bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {t.downloadDocumentButton}
              </a>
            </div>
            {row.ddc_pdf_url && (
              <a href={`/api/documents/${row.id}/card`} target="_blank" rel="noreferrer"
                className="block text-center text-xs text-gray-400 underline mt-2">
                {t.downloadVerificationCardButton}
              </a>
            )}
          </div>
        ) : row?.status === 'awaiting_client' && mode === 'owner' ? (
          <div className="text-center py-2 text-sm text-gray-500">{t.awaitingClientStatus}</div>
        ) : (
          <button onClick={mode === 'owner' ? ownerSign : clientSign} disabled={signing}
            className="w-full bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
            {signing ? t.signingLabel : t.signButton}
          </button>
        )}
        {error && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(error)}</p>}
      </div>
    </div>
  )
}
