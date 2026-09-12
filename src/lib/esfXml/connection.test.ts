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

import { loadEsfConnectionByUserId, EsfConnectionSecretsError } from './connection'

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
      data: { user_id: 'user-1', login: '123456789021', password_enc: 'not-valid-ciphertext', vat_certificate_num: null, vat_certificate_series: null },
      error: null,
    })
    await expect(loadEsfConnectionByUserId('user-1')).rejects.toThrow(EsfConnectionSecretsError)
  })
})
