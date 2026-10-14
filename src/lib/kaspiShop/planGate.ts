import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'

// Server-side Pro gate for the Kaspi Bot cabinet API (/api/kaspi-shop/**).
// Every /kaspi-shop page already redirects a non-Pro user to /upgrade on the
// client, but until 2026-10-14 most API routes behind those pages only
// checked "is logged in" -- so a non-Pro user with a session token could
// call the cabinet APIs directly. Same check as the AI-агент routes
// (is_admin || canAiAgent) and the niches routes (is_admin || canKaspiShop).
//
// Usage, right after the route's own 401 check:
//   const notPro = await kaspiShopPlanGate(user.id)
//   if (notPro) return notPro
//
// NOT applied to: cron/webhook routes authenticated by
// x-kaspi-shop-cron-secret, the public pricelist XML Kaspi's crawler pulls,
// the shared-wallet routes (/api/kaspi-shop/wallet*), and the
// pause/disconnect escape hatches in settings/route.ts -- see each route.

export const KASPI_SHOP_PROFILE_COLUMNS = 'is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at'

// Same { error, errorCode } shape the ЭСФ routes use for their Pro gate
// (src/app/api/esf/*), so the client can tell "needs Pro" apart from a
// logged-out 401 without parsing Russian text.
export const KASPI_SHOP_NOT_PRO_BODY = { error: 'Kaspi Bot доступен на тарифе Про', errorCode: 'not_pro' } as const

// Pure part, unit-tested: admins always pass (getActivePlan's own admin
// override grants every flag too; the explicit is_admin is kept so this
// reads the same as every sibling gate in the codebase).
export function hasKaspiShopAccess(profile: any): boolean {
  return !!profile?.is_admin || getActivePlan(profile).canKaspiShop
}

// Created lazily, not at module load, so importing this file (e.g. from a
// unit test of hasKaspiShopAccess) doesn't need Supabase env vars.
let serviceClient: SupabaseClient | null = null
function service(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return serviceClient
}

// Returns a ready 403 response when the user may not use Kaspi Bot, or null
// when they may. A failed profile read still blocks (fail closed, like the
// niches and AI-агент gates), but as a 500 rather than "needs Pro" -- a
// paying Pro seller hitting a transient DB error shouldn't be told to buy
// the plan they already have.
export async function kaspiShopPlanGate(userId: string): Promise<NextResponse | null> {
  const { data: profile, error } = await service()
    .from('profiles')
    .select(KASPI_SHOP_PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Не удалось проверить тариф, попробуйте ещё раз' }, { status: 500 })
  if (hasKaspiShopAccess(profile)) return null
  return NextResponse.json(KASPI_SHOP_NOT_PRO_BODY, { status: 403 })
}
