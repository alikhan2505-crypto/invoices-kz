'use client'
import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { miscDict } from '@/lib/i18n/misc'

export default function PromoPage() {
  const router = useRouter()
  const { code } = useParams()
  const { lang } = useLanguage()
  const t = miscDict[lang]

  useEffect(() => {
    if (code) {
      localStorage.setItem('promo_code', code as string)
    }
    router.push('/login?promo=' + code)
  }, [])

  return (
    <main className="min-h-screen bg-[#1C2056] flex items-center justify-center">
      <div className="text-center">
        <div className="text-3xl font-bold text-white mb-2">INVOICES.KZ</div>
        <div className="text-[#2DC48D] text-sm">{t.applyingPromoLabel}</div>
      </div>
    </main>
  )
}