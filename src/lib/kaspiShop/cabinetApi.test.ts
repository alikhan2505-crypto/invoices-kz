import { describe, it, expect } from 'vitest'
import { extractPointCity } from './cabinetApi'

describe('extractPointCity', () => {
  it('extracts city id/name from a point (warehouse/destination) with a city', () => {
    expect(extractPointCity({ city: { id: 366, name: 'Алматы' } })).toEqual({ cityId: '366', cityName: 'Алматы' })
  })

  it('returns nulls when the point has no city', () => {
    expect(extractPointCity({})).toEqual({ cityId: null, cityName: null })
  })

  it('returns nulls for a null or undefined point', () => {
    expect(extractPointCity(null)).toEqual({ cityId: null, cityName: null })
    expect(extractPointCity(undefined)).toEqual({ cityId: null, cityName: null })
  })

  it('coerces a numeric city id to a string', () => {
    const result = extractPointCity({ city: { id: 30067228, name: 'Шымкент' } })
    expect(result.cityId).toBe('30067228')
    expect(typeof result.cityId).toBe('string')
  })
})
