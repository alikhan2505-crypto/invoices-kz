'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { contractsDict } from '@/lib/i18n/contracts'
import SignatureSection from '@/components/SignatureSection'

export default function ContractPage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = contractsDict[lang]

  const [contract, setContract] = useState<any>(null)
  const [companyName, setCompanyName] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: c } = await supabase.from('contracts').select('*').eq('id', id).single()
    setContract(c)

    const { data: p } = await supabase.from('profiles').select('company_name').eq('id', user.id).single()
    setCompanyName(p?.company_name)

    setLoading(false)
  }

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  if (!contract) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.contractNotFoundLabel}</p>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile/contracts')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056] truncate">{contract.title}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-1">{t.createdLabel(formatDate(contract.created_at))}</div>
          <div className="text-lg font-bold text-[#1C2056]">{contract.title}</div>
          <div className="border-t border-gray-100 mt-3 pt-3">
            <div className="text-xs text-gray-400 mb-1">{t.clientLabel}</div>
            <div className="text-sm font-medium text-[#1C2056]">{contract.client_name || t.noClientLabel}</div>
            {contract.client_email && <div className="text-xs text-gray-400">{contract.client_email}</div>}
          </div>
        </div>

        <a href={contract.file_url} target="_blank" rel="noreferrer"
          className="block text-center bg-white shadow-sm rounded-xl py-3.5 text-sm font-medium text-[#1C2056]">
          {t.viewFileButton}
        </a>

        <SignatureSection
          mode="owner"
          documentType="contract"
          documentId={contract.id}
          documentTitle={contract.title}
          ownerCompanyName={companyName}
          getPdfUrl={async () => contract.file_url}
        />
      </div>
    </main>
  )
}
