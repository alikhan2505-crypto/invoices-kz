import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getPrintShopOwnerUserId } from './ownerAccount'

describe('getPrintShopOwnerUserId', () => {
  const ORIGINAL = process.env.PRINT_SHOP_OWNER_USER_ID

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.PRINT_SHOP_OWNER_USER_ID
    else process.env.PRINT_SHOP_OWNER_USER_ID = ORIGINAL
  })

  it('returns the configured id', () => {
    process.env.PRINT_SHOP_OWNER_USER_ID = '11111111-1111-1111-1111-111111111111'
    expect(getPrintShopOwnerUserId()).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('throws a clear error when not configured', () => {
    delete process.env.PRINT_SHOP_OWNER_USER_ID
    expect(() => getPrintShopOwnerUserId()).toThrow(/PRINT_SHOP_OWNER_USER_ID/)
  })
})
