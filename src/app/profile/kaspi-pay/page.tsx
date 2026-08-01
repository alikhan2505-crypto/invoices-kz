'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KaspiPayRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/profile/acquiring') }, [router])
  return null
}
