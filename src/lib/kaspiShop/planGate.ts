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
// The repricer cron, the pricelist XML and the public storefront check the
// connection OWNER instead (no session there) -- see the owner-side helpers
// at the bottom of this file.

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

// ---------------------------------------------------------------------------
// Owner-side gate for things that run WITHOUT the seller logged in
// (founder decisions 3+4, 14.10.2026): the background repricer and the
// public storefront / price-list XML. When the connection owner's Pro lapses
// they simply stop -- nothing is deleted or flipped (enabled/paused/published
// stay as the seller left them), so renewing Pro resumes everything on its
// own. Same rule as the cabinet gate above: hasKaspiShopAccess.

// Pure, unit-tested: keeps the items whose owner has a profile that passes
// hasKaspiShopAccess. An owner missing from the map (no profile row) is
// dropped -- fail closed, same as hasKaspiShopAccess(null).
export function filterByOwnerAccess<T>(
  items: T[],
  ownerIdOf: (item: T) => string | null | undefined,
  profilesById: Map<string, any>
): T[] {
  return items.filter(item => {
    const ownerId = ownerIdOf(item)
    return !!ownerId && hasKaspiShopAccess(profilesById.get(ownerId))
  })
}

// Postgrest puts .in() values in the URL -- chunked so a large batch can't
// blow the URL length. Distinct owners per cycle are few, so usually one call.
const OWNER_PROFILE_CHUNK = 200

// Loads the plan columns for every distinct owner id, keyed by id. Throws on
// a read error: callers decide how to fail closed (the repricer's due list
// fails the run loudly; the public routes answer "unavailable").
export async function loadOwnerPlanProfiles(userIds: (string | null | undefined)[]): Promise<Map<string, any>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)))
  const byId = new Map<string, any>()
  for (let i = 0; i < ids.length; i += OWNER_PROFILE_CHUNK) {
    const chunk = ids.slice(i, i + OWNER_PROFILE_CHUNK)
    const { data, error } = await service()
      .from('profiles')
      .select(`id, ${KASPI_SHOP_PROFILE_COLUMNS}`)
      .in('id', chunk)
    if (error) throw new Error(`owner plan profiles lookup failed: ${error.message}`)
    for (const row of (data || []) as any[]) byId.set(row.id, row)
  }
  return byId
}

// Single-owner variant for the public storefront / price-list routes.
// Throws on a read error (see loadOwnerPlanProfiles).
export async function ownerHasKaspiShopAccess(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await service()
    .from('profiles')
    .select(KASPI_SHOP_PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(`owner plan lookup failed for ${userId}: ${error.message}`)
  return hasKaspiShopAccess(data)
}

// Pure, unit-tested: whose plan decides for a tracked product. The
// CONNECTION owner wins (that's the seller who pays for Kaspi Bot), falling
// back to the product row's own user_id for a row whose connection join came
// back empty -- the same rule the repricer's due list uses (checkCycle.ts).
// Accepts the joined connection as an object or a one-element array, since
// PostgREST's embed shape depends on how the FK is declared.
export function trackedProductOwnerId(row: any): string | null {
  const conn = Array.isArray(row?.kaspi_shop_connections) ? row.kaspi_shop_connections[0] : row?.kaspi_shop_connections
  return conn?.user_id ?? row?.user_id ?? null
}
