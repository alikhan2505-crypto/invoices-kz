'use client'
import { useRouter, usePathname } from 'next/navigation'

export default function BottomNav() {
  const router = useRouter()
  const path = usePathname()

  const items = [
    { label: 'Создать', icon: '＋', href: '/dashboard' },
    { label: 'История', icon: '◷', href: '/history' },
    { label: 'Профиль', icon: '◯', href: '/profile' },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t flex max-w-lg mx-auto">
      {items.map(item => (
        <button key={item.href}
          onClick={() => router.push(item.href)}
          className={`flex-1 flex flex-col items-center py-3 gap-1 text-xs transition ${path === item.href ? 'text-[#1C2056] font-medium' : 'text-gray-400'}`}>
          <span className="text-lg">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}