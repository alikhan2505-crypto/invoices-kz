'use client'
import { useEffect, useState } from 'react'
import { mightHaveStoredSession } from '@/lib/hasStoredSession'
import { canUsePersonCheck } from '@/lib/personCheck/config'

// Можно ли этому посетителю видеть вкладку «Физлицо · СБ»: пока включён админ-гейт
// (src/lib/personCheck/config.ts) только вошедшему админу. Начинает с «нельзя» и на
// сервере, и в первом клиентском рендере (страница статическая: иначе расхождение
// при гидрации), потом переключается. supabase-js грузится, только если в браузере
// есть сохранённая сессия: анонимы (почти весь поисковый трафик) его не скачивают.
// Это лишь скрытие вкладки: настоящая проверка прав живёт в /api/person-check.
export function usePersonCheckAccess(): boolean {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!mightHaveStoredSession()) return
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled || !session) return
        // Своя строка: RLS разрешает. Любая ошибка = не админ (вкладка скрыта).
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
        if (!cancelled) setAllowed(canUsePersonCheck(data?.is_admin === true))
      } catch {
        if (!cancelled) setAllowed(false)
      }
    })()
    return () => { cancelled = true }
  }, [])
  return allowed
}
