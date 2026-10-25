'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/date'
import { useLanguage } from '@/components/LanguageProvider'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import { ProGateBanner, useProGateText } from '@/components/ProGate'
import Skeleton from '@/components/Skeleton'
import { contractsDict } from '@/lib/i18n/contracts'
import { getActivePlan } from '@/lib/plan'
import SignatureSection from '@/components/SignatureSection'

export default function ContractPage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const t = contractsDict[lang]
  const proGateText = useProGateText()

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
    <PageContainer>
      <PageHeader title={<Skeleton className="h-6 w-40" />} backHref="/profile/contracts" animate={false} />
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </PageContainer>
  )

  if (!contract) return (
    <PageContainer>
      <PageHeader title={t.headerLabel} backHref="/profile/contracts" animate={false} />
      <p className="text-sm text-center py-10" style={{ color: 'var(--nav-text-muted)' }}>{t.contractNotFoundLabel}</p>
    </PageContainer>
  )

  return (
    <PageContainer>
      <PageHeader title={contract.title} backHref="/profile/contracts" />

      <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-4 xl:items-start">

        <div className="space-y-4">
        <div className="nav-glass nav-card-accent rounded-2xl p-5">
          <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.createdLabel(formatDate(contract.created_at, lang))}</div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--nav-border-soft)' }}>
            <div className="text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>{t.clientLabel}</div>
            <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{contract.client_name || t.noClientLabel}</div>
            {contract.client_email && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{contract.client_email}</div>}
          </div>
        </div>

        <button type="button" onClick={openFile}
          className="nav-glass flex items-center justify-center gap-2 w-full rounded-xl min-h-[48px] py-3.5 text-sm font-semibold transition-colors hover:bg-[var(--nav-surface-glass)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nav-accent-track)]"
          style={{ color: 'var(--nav-accent)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /></svg>
          {t.viewFileButton}
        </button>
        </div>

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
        <ProGateBanner
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>}
          title={proGateText.title}
          badge={t.proBadge}
          description={t.ecpProOnlyNote}
        />
        )}
      </div>
    </PageContainer>
  )
}
