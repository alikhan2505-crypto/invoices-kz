import { getActivePlan, parseDbTimestamp } from './plan'

// Решение «что показать в Про-разделе» (17.10.2026) -- чистая функция, чтобы её
// можно было проверить тестом и не размазывать по страницам. До этого Free
// молча перебрасывало на /upgrade с каждой страницы Kaspi Bot, уже после
// того, как человек видел меню и заставку.
//   allow  -- пускаем (Про или админ);
//   upsell -- обычная стена «Доступно на тарифе Про»;
//   lapsed -- Про был и закончился: «Продлите Про».
export type ProGateState = 'allow' | 'upsell' | 'lapsed'

// Был ли у человека платный план, который уже закончился. Бессрочный план
// (plan_expires_at пуст) не истекает. Админ не «истекает» никогда.
export function lapsedPaidPlan(profile: any, now: Date = new Date()): 'pro' | 'basic' | null {
  if (!profile || profile.is_admin) return null
  const plan = profile.plan
  if (plan !== 'pro' && plan !== 'basic') return null
  const end = parseDbTimestamp(profile.plan_expires_at)
  if (!end || end > now) return null
  return plan
}

export function kaspiShopGateState(profile: any, now: Date = new Date()): ProGateState {
  if (getActivePlan(profile, now).canKaspiShop) return 'allow'
  return lapsedPaidPlan(profile, now) === 'pro' ? 'lapsed' : 'upsell'
}
