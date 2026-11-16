import { describe, it, expect, beforeEach, vi } from 'vitest'
import { hasPasskeyDevice, markPasskeyDevice } from './passkeyDeviceFlag'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) }, removeItem: k => { m.delete(k) }, clear: () => m.clear(), key: () => null, length: 0 } as Storage
}

describe('passkeyDeviceFlag', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeStorage()) })

  it('по умолчанию на устройстве Face ID не использовали; после отметки использовали', () => {
    expect(hasPasskeyDevice()).toBe(false)
    markPasskeyDevice()
    expect(hasPasskeyDevice()).toBe(true)
  })

  it('хранилище недоступно: не бросает, считается «не использовали»', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
    expect(() => markPasskeyDevice()).not.toThrow()
    expect(hasPasskeyDevice()).toBe(false)
  })
})
