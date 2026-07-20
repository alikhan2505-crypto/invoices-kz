'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { contractsDict } from '@/lib/i18n/contracts'
import SignatureSection from '@/components/SignatureSection'

export default function PublicContract() {
  const { token } = useParams()
  const { lang } = useLanguage()
  const t = contractsDict[lang]
  const [contract, setContract] = useState<any>(null)
  const [companyName, setCompanyName] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: c } = await supabase.from('contracts').select('*').eq('public_token', token).single()
      if (!c) { setLoading(false); return }
      setContract(c)

      const { data: p } = await supabase.from('profiles').select('company_name').eq('id', c.user_id).single()
      setCompanyName(p?.company_name)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  if (!contract) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">😕</div>
        <p className="text-gray-400">{t.contractNotFoundLabel}</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-[#1C2056] px-4 py-4">
        <span className="font-bold text-white text-lg">INVOICES.KZ</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">

        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="text-xs text-gray-400 mb-1">{t.fromLabel}</div>
          <div className="text-sm font-medium text-[#1C2056] mb-3">{companyName}</div>
          <div className="border-t border-gray-100 pt-3">
            <div className="text-lg font-bold text-[#1C2056]">{contract.title}</div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-xs text-gray-600 leading-relaxed">{t.publicIntro}</p>
        </div>

        <a href={contract.file_url} target="_blank" rel="noreferrer"
          className="block text-center bg-[#1C2056] text-white rounded-xl py-4 font-medium text-sm">
          {t.publicViewFileButton}
        </a>

        <SignatureSection mode="client" documentType="contract" documentId={contract.id} documentTitle={contract.title} ownerCompanyName={companyName} />

        <div className="text-center py-4">
          <a href="https://invoices.kz" className="text-xs font-medium text-[#1C2056]">INVOICES.KZ</a>
        </div>
      </div>
    </main>
  )
}
