'use client'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/LanguageProvider'
import { miscDict } from '@/lib/i18n/misc'

export default function NotFound() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = miscDict[lang]

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-8xl font-bold text-[#1C2056] mb-4">404</div>
        <div className="text-xl font-semibold text-[#1C2056] mb-2">{t.notFoundTitle}</div>
        <p className="text-gray-400 text-sm mb-8">
          {t.notFoundBody}
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-[#1C2056] text-white px-8 py-3 rounded-xl text-sm font-medium">
          {t.goHomeButton}
        </button>
      </div>
    </main>
  )
}