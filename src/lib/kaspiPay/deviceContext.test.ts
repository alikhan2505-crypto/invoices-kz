import { describe, it, expect } from 'vitest'
import { deriveGeoLocation, deriveClientIp } from './deviceContext'

const SAMPLE_DEVICE_IDS = Array.from({ length: 200 }, (_, i) =>
  `A1B2C3D4-0000-4000-8000-${String(i).padStart(12, '0')}`
)

describe('deriveGeoLocation', () => {
  it('is deterministic for the same deviceId', () => {
    const a = deriveGeoLocation('11111111-2222-3333-4444-555555555555')
    const b = deriveGeoLocation('11111111-2222-3333-4444-555555555555')
    expect(a).toEqual(b)
  })

  it('produces different coordinates for different deviceIds', () => {
    const a = deriveGeoLocation('11111111-2222-3333-4444-555555555555')
    const b = deriveGeoLocation('99999999-8888-7777-6666-555555555555')
    expect(a.latitude).not.toBe(b.latitude)
    expect(a.longitude).not.toBe(b.longitude)
  })

  it('keeps every derived point inside greater Almaty', () => {
    for (const deviceId of SAMPLE_DEVICE_IDS) {
      const { latitude, longitude } = deriveGeoLocation(deviceId)
      expect(latitude).toBeGreaterThan(43.15)
      expect(latitude).toBeLessThan(43.26)
      expect(longitude).toBeGreaterThan(76.84)
      expect(longitude).toBeLessThan(76.95)
    }
  })

  it('spreads connections out rather than clustering on one point', () => {
    const distinct = new Set(SAMPLE_DEVICE_IDS.map(id => JSON.stringify(deriveGeoLocation(id))))
    expect(distinct.size).toBe(SAMPLE_DEVICE_IDS.length)
  })
})

describe('deriveClientIp', () => {
  it('is deterministic for the same deviceId', () => {
    expect(deriveClientIp('11111111-2222-3333-4444-555555555555'))
      .toBe(deriveClientIp('11111111-2222-3333-4444-555555555555'))
  })

  it('always produces a valid 192.168.x.y private address', () => {
    for (const deviceId of SAMPLE_DEVICE_IDS) {
      const ip = deriveClientIp(deviceId)
      expect(ip).toMatch(/^192\.168\.\d{1,3}\.\d{1,3}$/)
      const [, , third, fourth] = ip.split('.').map(Number)
      expect(third).toBeGreaterThanOrEqual(0)
      expect(third).toBeLessThanOrEqual(255)
      // Never the network address, the .1 gateway or the .255 broadcast.
      expect(fourth).toBeGreaterThanOrEqual(2)
      expect(fourth).toBeLessThanOrEqual(254)
    }
  })

  it('does not hand every connection the same address', () => {
    const distinct = new Set(SAMPLE_DEVICE_IDS.map(deriveClientIp))
    expect(distinct.size).toBeGreaterThan(SAMPLE_DEVICE_IDS.length / 2)
  })

  it('is independent of the coordinates derived from the same deviceId', () => {
    // Two ids that happen to share an IP must still get different coordinates
    // (and vice versa) — i.e. the two derivations read different digest bytes.
    const byIp = new Map<string, string[]>()
    for (const id of SAMPLE_DEVICE_IDS) {
      const ip = deriveClientIp(id)
      byIp.set(ip, [...(byIp.get(ip) || []), id])
    }
    for (const ids of byIp.values()) {
      if (ids.length < 2) continue
      const coords = new Set(ids.map(id => JSON.stringify(deriveGeoLocation(id))))
      expect(coords.size).toBe(ids.length)
    }
  })
})
