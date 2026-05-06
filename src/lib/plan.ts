// Возвращает актуальный план пользователя с учётом всех дат
export function getActivePlan(profile: any): {
  plan: string
  isTrial: boolean
  daysLeft: number | null
  label: string
} {
  if (!profile) return { plan: 'free', isTrial: false, daysLeft: null, label: 'Бесплатный' }

  const now = new Date()

  // 1. Проверяем пробный период (7 дней)
  if (profile.trial_expires_at) {
    const trialEnd = new Date(profile.trial_expires_at)
    if (trialEnd > now) {
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return { plan: 'pro', isTrial: true, daysLeft, label: `Пробный период (${daysLeft} дн.)` }
    }
  }

  // 2. Проверяем платный план
  if (profile.plan && profile.plan !== 'free') {
    if (profile.plan_expires_at) {
      const planEnd = new Date(profile.plan_expires_at)
      if (planEnd > now) {
        const daysLeft = Math.ceil((planEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        return { plan: profile.plan, isTrial: false, daysLeft, label: profile.plan === 'pro' ? 'Про' : 'Базовый' }
      }
      // Платный план закончился — проверяем бонус
    } else {
      // Нет даты окончания — план бессрочный (ручная активация)
      return { plan: profile.plan, isTrial: false, daysLeft: null, label: profile.plan === 'pro' ? 'Про' : 'Базовый' }
    }
  }

  // 3. Платный план закончился — проверяем бонусные дни
  if (profile.bonus_expires_at) {
    const bonusEnd = new Date(profile.bonus_expires_at)
    if (bonusEnd > now) {
      const daysLeft = Math.ceil((bonusEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return { plan: 'basic', isTrial: false, daysLeft, label: `Бонус (${daysLeft} дн.)` }
    }
  }

  // 4. Всё закончилось — Free
  return { plan: 'free', isTrial: false, daysLeft: null, label: 'Бесплатный' }
}