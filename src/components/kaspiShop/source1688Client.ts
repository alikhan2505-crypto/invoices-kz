'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { canUseSource1688 } from '@/lib/kaspiShop/source1688'

// Общее для кнопки на карточках ниш, панели в калькуляторе маржи и выбора из топа продаж
// (этап 0, 30.10.2026): запрос к /api/kaspi-shop/niches/source-1688 и проверка админ-гейта.

export interface Source1688Product {
  name: string
  price: number
  brand?: string | null
  category?: string | null
  imageUrl?: string | null
}

export interface Source1688Data {
  queries: { zh: string; ru: string; url: string }[]
  weightGrams: number | null
  risks: { key: string; text: string }[]
  marginHref: string
}

export type Source1688Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; data: Source1688Data }

export async function fetchSource1688(product: Source1688Product): Promise<Source1688Phase> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/kaspi-shop/niches/source-1688', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ name: product.name, price: product.price, brand: product.brand ?? '', category: product.category ?? '' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { kind: 'error', message: typeof body?.error === 'string' ? body.error : 'Не получилось подобрать запросы' }
    return { kind: 'done', data: body as Source1688Data }
  } catch {
    return { kind: 'error', message: 'Не получилось подобрать запросы — проверьте интернет и попробуйте ещё раз' }
  }
}

// Профиль читается один раз на вкладку: десятки кнопок на странице не плодят запросов.
let adminPromise: Promise<boolean> | null = null
function readIsAdmin(): Promise<boolean> {
  if (!adminPromise) {
    adminPromise = (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return false
        const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
        return data?.is_admin === true
      } catch {
        return false
      }
    })()
  }
  return adminPromise
}

/** Можно ли этому посетителю видеть функцию (пока включён админ-гейт: только админу). */
export function useSource1688Access(): boolean {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    let cancelled = false
    void readIsAdmin().then(a => { if (!cancelled) setOk(canUseSource1688(a)) })
    return () => { cancelled = true }
  }, [])
  return ok
}
