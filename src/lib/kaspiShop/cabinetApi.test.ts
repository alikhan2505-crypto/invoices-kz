import { describe, it, expect } from 'vitest'
import { extractDestinationCity } from './cabinetApi'

describe('extractDestinationCity', () => {
  it('extracts city id/name from a destination with a city', () => {
    expect(extractDestinationCity({ city: { id: 366, name: 'Алматы' } })).toEqual({ cityId: '366', cityName: 'Алматы' })
  })

  it('returns nulls when destination has no city', () => {
    expect(extractDestinationCity({})).toEqual({ cityId: null, cityName: null })
  })

  it('returns nulls for a null or undefined destination', () => {
    expect(extractDestinationCity(null)).toEqual({ cityId: null, cityName: null })
    expect(extractDestinationCity(undefined)).toEqual({ cityId: null, cityName: null })
  })

  it('coerces a numeric city id to a string', () => {
    const result = extractDestinationCity({ city: { id: 30067228, name: 'Шымкент' } })
    expect(result.cityId).toBe('30067228')
    expect(typeof result.cityId).toBe('string')
  })
})
