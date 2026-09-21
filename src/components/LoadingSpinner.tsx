'use client'
import { useContext } from 'react'
import BrandLoader from '@/components/BrandLoader'
import DesktopShell from '@/components/DesktopShell'
import { ShellContext } from '@/components/shellContext'

export default function LoadingSpinner() {
  const inShell = useContext(ShellContext)

  // Inside a product shell the loading state is the same floating card the loaded
  // page will fill, so nothing jumps and no grey rectangle flashes.
  if (inShell) {
    return (
      <DesktopShell>
        <main className="min-h-screen lg:min-h-full flex items-center justify-center"><BrandLoader /></main>
      </DesktopShell>
    )
  }

  return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><BrandLoader /></main>
}
