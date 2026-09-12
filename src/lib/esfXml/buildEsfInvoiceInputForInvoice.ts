import { createClient } from '@supabase/supabase-js'
import { EsfInvoiceInput } from './buildInvoiceXml'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EsfInvoiceLine = EsfInvoiceInput['lines'][number]

// Shared by /api/esf/prepare and /api/esf/submit so both build byte-for-byte
// the same EsfInvoiceInput from the same (invoiceId, lines) pair -- prepare
// returns the XML for the browser to sign, submit rebuilds it independently
// rather than trusting anything the client echoes back about invoice content.
export async function buildEsfInvoiceInputForInvoice(
  userId: string,
  invoiceId: string,
  lines: EsfInvoiceLine[],
  // Computed once by /api/esf/prepare and threaded through to /api/esf/submit
  // so both routes build byte-for-byte the same XML even if the live
  // SIGEX/eGov signing ceremony in between straddles midnight (that ceremony
  // has a multi-minute timeout -- see ESF_SIGNING_TIMEOUT_MS in
  // src/app/invoice/[id]/page.tsx). Defaults to computing fresh so existing
  // callers/tests that don't pass it are unaffected.
  dateOverride?: string
): Promise<{ input: EsfInvoiceInput; invoice: any } | { error: string; errorCode: string; status: number }> {
  // profiles has no `legal_address` column -- `address` is the field this
  // app actually stores and reads everywhere else (see buildProfile() in
  // src/app/invoice/[id]/page.tsx).
  const { data: profile } = await supabase.from('profiles').select('company_name, bin_iin, address, bank_name, bik, iik, kbe').eq('id', userId).maybeSingle()
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoiceId).eq('user_id', userId).maybeSingle()
  if (!invoice) return { error: 'Счёт не найден', errorCode: 'invoice_not_found', status: 404 }

  const { loadEsfConnectionByUserId } = await import('./connection')
  const connection = await loadEsfConnectionByUserId(userId)
  if (!connection) return { error: 'ЭСФ не подключён', errorCode: 'not_connected', status: 400 }

  const dateStr = dateOverride || (() => {
    const today = new Date()
    return `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`
  })()

  const input: EsfInvoiceInput = {
    num: String(invoice.number).replace(/\D/g, '') || '1',
    date: dateStr,
    turnoverDate: dateStr,
    operatorFullname: profile?.company_name || 'invoices.kz',
    seller: {
      name: profile?.company_name || '',
      tin: profile?.bin_iin || '',
      address: profile?.address || undefined,
      bank: profile?.bank_name || undefined,
      bik: profile?.bik || undefined,
      iik: profile?.iik || undefined,
      kbe: profile?.kbe || undefined,
      vatCertificateNum: connection.vatCertificateNum,
      vatCertificateSeries: connection.vatCertificateSeries,
    },
    customer: {
      name: invoice.client_name || '',
      tin: invoice.client_bin || '',
      address: invoice.client_address || undefined,
      countryCode: 'KZ',
    },
    lines,
  }

  return { input, invoice }
}
