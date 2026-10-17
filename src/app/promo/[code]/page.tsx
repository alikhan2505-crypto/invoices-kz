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
    // useParams может отдать массив; в адрес код идёт закодированным, иначе
    // спецсимвол (&, #, пробел) ломает параметр promo.
    const segment = Array.isArray(code) ? code[0] : code
    // useParams отдаёт сегмент как есть (%26 остаётся %26) -- сначала
    // раскодируем, потом кодируем один раз, иначе получится %2526.
    let raw = segment
    try { raw = segment ? decodeURIComponent(segment) : segment } catch { /* битая последовательность: берём как есть */ }
    if (raw) {
      try { localStorage.setItem('promo_code', raw) } catch { /* private mode */ }
    }
    router.push('/login?promo=' + encodeURIComponent(raw ?? ''))
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