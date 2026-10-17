import { describe, it, expect } from 'vitest'
import { kaspiShopGateState, lapsedPaidPlan } from './proGate'

const now = new Date('2026-10-17T12:00:00Z')

describe('kaspiShopGateState', () => {
  it('пускает админа при любом тарифе', () => {
    expect(kaspiShopGateState({ is_admin: true, plan: 'free' }, now)).toBe('allow')
    expect(kaspiShopGateState({ is_admin: true, plan: 'pro', plan_expires_at: '2020-01-01T00:00:00' }, now)).toBe('allow')
  })
  it('пускает активный Про, в том числе бессрочный', () => {
    expect(kaspiShopGateState({ plan: 'pro', plan_expires_at: '2026-12-01T00:00:00' }, now)).toBe('allow')
    expect(kaspiShopGateState({ plan: 'pro', plan_expires_at: null }, now)).toBe('allow')
  })
  it('Free и отсутствие профиля -- обычная стена', () => {
    expect(kaspiShopGateState({ plan: 'free' }, now)).toBe('upsell')
    expect(kaspiShopGateState(null, now)).toBe('upsell')
  })
  it('Базовый, пробный и бонус не открывают Kaspi Bot', () => {
    expect(kaspiShopGateState({ plan: 'basic', plan_expires_at: '2026-12-01T00:00:00' }, now)).toBe('upsell')
    expect(kaspiShopGateState({ plan: 'free', trial_expires_at: '2026-10-20T00:00:00Z' }, now)).toBe('upsell')
    expect(kaspiShopGateState({ plan: 'free', bonus_expires_at: '2026-10-20T00:00:00' }, now)).toBe('upsell')
  })
  it('закончившийся Про -- вариант «Продлите»', () => {
    expect(kaspiShopGateState({ plan: 'pro', plan_expires_at: '2026-10-01T00:00:00' }, now)).toBe('lapsed')
  })
  it('закончившийся Базовый -- обычная стена, не «Про истёк»', () => {
    expect(kaspiShopGateState({ plan: 'basic', plan_expires_at: '2026-10-01T00:00:00' }, now)).toBe('upsell')
  })
  it('время без смещения читается как UTC: последние часы Про ещё открыты', () => {
    expect(kaspiShopGateState({ plan: 'pro', plan_expires_at: '2026-10-17T13:00:00' }, now)).toBe('allow')
    expect(kaspiShopGateState({ plan: 'pro', plan_expires_at: '2026-10-17T11:00:00' }, now)).toBe('lapsed')
  })
})

describe('lapsedPaidPlan', () => {
  it('различает Про и Базовый, не трогает Free, бессрочный и админа', () => {
    expect(lapsedPaidPlan({ plan: 'pro', plan_expires_at: '2026-01-01T00:00:00' }, now)).toBe('pro')
    expect(lapsedPaidPlan({ plan: 'basic', plan_expires_at: '2026-01-01T00:00:00' }, now)).toBe('basic')
    expect(lapsedPaidPlan({ plan: 'free', plan_expires_at: '2026-01-01T00:00:00' }, now)).toBeNull()
    expect(lapsedPaidPlan({ plan: 'pro', plan_expires_at: null }, now)).toBeNull()
    expect(lapsedPaidPlan({ is_admin: true, plan: 'pro', plan_expires_at: '2026-01-01T00:00:00' }, now)).toBeNull()
    expect(lapsedPaidPlan(null, now)).toBeNull()
  })
})

import { localizePlanLabel } from './i18n/utilityBar'

describe('localizePlanLabel', () => {
  it('переводит подписи тарифа и не трогает русский', () => {
    expect(localizePlanLabel('Бесплатный', 'ru')).toBe('Бесплатный')
    expect(localizePlanLabel('Бесплатный', 'kk')).toBe('Тегін')
    expect(localizePlanLabel('Про', 'en')).toBe('Pro')
    expect(localizePlanLabel('Базовый', 'kk')).toBe('Базалық')
    expect(localizePlanLabel('Пробный (5 дн.)', 'en')).toBe('Trial (5 d)')
    expect(localizePlanLabel('Бонус (3 дн.)', 'kk')).toBe('Бонус (3 күн)')
    expect(localizePlanLabel('что-то новое', 'en')).toBe('что-то новое')
  })
})
