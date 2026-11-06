'use client'

// Сообщает аналитике, что новая страница уже на экране: только после этого PostHog может
// включить запись сессии (routeCommitted в src/lib/analytics/posthogClient.ts).
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { routeCommitted } from '@/lib/analytics/posthogClient'

export default function AnalyticsRouteSync() {
  const pathname = usePathname()
  useEffect(() => {
    routeCommitted(pathname)
  }, [pathname])
  return null
}
