'use client'
import html2pdf from 'html2pdf.js'
import { QRSigningClientCMS } from 'sigex-qr-signing-client'
import { supabase } from './supabase'

// Renders the same HTML `generateInvoicePDF()` produces into a real PDF Blob
// (client-side, via html2canvas+jsPDF under the hood) instead of opening the
// usual popup-window print flow — needed here because signing requires the
// exact bytes as a Blob, not a browser "save as" dialog. Pass the HTML with
// `autoPrint: true` from the caller so it comes back without the on-screen
// toolbar/buttons baked in.
//
// html2pdf's `.from(htmlString)` runs the string through DOMPurify, which —
// unless told otherwise — treats it as a body fragment and silently drops
// everything that only makes sense in <head> (our whole <style> block),
// producing an unstyled, "ugly" PDF with no colors/borders/spacing. Parsing
// it ourselves with DOMParser (a real, unsanitized HTML parse) and handing
// html2pdf a DOM element instead of a string skips DOMPurify entirely, since
// `.from(element)` never sanitizes its input.
export async function renderPdfBlob(html: string): Promise<Blob> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const root = parsed.body.cloneNode(true) as HTMLElement
  parsed.querySelectorAll('style').forEach(style => {
    root.insertBefore(style.cloneNode(true), root.firstChild)
  })

  const result = await html2pdf()
    .set({
      margin: 0,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(root)
    .outputPdf('blob')
  return result as Blob
}

export async function uploadSnapshot(documentId: string, blob: Blob): Promise<string> {
  const path = `${documentId}/${Date.now()}-snapshot.pdf`
  const { error } = await supabase.storage
    .from('signed-documents')
    .upload(path, blob, { contentType: 'application/pdf' })
  if (error) throw error
  return supabase.storage.from('signed-documents').getPublicUrl(path).data.publicUrl
}

export type SigexQrState = {
  qrImage: string
  mobileLink: string | null
  businessLink: string | null
}

// Runs the full SIGEX QR/eGov mobile signing ceremony for a PDF blob.
// Resolves once the phone-side signature has actually been completed —
// `onQrReady` fires as soon as the QR code is available so the caller can
// display it while this promise is still pending.
export async function runSigexQrSigning(
  title: string,
  pdfBlob: Blob,
  onQrReady: (state: SigexQrState) => void
): Promise<string> {
  const client = new QRSigningClientCMS(title, false)
  await client.addDataToSign([title], pdfBlob, [], true)
  await client.registerQRSinging()

  onQrReady({
    qrImage: client.getQR() || '',
    mobileLink: client.getEGovMobileLaunchLink(),
    businessLink: client.getEGovBusinessLaunchLink(),
  })

  const signatures = await client.getSignatures()
  return signatures[0]
}
