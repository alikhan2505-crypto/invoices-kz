'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { formatDateTime } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import { verifyDict } from '@/lib/i18n/verify'

type VerifyData = {
  sigexDocumentId: string
  documentTitle: string | null
  companyName: string | null
  ownerSignerName: string | null
  ownerSignerIin: string | null
  ownerSignedAt: string | null
  clientSignerName: string | null
  clientSignerIin: string | null
  clientSignedAt: string | null
  documentUrl: string
  cardUrl: string
}

export default function VerifyPage() {
  const { sigexId } = useParams()
  const { lang } = useLanguage()
  const t = verifyDict[lang]

  const [data, setData] = useState<VerifyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/documents/verify/${sigexId}`)
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [sigexId])

  if (loading) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">{t.loadingLabel}</p>
    </main>
  )

  if (notFound || !data) return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-4xl mb-3">😕</div>
        <p className="font-medium text-[#1C2056] mb-1">{t.notFoundTitle}</p>
        <p className="text-sm text-gray-400">{t.notFoundBody}</p>
      </div>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-[#1C2056] px-4 py-4">
        <span className="font-bold text-white text-lg">INVOICES.KZ</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#2DC48D]/10 flex items-center justify-center text-3xl mb-3">✅</div>
          <div className="font-semibold text-[#1C2056] mb-1">{t.pageTitle}</div>
          {data.documentTitle && (
            <div className="text-sm text-gray-500 mb-2">{t.documentLabel(data.documentTitle)}</div>
          )}
          <p className="text-xs text-gray-400 leading-relaxed">{t.intro}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t.codeLabel}</div>
          <div className="text-sm font-mono text-[#1C2056] mb-4 break-all">{data.sigexDocumentId}</div>

          {data.ownerSignerName && (
            <div className="mb-3">
              <div className="text-xs text-gray-600">
                <span className="text-gray-400">{t.signedByLabel}</span>{' '}
                <span className="font-medium">{data.ownerSignerName}</span>
                {data.companyName && <span>, {t.onBehalfOfPrefix(data.companyName)}</span>}
                {data.ownerSignerIin && <span className="text-gray-400"> · {t.iinPrefix(data.ownerSignerIin)}</span>}
              </div>
              {data.ownerSignedAt && (
                <div className="text-xs text-gray-400">{t.ownerSignedPrefix(formatDateTime(data.ownerSignedAt))}</div>
              )}
            </div>
          )}

          {data.clientSignerName && (
            <div>
              <div className="text-xs text-gray-600">
                <span className="text-gray-400">{t.signedByLabel}</span>{' '}
                <span className="font-medium">{data.clientSignerName}</span>
                {data.clientSignerIin && <span className="text-gray-400"> · {t.iinPrefix(data.clientSignerIin)}</span>}
              </div>
              {data.clientSignedAt && (
                <div className="text-xs text-gray-400">{t.clientSignedPrefix(formatDateTime(data.clientSignedAt))}</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <a href={data.documentUrl} target="_blank" rel="noreferrer"
            className="block text-center bg-[#1C2056] text-white rounded-xl py-3 text-sm font-medium">
            {t.downloadDocumentButton}
          </a>
          <a href={data.cardUrl} target="_blank" rel="noreferrer"
            className="block text-center border border-[#1C2056] text-[#1C2056] rounded-xl py-3 text-sm font-medium">
            {t.downloadCardButton}
          </a>
        </div>
      </div>
    </main>
  )
}
