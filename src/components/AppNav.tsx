'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'

const labels: Record<'ru' | 'kk' | 'en', { create: string; history: string; profile: string; kaspiShop: string }> = {
  ru: { create: 'Создать', history: 'История', profile: 'Профиль', kaspiShop: 'Kaspi Магазин' },
  kk: { create: 'Жасау', history: 'Тарих', profile: 'Профиль', kaspiShop: 'Kaspi Дүкені' },
  en: { create: 'Create', history: 'History', profile: 'Profile', kaspiShop: 'Kaspi Shop' },
}

export default function AppNav({ desktopOnly = false }: { desktopOnly?: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [unpaid, setUnpaid] = useState(0)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoLoaded, setLogoLoaded] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function loadUnpaid() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['sent', 'overdue'])
      setUnpaid(count || 0)
    }
    loadUnpaid()
  }, [path])

  useEffect(() => {
    async function loadLogo() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLogoLoaded(true); return }
      const { data } = await supabase.from('profiles').select('logo_url, is_admin').eq('id', user.id).single()
      setLogoUrl(data?.logo_url || null)
      setIsAdmin(!!data?.is_admin)
      setLogoLoaded(true)
    }
    loadLogo()
  }, [])

  // `invert` is only ever true for the sidebar's active pill (solid navy bg) — mobile
  // rendering always passes `active` alone (invert defaults false) so its colors are
  // untouched from the original BottomNav.
  const items = [
    {
      label: labels[lang].create,
      href: '/dashboard',
      icon: (active: boolean, invert = false) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5"
            fill={active ? (invert ? 'white' : '#1C2056') : 'none'}
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M12 8v8M8 12h8"
            stroke={active ? (invert ? '#1C2056' : 'white') : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      label: labels[lang].history,
      href: '/history',
      badge: unpaid,
      icon: (active: boolean, invert = false) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M12 7v5l3 3"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      label: labels[lang].profile,
      href: '/profile',
      icon: (active: boolean, invert = false) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    // Kaspi Shop is a brand-new, still-being-verified feature -- admin-only
    // for now so existing customers don't stumble into it before it's ready
    // to open up. Remove this gate once the feature is ready for everyone
    // (the design's original intent was to show it to all users as a
    // cross-sell bridge between the two customer segments).
    ...(isAdmin ? [{
      label: labels[lang].kaspiShop,
      href: '/kaspi-shop',
      icon: (active: boolean, invert = false) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 8h16l-1.5 10a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 8Z"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M8 8V6a4 4 0 0 1 8 0v2"
            stroke={active ? (invert ? 'white' : '#1C2056') : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    }] : []),
  ]

  const activeIndex = items.findIndex(i => path === i.href)

  return (
    <>
      {/* Mobile: bottom bar — identical markup/classes to the old BottomNav, just gated to < lg */}
      {!desktopOnly && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex z-40">
          {items.map(item => {
            const active = path === item.href
            return (
              <button key={item.href}
                onClick={() => router.push(item.href)}
                className="flex-1 flex flex-col items-center py-3 gap-1 relative">
                <div className="relative">
                  {item.icon(active)}
                  {item.badge && item.badge > 0 ? (
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                      {item.badge > 9 ? '9+' : item.badge}
                    </div>
                  ) : null}
                </div>
                <span className={`text-xs transition ${active ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Desktop: left sidebar — a standalone floating rounded card, always fixed to the viewport
          (never moves on scroll), with the app mark pinned top and nav centered below it */}
      <div className="hidden lg:flex fixed left-3 top-3 bottom-3 w-[120px] bg-white rounded-[28px] shadow-2xl ring-1 ring-black/5 flex-col items-center py-6 z-40">
        <div className="relative w-[88px] h-[88px] flex-shrink-0">
          <AnimatePresence>
            {logoLoaded && (
              logoUrl ? (
                <motion.img
                  key="logo"
                  src={logoUrl}
                  alt=""
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 w-full h-full rounded-2xl object-contain bg-white ring-1 ring-black/5"
                />
              ) : (
                <motion.div
                  key="fallback"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-0 w-full h-full rounded-2xl bg-[#1C2056] flex items-center justify-center text-white font-bold text-2xl"
                >
                  IK
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1" />

        <div className="relative w-full flex flex-col items-center gap-6">
          {activeIndex >= 0 && (
            <motion.div
              className="absolute w-20 h-16 rounded-2xl bg-[#1C2056]"
              layoutId="appnav-active-indicator"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
              style={{ top: activeIndex * 88 }}
            />
          )}
          {items.map(item => {
            const active = path === item.href
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className="group relative w-20 h-16 rounded-2xl flex flex-col items-center justify-center gap-1.5 z-10">
                <span className="transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110">
                  {item.icon(active, true)}
                </span>
                <span className={`text-xs leading-none whitespace-nowrap ${active ? 'text-white font-medium' : 'text-gray-400'}`}>
                  {item.label}
                </span>
                {item.badge && item.badge > 0 ? (
                  <div className="absolute top-1 right-3 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex-1" />
      </div>
    </>
  )
}
