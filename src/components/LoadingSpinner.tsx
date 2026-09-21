'use client'
import { useContext } from 'react'
import DesktopShell from '@/components/DesktopShell'
import { ShellContext } from '@/components/shellContext'

export default function LoadingSpinner() {
  const inShell = useContext(ShellContext)
  const spinner = (
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-[#1C2056] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
      <p className="text-gray-400 text-sm">Загрузка...</p>
    </div>
  )

  // Inside a product shell the loading state is the same floating card the loaded
  // page will fill, so nothing jumps and no grey rectangle flashes.
  if (inShell) {
    return (
      <DesktopShell>
        <main className="min-h-screen lg:min-h-full flex items-center justify-center">{spinner}</main>
      </DesktopShell>
    )
  }

  return <main className="min-h-screen bg-gray-50 flex items-center justify-center">{spinner}</main>
}
