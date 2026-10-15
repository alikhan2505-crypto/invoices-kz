import { describe, it, expect } from 'vitest'
import { returnPathFromSearch, safeReturnPath, withReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it('пропускает ровно /create', () => {
    expect(safeReturnPath('/create')).toBe('/create')
  })
  it('отказывает во всём остальном', () => {
    const bad: Array<string | null | undefined> = [
      null, undefined, '', '/', '/create/', '/create?x=1', '/create#a', '/Create', ' /create',
      '//evil.example', '//evil.example/create', 'https://evil.example/create', '/\\evil.example',
      'javascript:alert(1)', '/profile', '/upgrade', '/create/../admin',
    ]
    for (const value of bad) expect(safeReturnPath(value)).toBeNull()
  })
})

describe('returnPathFromSearch', () => {
  it('читает ?next=', () => {
    expect(returnPathFromSearch('?next=%2Fcreate')).toBe('/create')
    expect(returnPathFromSearch('?foo=1&next=/create')).toBe('/create')
  })
  it('null без параметра или с чужим адресом', () => {
    expect(returnPathFromSearch('')).toBeNull()
    expect(returnPathFromSearch('?next=%2F%2Fevil.example')).toBeNull()
    expect(returnPathFromSearch('?next=https%3A%2F%2Fevil.example')).toBeNull()
  })
})

describe('withReturnPath', () => {
  it('добавляет next к адресу', () => {
    expect(withReturnPath('/profile/requisites', '/create')).toBe('/profile/requisites?next=%2Fcreate')
    expect(withReturnPath('/profile/banks?x=1', '/create')).toBe('/profile/banks?x=1&next=%2Fcreate')
  })
  it('то, что добавили, читается обратно', () => {
    const href = withReturnPath('/profile/banks', '/create')
    expect(returnPathFromSearch(href.slice(href.indexOf('?')))).toBe('/create')
  })
})
