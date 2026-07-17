'use client'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel } from '@/lib/a11yLabels'
import { profileContentDict } from '@/lib/i18n/profileContent'

const BUILD_DATE = new Date().toLocaleDateString('ru-KZ', {
  day: 'numeric', month: 'long', year: 'numeric'
})

export default function About() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileContentDict[lang]

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel(lang)}>‹</button>
        <span className="font-semibold text-[#1C2056]">{t.aboutHeaderLabel}</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-[#1C2056] rounded-2xl p-8 text-center">
          <div className="text-3xl font-bold text-white mb-1">INVOICES.KZ</div>
          <div className="text-white/60 text-sm mb-4">{t.appTaglineLabel}</div>
          <div className="flex items-center justify-center gap-2">
            <div className="inline-block bg-white/10 text-white/80 text-xs px-3 py-1.5 rounded-full">
              {t.versionLabel}
            </div>
            <div className="inline-block bg-[#2DC48D]/20 text-[#2DC48D] text-xs px-3 py-1.5 rounded-full">
              {t.updatedLabel(BUILD_DATE)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {[
            { label: t.websiteLabel, value: 'invoices.kz', action: () => window.open('https://invoices.kz', '_blank') },
            { label: t.supportLabel, value: 'Telegram', action: () => window.open('https://t.me/invoiceskz_support', '_blank') },
            { label: t.emailLabel, value: 'support@invoices.kz', action: () => window.open('mailto:support@invoices.kz') },
          ].map((item, i, arr) => (
            <div key={item.label}
              onClick={item.action}
              className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className="text-sm text-gray-500">{item.label}</span>
              <span className="text-sm text-[#1C2056] font-medium">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-xs text-gray-400 uppercase tracking-wide">{t.documentsSectionLabel}</div>
          {[
            { label: t.privacyPolicyLabel, href: '/privacy' },
            { label: t.termsOfUseLabel, href: '/terms' },
          ].map((item, i, arr) => (
            <div key={item.label}
              onClick={() => router.push(item.href)}
              className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <span className="text-sm text-gray-800">{item.label}</span>
              <span className="text-gray-400 text-lg">›</span>
            </div>
          ))}
        </div>

        <div className="text-center py-4">
          <div className="text-2xl mb-2">🇰🇿</div>
          <div className="text-xs text-gray-400">{t.madeInKazakhstanLabel}</div>
          <div className="text-xs text-gray-400 mt-1">{t.copyrightLabel}</div>
        </div>
      </div>
    </main>
  )
}