import { describe, it, expect } from 'vitest'
import { pendingUpgradeFromSearch } from './pendingUpgrade'

describe('pendingUpgradeFromSearch', () => {
  it('accepts a valid plan+period pair', () => {
    expect(pendingUpgradeFromSearch('?plan=pro&period=annual')).toEqual({ plan: 'pro', period: 'annual' })
    expect(pendingUpgradeFromSearch('?plan=basic&period=monthly')).toEqual({ plan: 'basic', period: 'monthly' })
  })
  it('rejects unknown values or a missing half of the pair', () => {
    expect(pendingUpgradeFromSearch('?plan=enterprise&period=monthly')).toBeNull()
    expect(pendingUpgradeFromSearch('?plan=pro&period=weekly')).toBeNull()
    expect(pendingUpgradeFromSearch('?plan=pro')).toBeNull()
    expect(pendingUpgradeFromSearch('')).toBeNull()
  })
})
