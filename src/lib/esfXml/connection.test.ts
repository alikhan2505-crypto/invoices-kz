import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockUpsert = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockSingle,
          }),
        }),
      }),
      upsert: mockUpsert,
    }),
  }),
}))

import { loadEsfConnectionByUserId, saveEsfConnection, EsfConnectionSecretsError } from './connection'
import { decryptAtRest } from '@/lib/kaspiPay/crypto'

describe('loadEsfConnectionByUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ESF_SESSION_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex, valid AES-256 key for tests
  })

  it('returns null when no connection row exists', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    const result = await loadEsfConnectionByUserId('user-1')
    expect(result).toBeNull()
  })

  it('throws on a real query error rather than treating it as "no connection"', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    await expect(loadEsfConnectionByUserId('user-1')).rejects.toThrow('connection refused')
  })

  it('throws EsfConnectionSecretsError when the stored ciphertext cannot be decrypted', async () => {
    mockSingle.mockResolvedValue({
      data: { user_id: 'user-1', login: '123456789021', password_enc: 'not-valid-ciphertext', vat_certificate_num: null, vat_certificate_series: null, auth_certificate_base64: null },
      error: null,
    })
    await expect(loadEsfConnectionByUserId('user-1')).rejects.toThrow(EsfConnectionSecretsError)
  })
})

describe('saveEsfConnection', () => {
  const key = 'a'.repeat(64) // 32 bytes hex, valid AES-256 key for tests

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ESF_SESSION_ENCRYPTION_KEY = key
  })

  it('upserts an encrypted row with the expected shape and onConflict target', async () => {
    mockUpsert.mockResolvedValue({ error: null })

    const before = Date.now()
    await saveEsfConnection('user-1', '123456789021', 'super-secret-password', '123456789', '01', 'ZmFrZS1jZXJ0LWRlcg==')
    const after = Date.now()

    expect(mockUpsert).toHaveBeenCalledTimes(1)
    const [row, options] = mockUpsert.mock.calls[0]

    expect(options).toEqual({ onConflict: 'user_id' })

    expect(row.user_id).toBe('user-1')
    expect(row.login).toBe('123456789021')
    expect(row.vat_certificate_num).toBe('123456789')
    expect(row.vat_certificate_series).toBe('01')
    // Unencrypted -- a public certificate, unlike password_enc below.
    expect(row.auth_certificate_base64).toBe('ZmFrZS1jZXJ0LWRlcg==')
    expect(row.status).toBe('active')

    // password must be encrypted, never stored in plaintext, and must
    // round-trip back to the original via the same key/algorithm the
    // read path uses.
    expect(row.password_enc).not.toBe('super-secret-password')
    expect(typeof row.password_enc).toBe('string')
    expect(decryptAtRest(row.password_enc, key).toString('utf8')).toBe('super-secret-password')

    // updated_at is a fresh ISO timestamp
    const updatedAtMs = new Date(row.updated_at).getTime()
    expect(updatedAtMs).toBeGreaterThanOrEqual(before)
    expect(updatedAtMs).toBeLessThanOrEqual(after)
  })

  it('throws when the upsert returns a Supabase error', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'duplicate key value' } })

    await expect(
      saveEsfConnection('user-1', '123456789021', 'super-secret-password', null, null, null)
    ).rejects.toThrow('duplicate key value')
  })
})
