import { describe, it, expect } from 'vitest'
import { settingsSaveErrorKind, isBlankAgentName } from './settingsSaveError'

describe('settingsSaveErrorKind', () => {
  it('maps the server name-required 400 to a dedicated message', () => {
    expect(settingsSaveErrorKind(400, 'name required')).toBe('name_required')
  })

  it('maps a foreign Kaspi store to its own message', () => {
    expect(settingsSaveErrorKind(400, 'kaspi shop not found')).toBe('kaspi_shop')
  })

  it('maps the missing-migration 409 for the Kaspi opt-out to its own message', () => {
    expect(settingsSaveErrorKind(409, 'kaspi_catalog_migration')).toBe('kaspi_migration')
  })

  it('treats 403 / admin_only as lost access', () => {
    expect(settingsSaveErrorKind(403, 'admin_only')).toBe('forbidden')
    expect(settingsSaveErrorKind(403, undefined)).toBe('forbidden')
  })

  it('treats 404 as a deleted agent', () => {
    expect(settingsSaveErrorKind(404, 'not_found')).toBe('not_found')
  })

  it('falls back to generic for validation, server and network failures', () => {
    expect(settingsSaveErrorKind(400, 'invalid tone')).toBe('generic')
    expect(settingsSaveErrorKind(500, 'duplicate key')).toBe('generic')
    expect(settingsSaveErrorKind(0, undefined)).toBe('generic')
    expect(settingsSaveErrorKind(502, { nested: true })).toBe('generic')
  })
})

describe('isBlankAgentName', () => {
  it('flags empty and whitespace-only names', () => {
    expect(isBlankAgentName('')).toBe(true)
    expect(isBlankAgentName('   ')).toBe(true)
    expect(isBlankAgentName('\n\t')).toBe(true)
  })

  it('accepts any name with visible characters, Cyrillic included', () => {
    expect(isBlankAgentName('Ассистент')).toBe(false)
    expect(isBlankAgentName('  Әйгерім  ')).toBe(false)
  })
})
