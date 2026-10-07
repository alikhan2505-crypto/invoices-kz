'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { useEffectivePath } from '@/lib/useEffectivePath'
import { bootstrapWorkspace, loadWorkspace, type Workspace } from '@/lib/cfo/data'
import FirstAccountWizard from './FirstAccountWizard'
import { CfoPage, Card, PrimaryButton } from './ui'

type Ctx = { ws: Workspace; reload: () => Promise<void> }
const CfoContext = createContext<Ctx | null>(null)

export function useCfo(): Ctx {
  const v = useContext(CfoContext)
  if (!v) throw new Error('useCfo must be used inside CfoWorkspace')
  return v
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; ws: Workspace }

export default function CfoWorkspace({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const path = useEffectivePath()
  const [state, setState] = useState<State>({ status: 'loading' })
  const ids = useRef<{ companyId: string; userId: string } | null>(null)

  const init = useCallback(async () => {
    setState({ status: 'loading' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPostLoginRedirect('/cfo/overview')
      router.replace('/login')
      return
    }
    // Ворота на время ревью founder'а: продукт adminOnly. Открытие для всех —
    // убрать эту проверку (данные и так видны только владельцу через RLS).
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) {
      router.replace('/products')
      return
    }
    try {
      const companyId = await bootstrapWorkspace()
      ids.current = { companyId, userId: user.id }
      setState({ status: 'ready', ws: await loadWorkspace(companyId, user.id) })
    } catch (e) {
      setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [router])

  useEffect(() => { void init() }, [init])

  const reload = useCallback(async () => {
    if (!ids.current) return
    const ws = await loadWorkspace(ids.current.companyId, ids.current.userId)
    setState({ status: 'ready', ws })
  }, [])

  if (state.status === 'loading') return <LoadingSpinner />
  if (state.status === 'error') {
    return (
      <CfoPage title="CFO">
        <Card>
          <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>Не удалось загрузить данные: {state.message}</p>
          <PrimaryButton type="button" onClick={() => void init()}>Повторить</PrimaryButton>
        </Card>
      </CfoPage>
    )
  }

  const needsAccount = state.ws.accounts.filter((a) => !a.archived).length === 0 && !path.startsWith('/cfo/settings')
  return (
    <CfoContext.Provider value={{ ws: state.ws, reload }}>
      {needsAccount ? <FirstAccountWizard /> : children}
    </CfoContext.Provider>
  )
}
