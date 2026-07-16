'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from './LanguageProvider'

const labels: Record<'ru' | 'kk' | 'en', { create: string; history: string; profile: string }> = {
  ru: { create: 'Создать', history: 'История', profile: 'Профиль' },
  kk: { create: 'Жасау', history: 'Тарих', profile: 'Профиль' },
  en: { create: 'Create', history: 'History', profile: 'Profile' },
}

export default function AppNav({ desktopOnly = false }: { desktopOnly?: boolean }) {
  const router = useRouter()
  const path = usePathname()
  const { lang } = useLanguage()
  const [unpaid, setUnpaid] = useState(0)

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

      {/* Desktop: left sidebar with an animated sliding active-indicator */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-20 bg-white border-r flex-col items-center py-6 gap-2 z-40">
        <div className="relative w-full flex flex-col items-center gap-2">
          {activeIndex >= 0 && (
            <motion.div
              className="absolute w-12 h-12 rounded-2xl bg-[#1C2056]"
              layoutId="appnav-active-indicator"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.35 }}
              style={{ top: activeIndex * 56 }}
            />
          )}
          {items.map(item => {
            const active = path === item.href
            return (
              <button key={item.href} onClick={() => router.push(item.href)}
                className="relative w-12 h-12 rounded-2xl flex items-center justify-center z-10">
                {item.icon(active, true)}
                {item.badge && item.badge > 0 ? (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-medium">
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
