import * as asn1js from 'asn1js'
import { ContentInfo, SignedData } from 'pkijs'

// runSigexQrSigning (src/lib/signDocument.ts) resolves a full CMS SignedData
// structure -- certificates, algorithm identifiers, an embedded RFC3161
// timestamp, AND the raw signature value all bundled together. ИС ЭСФ's
// syncInvoiceRequest wants only two things out of that bundle: the bare
// signature bytes (SignerInfo.signature, a few dozen/hundred bytes -- NOT
// the whole multi-KB CMS envelope) and the signer's own certificate
// (SignedData.certificates[0]). Both live inside the SAME blob, so one
// signing ceremony is enough -- no separate certificate-selection step.
export function extractSignatureAndCertificate(cmsSignatureBase64: string): {
  signatureBase64: string
  certificateBase64: string
} {
  const der = Buffer.from(cmsSignatureBase64, 'base64')
  const asn1 = asn1js.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength))
  if (asn1.offset === -1) throw new Error('CMS signature is not valid DER')

  const contentInfo = new ContentInfo({ schema: asn1.result })
  const signedData = new SignedData({ schema: contentInfo.content })

  if (!signedData.signerInfos?.length) throw new Error('CMS structure has no signerInfos')
  const signerInfo = signedData.signerInfos[0]
  const signatureBytes = signerInfo.signature.valueBlock.valueHex
  if (!signatureBytes || signatureBytes.byteLength === 0) throw new Error('signerInfo has no signature value')

  if (!signedData.certificates?.length) throw new Error('CMS structure has no embedded certificate')
  const certificateDer = signedData.certificates[0].toSchema().toBER(false)

  return {
    signatureBase64: Buffer.from(signatureBytes).toString('base64'),
    certificateBase64: Buffer.from(certificateDer).toString('base64'),
  }
}
