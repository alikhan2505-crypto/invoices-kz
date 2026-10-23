import { describe, it, expect } from 'vitest'
import { splitPublicProfile, toPublicInvoice, PUBLIC_INVOICE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from './publicDocument'

const future = new Date(Date.now() + 10 * 86400_000).toISOString()

describe('splitPublicProfile', () => {
  it('drops email, plan dates and is_admin from the public profile', () => {
    const { profile } = splitPublicProfile({
      company_name: 'ТОО Тест', bin_iin: '123456789012', phone: '+7', email: 'seller@example.kz',
      plan: 'pro', plan_expires_at: future, bonus_expires_at: null, trial_expires_at: null, is_admin: false,
      user_id: 'u1',
    })
    expect(profile).toEqual({ company_name: 'ТОО Тест', bin_iin: '123456789012', phone: '+7' })
  })

  it('shows the watermark for a free seller and hides it for an active plan', () => {
    expect(splitPublicProfile({ company_name: 'A', plan: 'free', is_admin: false }).showWatermark).toBe(true)
    expect(splitPublicProfile({ company_name: 'A', plan: 'pro', plan_expires_at: future, is_admin: false }).showWatermark).toBe(false)
  })

  it('hides the watermark for an admin (is_admin override) even on a lapsed plan', () => {
    expect(splitPublicProfile({ company_name: 'A', plan: 'free', is_admin: true }).showWatermark).toBe(false)
  })

  it('missing profile: no profile, watermark on', () => {
    expect(splitPublicProfile(null)).toEqual({ profile: null, showWatermark: true })
  })

  it('exposes only whitelisted columns', () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(/email|plan|is_admin|user_id/)
  })
})

describe('toPublicInvoice', () => {
  it('removes user_id and bank_id but keeps what the page renders', () => {
    const out = toPublicInvoice({ id: 'i1', number: '5', status: 'sent', user_id: 'u1', bank_id: 'b1', amount: 10 })
    expect(out).toEqual({ id: 'i1', number: '5', status: 'sent', amount: 10 })
  })

  it('column list has no wildcard or owner fields', () => {
    expect(PUBLIC_INVOICE_COLUMNS).not.toMatch(/\*|user_id|bank_id/)
  })
})
