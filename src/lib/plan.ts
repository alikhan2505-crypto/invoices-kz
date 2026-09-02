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
  canAiAgent: boolean
  invoiceLimit: number | null
}

export function getActivePlan(profile: any): PlanInfo {
  if (!profile) return {
    plan: 'free', isTrial: false, daysLeft: null,
    label: 'Бесплатный', isActive: false,
    invoiceLimit: 3,
    canEmail: false, canSign: false, canKpAvrNakl: false,
    canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canAiAgent: false,
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
        canAiAgent: profile.plan === 'pro',
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
        canAiAgent: profile.plan === 'pro',
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
        canKpAvrNakl: false, canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canAiAgent: false,
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
        canKpAvrNakl: false, canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canAiAgent: false,
      }
    }
  }

  // 4. Free
  return {
    plan: 'free', isTrial: false, daysLeft: null, isActive: false,
    label: 'Бесплатный', invoiceLimit: 3,
    canEmail: false, canSign: false, canKpAvrNakl: false,
    canTemplates: false, canRecurring: false, canEcp: false, canAcquiring: false, canAiAgent: false,
  }
}