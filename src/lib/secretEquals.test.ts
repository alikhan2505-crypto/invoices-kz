import { describe, it, expect } from 'vitest'
import { secretEquals } from './secretEquals'

describe('secretEquals', () => {
  it('одинаковые строки равны, разные нет', () => {
    expect(secretEquals('s3cret-value', 's3cret-value')).toBe(true)
    expect(secretEquals('s3cret-value', 's3cret-valuE')).toBe(false)
    expect(secretEquals('s3cret', 's3cret-value')).toBe(false)
    expect(secretEquals('s3cret-value-and-more', 's3cret-value')).toBe(false)
  })

  it('пустое или незаданное значение с любой стороны - всегда «нет» (незаданная переменная окружения никого не пускает)', () => {
    expect(secretEquals(undefined, undefined)).toBe(false)
    expect(secretEquals(null, null)).toBe(false)
    expect(secretEquals('', '')).toBe(false)
    expect(secretEquals('x', undefined)).toBe(false)
    expect(secretEquals(undefined, 'x')).toBe(false)
    expect(secretEquals('undefined', undefined)).toBe(false)
    expect(secretEquals('', 'x')).toBe(false)
  })

  it('работает с не-ASCII и очень длинными строками', () => {
    expect(secretEquals('секрет-Ө-Ү', 'секрет-Ө-Ү')).toBe(true)
    expect(secretEquals('секрет-Ө-Ү', 'секрет-Ө-Ұ')).toBe(false)
    const long = 'a'.repeat(100_000)
    expect(secretEquals(long, long)).toBe(true)
    expect(secretEquals(long, long + 'b')).toBe(false)
  })

  it('пробел в конце - уже другая строка', () => {
    expect(secretEquals('abc ', 'abc')).toBe(false)
  })
})
