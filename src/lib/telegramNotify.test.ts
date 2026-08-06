import { describe, it, expect } from 'vitest'
import { parseStartToken } from './telegramNotify'

describe('parseStartToken', () => {
  it('extracts the token from a /start command', () => {
    expect(parseStartToken('/start abc123def456')).toBe('abc123def456')
  })

  it('returns null for a bare /start with no payload', () => {
    expect(parseStartToken('/start')).toBeNull()
  })

  it('returns null for a message that is not /start', () => {
    expect(parseStartToken('hello')).toBeNull()
  })

  it('returns null for /start with extra whitespace-only payload', () => {
    expect(parseStartToken('/start   ')).toBeNull()
  })

  it('ignores a bot-mention suffix Telegram sometimes adds in group chats', () => {
    expect(parseStartToken('/start@invoices_notify_bot abc123')).toBe('abc123')
  })
})
