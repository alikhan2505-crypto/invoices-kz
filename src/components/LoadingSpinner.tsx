'use client'
import { useContext } from 'react'
import BrandLoader from '@/components/BrandLoader'
import DesktopShell from '@/components/DesktopShell'
import { ShellContext } from '@/components/shellContext'

export default function LoadingSpinner() {
  const inShell = useContext(ShellContext)

  // Inside a product shell the loading state is the same floating card the loaded
  // page will fill, so nothing jumps and no grey rectangle flashes. The <main> has no
  // height or centring of its own: .brand-loader-wrap (brand-loader.css) fills the work
  // area and centres the plate exactly like ContentLoading does, so swapping one loader
  // for the other does not move the plate.
  if (inShell) {
    return (
      <DesktopShell>
        <main><BrandLoader /></main>
      </DesktopShell>
    )
  }

  return <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--nav-bg)' }}><BrandLoader /></main>
}
