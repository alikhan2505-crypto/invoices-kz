'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/date'
import { renderPdfBlob, uploadSnapshot, runSigexQrSigning, SigexQrState } from '@/lib/signDocument'
import { useLanguage } from '@/components/LanguageProvider'
import { signatureDict } from '@/lib/i18n/signature'

type Row = {
  id: string
  status: 'awaiting_owner' | 'awaiting_client' | 'signed' | 'failed'
  owner_signed_at: string | null
  client_signed_at: string | null
  ddc_pdf_url: string | null
  snapshot_pdf_url: string
}

type Props = {
  documentId: string
  documentTitle: string
} & (
  | { mode: 'owner'; getHtml: () => Promise<string> }
  | { mode: 'client' }
)

export default function SignatureSection(props: Props) {
  const { documentId, documentTitle, mode } = props
  const { lang } = useLanguage()
  const t = signatureDict[lang]

  const [row, setRow] = useState<Row | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [qr, setQr] = useState<SigexQrState | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { loadRow() }, [documentId])

  async function loadRow() {
    const { data } = await supabase
      .from('document_signatures')
      .select('id, status, owner_signed_at, client_signed_at, ddc_pdf_url, snapshot_pdf_url')
      .eq('document_type', 'invoice')
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
      const html = await props.getHtml()
      const pdfBlob = await renderPdfBlob(html)
      const snapshotPdfUrl = await uploadSnapshot(documentId, pdfBlob)

      const signatureCms = await runSigexQrSigning(documentTitle, pdfBlob, setQr)
      setQr(null)

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/signatures/owner-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ documentType: 'invoice', documentId, snapshotPdfUrl, signatureCms }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }
      await loadRow()
    } catch (e: any) {
      if (e?.canceledByUser) return
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

      const signatureCms = await runSigexQrSigning(documentTitle, pdfBlob, setQr)
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
      if (e?.canceledByUser) return
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
            <p className="text-xs text-gray-400">{t.signingLabel}</p>
          </div>
        ) : row?.status === 'signed' ? (
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#2DC48D]/10 flex items-center justify-center text-xl">✅</div>
              <div className="text-sm font-medium text-[#2DC48D]">
                {row.client_signed_at ? t.signedBothStatus : t.signedOwnerOnlyStatus}
              </div>
            </div>
            {row.owner_signed_at && (
              <div className="text-xs text-gray-400">{t.signedOwnerDatePrefix(formatDateTime(row.owner_signed_at))}</div>
            )}
            {row.client_signed_at && (
              <div className="text-xs text-gray-400 mb-3">{t.signedClientDatePrefix(formatDateTime(row.client_signed_at))}</div>
            )}
            <div className="flex gap-2 mt-1">
              <a href={row.snapshot_pdf_url} target="_blank" rel="noreferrer"
                className="flex-1 text-center bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                {t.downloadDocumentButton}
              </a>
            </div>
            {row.ddc_pdf_url && (
              <a href={row.ddc_pdf_url} target="_blank" rel="noreferrer"
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
