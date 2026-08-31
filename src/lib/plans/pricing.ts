// Single source of truth for plan prices. Amounts must ONLY ever be computed
// here, server-side -- never accepted from the client (a client-supplied
// amount would let anyone activate Pro for 1 tenge). Annual prices are
// "10 months for the price of 12" (~2 months free), not a separate discount
// mechanism -- see docs/superpowers/specs/2026-08-30-pricing-section-annual-billing-design.md.
export const PLAN_PRICES = {
  basic: { monthly: 2990, annual: 29900 },
  pro: { monthly: 5990, annual: 59900 },
} as const

export type PlanKey = keyof typeof PLAN_PRICES
export type BillingPeriod = 'monthly' | 'annual'

export function getPlanAmount(plan: PlanKey, period: BillingPeriod): number {
  return PLAN_PRICES[plan][period]
}
