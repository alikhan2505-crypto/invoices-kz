'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getActivePlan } from '@/lib/plan'
import { parseStatementFile, AcquiringParseError } from '@/lib/acquiringParse'
import { findMatches, AcquiringMatch, OpenInvoice } from '@/lib/acquiringMatch'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { acquiringDict } from '@/lib/i18n/acquiring'

export default function AcquiringPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = acquiringDict[lang]

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [matches, setMatches] = useState<AcquiringMatch[]>([])
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null)
  const [processing, setProcessing] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [fileName, setFileName] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    if (getActivePlan(p).canAcquiring) {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, number, client_name, client_bin, amount')
        .eq('user_id', user.id)
        .not('status', 'in', '(paid,cancelled)')
        .not('client_bin', 'is', null)
      setOpenInvoices((invoices as OpenInvoice[]) || [])
    }

    setLoading(false)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setMatches([])
    setUnmatchedCount(null)
    setFileName(file.name)
    setProcessing(true)
    try {
      const rows = await parseStatementFile(file)
      const found = findMatches(rows, openInvoices)
      setMatches(found)
      setUnmatchedCount(rows.length - new Set(found.map(m => m.row)).size)
    } catch (e: any) {
      setError(e instanceof AcquiringParseError ? t.parseErrorMessages[e.code] : (e?.message || String(e)))
    } finally {
      setProcessing(false)
    }
  }

  async function confirmPayment(match: AcquiringMatch) {
    setConfirmError('')
    setConfirmingId(match.invoice.id)
    try {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'paid' }).eq('id', match.invoice.id)
      if (updateError) {
        setConfirmError(updateError.message || 'Ошибка при обновлении статуса счета')
        return
      }
      await supabase.from('invoice_logs').insert({ invoice_id: match.invoice.id, status: 'paid' })
      // Remove every OTHER candidate match for this same statement row too — a single payment
      // can only ever settle one invoice, so once one is confirmed the other candidates for
      // that row are no longer valid options.
      setMatches(prev => prev.filter(m => m.row !== match.row))
      setOpenInvoices(prev => prev.filter(i => i.id !== match.invoice.id))
    } finally {
      setConfirmingId(null)
    }
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  const ap = getActivePlan(profile)

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.headerLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {!ap.canAcquiring ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-[#1C2056]/5 flex items-center justify-center text-xl">🏦</div>
              <div className="text-sm font-medium text-[#1C2056] flex-1">{t.headerLabel}</div>
              <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full flex-shrink-0">
                🔒 {t.proBadge}
              </span>
            </div>
            <div className="text-xs text-gray-400 mb-3">{t.proLockedHint}</div>
            <button onClick={() => router.push('/upgrade')}
              className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
              {t.goToPlansButton}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-xs text-gray-600 leading-relaxed">{t.introText}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <label className="block border-2 border-dashed border-gray-200 rounded-xl py-4 text-center cursor-pointer">
                <span className="text-sm text-[#1C2056]">
                  {fileName ? t.fileChosenLabel(fileName) : t.chooseFileButton}
                </span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onFileChange} />
              </label>
              {processing && <p className="text-xs text-gray-400 text-center mt-2">{t.processingLabel}</p>}
              {error && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(error)}</p>}
            </div>

            {openInvoices.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">{t.noOpenInvoicesHint}</p>
              </div>
            )}

            {fileName && !processing && !error && (
              <>
                <div className="text-xs text-gray-400 px-1">
                  {matches.length > 0 ? t.matchesFoundLabel(matches.length) : t.noMatchesFoundHint}
                  {unmatchedCount !== null && unmatchedCount > 0 && (
                    <span> · {t.unmatchedRowsLabel(unmatchedCount)}</span>
                  )}
                </div>

                {confirmError && <p className="text-xs text-red-500 mt-2">{t.errorPrefix(confirmError)}</p>}

                {matches.map(match => {
                  const rowMatchCount = matches.filter(m => m.row === match.row).length
                  return (
                    <div key={`${match.invoice.id}-${match.row.date}-${match.row.amount}-${match.row.description}`} className="bg-white rounded-2xl shadow-sm p-4">
                      <div className="text-sm font-medium text-[#1C2056]">{t.invoiceLabel(match.invoice.number)}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.clientLabel}: {match.invoice.client_name || '—'}</div>
                      <div className="text-xs text-gray-500">{t.amountLabel}: {Number(match.invoice.amount).toLocaleString('ru-KZ')} ₸</div>
                      {match.row.date && <div className="text-xs text-gray-400 mt-1">{t.statementDateLabel}: {match.row.date}</div>}
                      {match.row.description && <div className="text-xs text-gray-400">{t.descriptionLabel}: {match.row.description}</div>}
                      {rowMatchCount > 1 && <div className="text-xs text-amber-600 mt-1">{t.multipleMatchesHint}</div>}
                      <button onClick={() => confirmPayment(match)} disabled={confirmingId === match.invoice.id}
                        className="w-full bg-[#2DC48D] text-white rounded-xl py-2.5 text-sm font-medium mt-3">
                        {confirmingId === match.invoice.id ? t.confirmingLabel : t.confirmPaymentButton}
                      </button>
                    </div>
                  )
                })}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
