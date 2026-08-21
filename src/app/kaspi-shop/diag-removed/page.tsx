'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// TEMPORARY diagnostic page -- calls /api/kaspi-shop/diag-removed with the
// currently logged-in user's own session token, so the founder can just open
// this URL in their normal browser session. Delete alongside the API route
// once the "Сняты с продажи" investigation is done.

export default function DiagRemovedPage() {
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function run() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Не залогинены')
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/kaspi-shop/diag-removed', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const json = await res.json()
        if (!res.ok) {
          setError(`${res.status}: ${JSON.stringify(json)}`)
        } else {
          setResult(json)
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {loading && 'Загрузка...'}
      {error && <div style={{ color: 'red' }}>Ошибка: {error}</div>}
      {result != null && JSON.stringify(result, null, 2)}
    </div>
  )
}
