'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { useLanguage } from '@/components/LanguageProvider'
import { cacheGet, cacheSet, cacheClear } from '@/lib/cache'
import { getActivePlan } from '@/lib/plan'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import { useMediaQuery } from '@/lib/useMediaQuery'
import Skeleton from '@/components/Skeleton'

export default function Profile() {
  const router = useRouter()
  const { theme, toggle } = useTheme()
  const { lang, setLang } = useLanguage()
  const t = profileCoreDict[lang]
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState({ clients: 0, services: 0, income: 0, invoices: 0 })
  const [chartData, setChartData] = useState<{ month: string; income: number }[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const cachedProfile = cacheGet('profile_' + user.id)
      if (cachedProfile) setProfile(cachedProfile)

      const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('clients').select('id').eq('user_id', user.id),
        supabase.from('services').select('id').eq('user_id', user.id),
        supabase.from('invoices').select('amount, status, created_at').eq('user_id', user.id),
      ])

      setProfile(p)
      if (p) cacheSet('profile_' + user.id, p)
      if (p?.is_admin) setIsAdmin(true)

      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const monthIncome = (inv || [])
        .filter((i: any) => i.status === 'paid' && i.created_at >= monthStart)
        .reduce((sum: number, i: any) => sum + Number(i.amount), 0)

      setStats({
        clients: (c || []).length,
        services: (s || []).length,
        income: monthIncome,
        invoices: (inv || []).length,
      })

      const months: { month: string; income: number }[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
        const monthTotal = (inv || [])
          .filter((inv: any) => inv.created_at >= start && inv.created_at <= end)
          .reduce((sum: number, inv: any) => sum + Number(inv.amount), 0)
        months.push({ month: d.toLocaleString('ru-KZ', { month: 'short' }), income: monthTotal })
      }
      setChartData(months)
      setLoading(false)
    }
    load()
  }, [])

  async function signOut() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) cacheClear('profile_' + user.id)
    await supabase.auth.signOut()
    router.push('/login')
  }



  if (loading && !profile) return (
    <DesktopShell>
    <main className="min-h-screen bg-gray-50 pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />
      <div className="sticky top-0 lg:top-16 z-30 bg-white border-b px-4 py-3 flex items-center justify-between lg:h-16">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
      </div>
      <div className="max-w-lg lg:max-w-5xl mx-auto p-4 space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </main>
    </DesktopShell>
  )

  const initials = profile?.company_name ? profile.company_name.slice(0, 2).toUpperCase() : 'FP'
  const activePlan = getActivePlan(profile)

  const settingsItems = [
    { icon: '⚙️', label: t.invoiceSettingsLabel, href: '/profile/settings' },
    { icon: '🔔', label: t.notificationsMenuLabel, href: '/profile/notifications' },
    { icon: '💬', label: t.supportMenuLabel, href: '/profile/support' },
    { icon: 'ℹ️', label: t.aboutMenuLabel, href: '/profile/about' },
    { icon: '🎁', label: t.referralMenuLabel, href: '/profile/referral' },
    ...(isAdmin ? [
      { icon: '🔐', label: t.adminPanelMenuLabel, href: '/admin' },
      { icon: '💬', label: t.igRepliesMenuLabel, href: '/profile/instagram-replies' },
    ] : []),
  ]

  const fadeIn = (i: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
  })

  const profileCardEl = (
    <motion.div {...fadeIn(0)} className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-[#1C2056] flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              {initials}
            </div>
            <div>
              <div className="font-semibold text-[#1C2056] text-base">{profile?.company_name || t.fillProfileLabel}</div>
              <div className="text-xs text-gray-400 mt-0.5">{profile?.bin_iin ? t.binIinPrefixLabel(profile.bin_iin) : t.noDataLabel}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            {stats.invoices === 0 ? (
              <div className="text-center py-2">
                <p className="text-sm text-gray-400 mb-3">{t.noInvoicesYetHint}</p>
                <button onClick={() => router.push('/dashboard')}
                  className="bg-[#1C2056] text-white px-4 py-2 rounded-lg text-xs font-medium">
                  {t.createFirstInvoiceButton}
                </button>
              </div>
            ) : (
              <>
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{t.incomeThisMonthLabel}</div>
            <div className="text-2xl font-bold text-[#1C2056]">{stats.income.toLocaleString('ru-KZ')} ₸</div>
            <div className="text-xs text-[#2DC48D] mt-0.5">{t.totalInvoicesLabel(stats.invoices)}</div>
              </>
            )}
            {stats.invoices > 0 && chartData.some(d => d.income > 0) && (
              <>
                <div className="mt-3 h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1C2056" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#1C2056" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip
                        formatter={(value: any) => [value.toLocaleString('ru-KZ') + ' ₸', t.chartIncomeLabel]}
                        contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      />
                      <Area type="monotone" dataKey="income" stroke="#1C2056" strokeWidth={2} fill="url(#incomeGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-between mt-1">
                  {chartData.map(d => (
                    <span key={d.month} className="text-xs text-gray-400">{d.month}</span>
                  ))}
                </div>
              </>
            )}
          </div>
    </motion.div>
  )

  const companyEl = (
    <motion.div {...fadeIn(1)}>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.companySectionLabel}</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[
              { icon: '🏢', label: t.requisitesMenuLabel, href: '/profile/requisites' },
              { icon: '🎨', label: t.signatureMenuLabel, href: '/profile/signature' },
              { icon: '💳', label: t.banksMenuLabel, href: '/profile/banks' },
              { icon: '🔒', label: t.securityMenuLabel, href: '/profile/security' },
              { icon: '🏦', label: t.acquiringMenuLabel, href: '/profile/acquiring' },
              { icon: '🔗', label: t.connectorsMenuLabel, href: '/profile/connectors' },
            ].map((item, i, arr) => (
              <div key={item.href} onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <span className="text-gray-400 text-lg">›</span>
              </div>
            ))}
          </div>
    </motion.div>
  )

  const directoriesEl = (
    <motion.div {...fadeIn(2)}>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.directoriesSectionLabel}</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {[
              { icon: '👥', label: t.clientsMenuLabel, href: '/profile/clients', badge: stats.clients },
              { icon: '📋', label: t.servicesMenuLabel, href: '/profile/services', badge: stats.services },
              { icon: '⭐', label: t.templatesMenuLabel, href: '/profile/templates', badge: 0 },
              { icon: '🗂️', label: t.documentsMenuLabel, href: '/profile/documents', badge: 0 },
              { icon: '📃', label: t.contractsMenuLabel, href: '/profile/contracts', badge: 0 },
            ].map((item, i, arr) => (
              <div key={item.href} onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.badge > 0 && <span className="text-xs text-gray-400 font-medium">{item.badge}</span>}
                  <span className="text-gray-400 text-lg">›</span>
                </div>
              </div>
            ))}
          </div>
    </motion.div>
  )

  const settingsEl = (
    <motion.div {...fadeIn(3)}>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.settingsSectionLabel}</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            {settingsItems.map((item, i, arr) => (
              <div key={item.href} onClick={() => router.push(item.href)}
                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm text-gray-800">{item.label}</span>
                </div>
                <span className="text-gray-400 text-lg">›</span>
              </div>
            ))}
          </div>
    </motion.div>
  )

  const subscriptionEl = (
    <motion.div {...fadeIn(4)}>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">{t.subscriptionSectionLabel}</div>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <div className="px-4 py-4 flex items-center justify-between cursor-pointer" onClick={() => router.push('/upgrade')}>
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {activePlan.isTrial ? '🎉' : activePlan.plan === 'pro' ? '⭐' : activePlan.plan === 'basic' ? '💼' : '🆓'}
                </span>
                <div>
                  <div className="text-sm font-medium text-[#1C2056]">{activePlan.label}</div>
                  <div className="text-xs text-gray-400">
                    {activePlan.plan === 'pro' && !activePlan.isTrial && t.proFeaturesLabel}
                    {activePlan.plan === 'basic' && !activePlan.isTrial && t.basicFeaturesLabel}
                    {activePlan.plan === 'free' && t.freeFeaturesLabel}
                    {activePlan.isTrial && t.trialFeaturesLabel}
                  </div>
                </div>
              </div>
              <span className="text-gray-400 text-lg">›</span>
            </div>

            {(profile?.plan_expires_at || profile?.bonus_expires_at || profile?.trial_expires_at) && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-2">

                {/* 1. Тарифный план */}
                {profile?.plan_expires_at && profile?.plan !== 'free' && new Date(profile.plan_expires_at) > new Date() && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">
                      {t.planActiveUntilLabel(profile.plan === 'pro' ? t.proTariffLabel : t.basicTariffLabel)}
                    </span>
                    <span className="text-[#1C2056] font-medium">
                      {new Date(profile.plan_expires_at).toLocaleDateString('ru-KZ')}
                    </span>
                  </div>
                )}

                {/* 2. Реферальный бонус — показываем дату когда закончится */}
                {profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date() && (() => {
                  const bonusDays = Math.ceil((new Date(profile.bonus_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  // Если есть активный платный план — бонус добавляется к его дате
                  let bonusEndDate: Date
                  if (profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()) {
                    bonusEndDate = new Date(profile.plan_expires_at)
                    bonusEndDate.setDate(bonusEndDate.getDate() + bonusDays)
                  } else {
                    bonusEndDate = new Date(profile.bonus_expires_at)
                  }
                  return (
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">{t.referralBonusLabel(bonusDays)}</span>
                      <span className="text-[#2DC48D] font-medium">
                        {t.untilDateLabel(bonusEndDate.toLocaleDateString('ru-KZ'))}
                      </span>
                    </div>
                  )
                })()}

                {/* 3. Пробный период — только если нет платного плана И нет бонуса И не истёк */}
                {profile?.trial_expires_at &&
                new Date(profile.trial_expires_at) > new Date() &&
                !(profile?.plan && profile.plan !== 'free' && profile?.plan_expires_at && new Date(profile.plan_expires_at) > new Date()) &&
                !(profile?.bonus_expires_at && new Date(profile.bonus_expires_at) > new Date()) && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">{t.trialUntilLabel}</span>
                    <span className="text-green-600 font-medium">
                      {new Date(profile.trial_expires_at).toLocaleDateString('ru-KZ')}
                    </span>
                  </div>
                )}

              </div>
            )}

          </div>
    </motion.div>
  )

  const themeEl = (
    <motion.div {...fadeIn(5)} className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="text-lg">{theme === 'dark' ? '🌙' : '☀️'}</span>
              <span className="text-sm text-gray-800">{theme === 'dark' ? t.darkThemeLabel : t.lightThemeLabel}</span>
            </div>
            <button onClick={toggle}
              className={`w-12 h-6 rounded-full transition-colors relative ${theme === 'dark' ? 'bg-[#1C2056]' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${theme === 'dark' ? 'left-7' : 'left-1'}`}></span>
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <span className="text-lg">🌐</span>
              <span className="text-sm text-gray-800">{t.languageSectionLabel}</span>
            </div>
            <div className="flex bg-gray-100 rounded-full p-0.5">
              <button onClick={() => setLang('ru')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${lang === 'ru' ? 'bg-[#1C2056] text-white' : 'text-gray-500'}`}>
                RU
              </button>
              <button onClick={() => setLang('kk')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${lang === 'kk' ? 'bg-[#1C2056] text-white' : 'text-gray-500'}`}>
                ҚЗ
              </button>
              <button onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${lang === 'en' ? 'bg-[#1C2056] text-white' : 'text-gray-500'}`}>
                ENG
              </button>
            </div>
          </div>
    </motion.div>
  )

  const signOutEl = (
    <motion.button {...fadeIn(6)} onClick={signOut} className="w-full bg-red-50 text-red-500 rounded-xl py-3 text-sm font-medium">
      {t.signOutButton}
    </motion.button>
  )

  return (
    <DesktopShell>
    <main className="min-h-screen bg-gray-50 pb-24 lg:pb-6 lg:min-h-full">
      <SiteNav />

      <div className="sticky top-0 lg:top-16 z-30 bg-white border-b px-4 py-3 flex items-center justify-between lg:h-16">
        <span className="font-bold text-[#1C2056]">INVOICES.KZ</span>
        <span className="text-sm text-gray-500">{profile?.company_name || ''}</span>
      </div>

      <div className="max-w-lg lg:max-w-5xl mx-auto p-4">
        {isDesktop ? (
          <div className="flex gap-6 items-start">
            <div className="flex flex-col gap-4 w-[360px] flex-shrink-0">
              {profileCardEl}
              {subscriptionEl}
              {themeEl}
              {signOutEl}
            </div>
            <div className="flex flex-col gap-4 flex-1 min-w-0">
              {companyEl}
              {directoriesEl}
              {settingsEl}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {profileCardEl}
            {companyEl}
            {directoriesEl}
            {settingsEl}
            {subscriptionEl}
            {themeEl}
            {signOutEl}
          </div>
        )}
      </div>

    </main>
    </DesktopShell>
  )
}