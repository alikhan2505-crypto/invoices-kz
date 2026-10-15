import { getActivePlan } from '@/lib/plan'

// Pure half of the Kaspi Bot plan gate (see ./planGate.ts), split out so
// browser code can import it without pulling next/server and the
// service-role Supabase client into the bundle -- e.g. the free /tools/margin
// page deciding whether a signed-in visitor's «Открыть кабинет» goes to
// /kaspi-shop or to the Kaspi Bot landing. planGate.ts re-exports both.

export const KASPI_SHOP_PROFILE_COLUMNS = 'is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at'

// Admins always pass (getActivePlan's own admin override grants every flag
// too; the explicit is_admin is kept so this reads the same as every sibling
// gate in the codebase).
export function hasKaspiShopAccess(profile: unknown): boolean {
  return !!(profile as { is_admin?: unknown } | null | undefined)?.is_admin || getActivePlan(profile).canKaspiShop
}
