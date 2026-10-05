export interface PlanInfo {
  plan: string
  isTrial: boolean
  daysLeft: number | null
  label: string
  isActive: boolean
  canEmail: boolean
  canSign: boolean
  canKpAvrNakl: boolean
  canTemplates: boolean
  canRecurring: boolean
  canEcp: boolean
  canAcquiring: boolean
  canEsf: boolean
  canAiAgent: boolean
  canKaspiShop: boolean
  invoiceLimit: number | null
}

// is_admin is a platform-level override, independent of billing state -- an
// admin account (the founder's own testing accounts, or one explicitly
// granted to someone like a family member helping test the product) must
// never be blocked by a lapsed plan/trial/bonus. The server already enforces
// this (enforce_invoice_limit() returns NEW immediately for is_admin_user()),
// but every browser-side gate derived from getActivePlan() needs the same
// exemption -- and scattering `!profile?.is_admin && !getActivePlan(...).canX`
// across dozens of call sites has already let the real bug through three
// times in one day (dashboard tiles, /create's invoice-limit gate, the PDF
// signature/ЭЦП/templates gates) because it is too easy to add a new
// `.canX` check and forget the admin guard next to it. Centralizing it here
// means every current and future caller is correct by construction. The
// underlying plan/label/daysLeft/isTrial are left as computed (so an admin
// who is also a real paying customer still sees their own real status),
// only the capability flags and limits are forced open.
function withAdminOverride(profile: any, result: PlanInfo): PlanInfo {
  if (!profile?.is_admin) return result
  return {
    ...result,
    isActive: true,
    invoiceLimit: null,
    canEmail: true, canSign: true, canKpAvrNakl: true, canTemplates: true,
    canRecurring: true, canEcp: true, canAcquiring: true, canEsf: true,
    canAiAgent: true, canKaspiShop: true,
  }
}

export function getActivePlan(profile: any): PlanInfo {
  return withAdminOverride(profile, computeActivePlan(profile))
}

function computeActivePlan(profile: any): PlanInfo {
  if (!profile) return {
    plan: 'free', isTrial: false, daysLeft: null,
    label: 'Бесплатный', isActive: false,
    invoiceLimit: 3,
    canEmail: false, canSign: false, canKpAvrNakl: false,
    canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canEsf: false, canAiAgent: false, canKaspiShop: false,
  }

  const now = new Date()

  // 1. Платный план
  if (profile.plan && profile.plan !== 'free') {
    if (!profile.plan_expires_at) {
      return {
        plan: profile.plan, isTrial: false, daysLeft: null, isActive: true,
        label: profile.plan === 'pro' ? 'Про' : 'Базовый',
        invoiceLimit: profile.plan === 'pro' ? null : 30,
        canEmail: true, canSign: true,
        canKpAvrNakl: profile.plan === 'pro',
        canTemplates: profile.plan === 'pro',
        canRecurring: profile.plan === 'pro',
        canEcp: profile.plan === 'pro',
        canAcquiring: profile.plan === 'pro',
        canEsf: profile.plan === 'pro',
        canAiAgent: profile.plan === 'pro',
        canKaspiShop: profile.plan === 'pro',
      }
    }
    const planEnd = new Date(profile.plan_expires_at)
    if (planEnd > now) {
      const daysLeft = Math.ceil((planEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        plan: profile.plan, isTrial: false, daysLeft, isActive: true,
        label: profile.plan === 'pro' ? 'Про' : 'Базовый',
        invoiceLimit: profile.plan === 'pro' ? null : 30,
        canEmail: true, canSign: true,
        canKpAvrNakl: profile.plan === 'pro',
        canTemplates: profile.plan === 'pro',
        canRecurring: profile.plan === 'pro',
        canEcp: profile.plan === 'pro',
        canAcquiring: profile.plan === 'pro',
        canEsf: profile.plan === 'pro',
        canAiAgent: profile.plan === 'pro',
        canKaspiShop: profile.plan === 'pro',
      }
    }
  }

  // 2. Бонусные дни = Базовый
  if (profile.bonus_expires_at) {
    const bonusEnd = new Date(profile.bonus_expires_at)
    if (bonusEnd > now) {
      const daysLeft = Math.ceil((bonusEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        plan: 'basic', isTrial: false, daysLeft, isActive: true,
        label: `Бонус (${daysLeft} дн.)`,
        invoiceLimit: 30,
        canEmail: true, canSign: true,
        canKpAvrNakl: false, canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canEsf: false, canAiAgent: false, canKaspiShop: false,
      }
    }
  }

  // 3. Пробный период = Базовый (10 счетов за 7 дней)
  if (profile.trial_expires_at) {
    const trialEnd = new Date(profile.trial_expires_at)
    if (trialEnd > now) {
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        plan: 'basic', isTrial: true, daysLeft, isActive: true,
        label: `Пробный (${daysLeft} дн.)`,
        invoiceLimit: 10,
        canEmail: true, canSign: true,
        canKpAvrNakl: false, canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canEsf: false, canAiAgent: false, canKaspiShop: false,
      }
    }
  }

  // 4. Free
  return {
    plan: 'free', isTrial: false, daysLeft: null, isActive: false,
    label: 'Бесплатный', invoiceLimit: 3,
    canEmail: false, canSign: false, canKpAvrNakl: false,
    canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canEsf: false, canAiAgent: false, canKaspiShop: false,
  }
}