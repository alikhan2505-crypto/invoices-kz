'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import ContentLoading from '@/components/ContentLoading'
import DesktopShell from '@/components/DesktopShell'
import PageHeader from '@/components/PageHeader'
import PageContainer from '@/components/PageContainer'
import type { Lang } from '@/components/LanguageProvider'

// Витрина закрыта до доработки (15.10.2026), а в меню пункты серые «скоро». Но по прямой ссылке
// /kaspi-shop/storefront открывалась полностью рабочая страница (прогон воронки 07.11, M21; решение основателя D4,
// 16.11.2026). Теперь обычному человеку страницы настроек показывают «Скоро», а админ видит рабочую страницу.
// Публичные витрины (/shop/…) не затронуты: это закрытие только страниц настроек.
// Пока неизвестно, админ ли человек, показывается загрузка, а не заглушка: админ не должен видеть её мельком.

const TEXT: Record<Lang, { soon: string; text: string; cta: string }> = {
  ru: { soon: 'Скоро', text: 'Эта часть ещё дорабатывается. Мы откроем её для всех, когда она будет готова.', cta: 'К Демпингу' },
  kk: { soon: 'Жақында', text: 'Бұл бөлім әлі дайындалуда. Дайын болған кезде оны барлығына ашамыз.', cta: 'Демпингке өту' },
  en: { soon: 'Coming soon', text: 'This part is still being finished. We will open it to everyone when it is ready.', cta: 'Back to Repricer' },
}

export default function StorefrontClosedGate({ title, children }: { title: Record<Lang, string>; children: React.ReactNode }) {
  const { lang } = useLanguage()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        // Гость: страница сама уведёт его на /login; заглушку ему показывать незачем.
        if (!session) { if (alive) setIsAdmin(true); return }
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).single()
        if (alive) setIsAdmin(!!data?.is_admin)
      } catch {
        // Не смогли узнать: честнее закрыть, чем открыть недоделанную страницу.
        if (alive) setIsAdmin(false)
      }
    })()
    return () => { alive = false }
  }, [])

  if (isAdmin === null) return <ContentLoading />
  if (isAdmin) return <>{children}</>

  const t = TEXT[lang]
  return (
    <DesktopShell>
      <main className="page-surface-in-shell min-h-screen pb-6 lg:min-h-full">
        <PageContainer variant="narrow">
          <PageHeader title={title[lang]} />
          <div className="max-w-md">
            <div className="nav-glass nav-card-accent rounded-2xl p-6 text-center">
              <h2 className="text-base font-semibold mb-1.5" style={{ color: 'var(--nav-text-primary)' }}>{t.soon}</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--nav-text-secondary)' }}>{t.text}</p>
              <Link href="/kaspi-shop" prefetch={false}
                className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 min-h-[44px] text-sm font-semibold"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{t.cta}</Link>
            </div>
          </div>
        </PageContainer>
      </main>
    </DesktopShell>
  )
}
