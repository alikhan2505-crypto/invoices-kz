import { describe, it, expect } from 'vitest'
import { isUuid } from './uuidFormat'

describe('isUuid', () => {
  it('принимает канонический uuid в любом регистре', () => {
    expect(isUuid('3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b')).toBe(true)
    expect(isUuid('3F2B8C1E-9A4D-4E6F-8B1A-0C2D3E4F5A6B')).toBe(true)
  })

  it('отклоняет мусор, который PostgREST принял бы за ошибку формата', () => {
    for (const v of ['', 'abc', 'm', '3f2b8c1e9a4d4e6f8b1a0c2d3e4f5a6b', '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6', '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6bb',
      '{3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b}', ' 3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b', '3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b\n', "x' or '1'='1"]) {
      expect(isUuid(v), JSON.stringify(v)).toBe(false)
    }
  })

  it('не строки отклоняет без исключения', () => {
    for (const v of [null, undefined, 123, {}, [], ['3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b'], true]) {
      expect(isUuid(v)).toBe(false)
    }
  })
})
