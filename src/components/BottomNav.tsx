'use client'
import { useRouter, usePathname } from 'next/navigation'

export default function BottomNav() {
  const router = useRouter()
  const path = usePathname()

  const items = [
    {
      label: 'Создать',
      href: '/dashboard',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="5"
            fill={active ? '#1C2056' : 'none'}
            stroke={active ? '#1C2056' : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M12 8v8M8 12h8"
            stroke={active ? 'white' : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      label: 'История',
      href: '/history',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9"
            stroke={active ? '#1C2056' : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M12 7v5l3 3"
            stroke={active ? '#1C2056' : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
    {
      label: 'Профиль',
      href: '/profile',
      icon: (active: boolean) => (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4"
            stroke={active ? '#1C2056' : '#9CA3AF'} strokeWidth="1.5"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
            stroke={active ? '#1C2056' : '#9CA3AF'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      )
    },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex z-40">
      {items.map(item => {
        const active = path === item.href
        return (
          <button key={item.href}
            onClick={() => router.push(item.href)}
            className="flex-1 flex flex-col items-center py-3 gap-1">
            {item.icon(active)}
            <span className={`text-xs transition ${active ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}