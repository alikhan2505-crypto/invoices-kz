'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import PageHeader from '@/components/PageHeader'
import Skeleton from '@/components/Skeleton'
import { contractsDict } from '@/lib/i18n/contracts'
import { getActivePlan } from '@/lib/plan'
import SignatureSection from '@/components/SignatureSection'

export default function ContractPage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = contractsDict[lang]

  const [contract, setContract] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  // Бакет с договорами закрыт для браузера (src/lib/signedDocuments.ts):
  // короткую подписанную ссылку на файл выдаёт сервер, проверив владельца.
  async function getFileUrl(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/contracts/${encodeURIComponent(String(id))}/file`, {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.url) throw new Error(t.fileUnavailableError)
    return json.url as string
  }

  async function openFile() {
    // Окно открывается синхронно, прямо в клике — иначе после await
    // браузер посчитает его всплывающим и заблокирует.
    const win = window.open('', '_blank')
    try {
      const url = await getFileUrl()
      if (win) win.location.href = url
      else window.location.href = url
    } catch (e: any) {
      win?.close()
      alert(e?.message || t.fileUnavailableError)
    }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: c } = await supabase.from('contracts').select('*').eq('id', id).single()
    setContract(c)

    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(p)

    setLoading(false)
  }

  if (loading) return (
    <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
      <PageHeader title={<Skeleton className="h-6 w-40" />} backHref="/profile/contracts" animate={false} />
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  )

  if (!contract) return (
    <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
      <PageHeader title={t.headerLabel} backHref="/profile/contracts" animate={false} />
      <p className="text-sm text-center py-10" style={{ color: 'var(--nav-text-muted)' }}>{t.contractNotFoundLabel}</p>
    </div>
  )

  return (
    <div className="max-w-lg lg:max-w-2xl mx-auto p-4">
      <PageHeader title={contract.title} backHref="/profile/contracts" />

      <div className="space-y-4">

        <div className="nav-glass nav-card-accent rounded-2xl p-5">
          <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.createdLabel(formatDate(contract.created_at, lang))}</div>
          <div className="text-lg font-bold" style={{ color: 'var(--nav-text-primary)' }}>{contract.title}</div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.clientLabel}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{contract.client_name || t.noClientLabel}</div>
            {contract.client_email && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{contract.client_email}</div>}
          </div>
        </div>

        <button type="button" onClick={openFile}
          className="nav-glass block w-full text-center rounded-xl min-h-[48px] py-3.5 text-sm font-medium transition-colors hover:bg-[var(--nav-surface-glass)]"
          style={{ color: 'var(--nav-text-primary)' }}>
          {t.viewFileButton}
        </button>

        {profile?.is_admin || getActivePlan(profile).canEcp ? (
        <SignatureSection
          mode="owner"
          documentType="contract"
          documentId={contract.id}
          documentTitle={contract.title}
          ownerCompanyName={profile?.company_name}
          getPdfUrl={getFileUrl}
        />
        ) : (
        <div className="nav-glass rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </div>
            <div className="text-sm font-medium flex-1" style={{ color: 'var(--nav-text-primary)' }}>{t.ecpSectionLabel}</div>
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              {t.proBadge}
            </span>
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>{t.proLockedHint}</div>
          <button onClick={() => router.push('/upgrade')}
            className="w-full rounded-xl min-h-[44px] py-2.5 text-sm font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {t.goToPlansButton}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
