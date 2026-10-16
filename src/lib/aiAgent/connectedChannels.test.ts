import { describe, it, expect } from 'vitest'
import { summarizeConnections } from './connectedChannels'

describe('summarizeConnections', () => {
  it('shows a WhatsApp-only agent as connected (used to read «Канал не подключён»)', () => {
    expect(summarizeConnections([
      { channel: 'whatsapp', external_account_name: '+7 701 123 45 67', status: 'active' },
    ])).toEqual([{ channel: 'whatsapp', account: '+7 701 123 45 67', state: 'ok' }])
  })

  it('lists every connected channel in a fixed order', () => {
    const result = summarizeConnections([
      { channel: 'api', external_account_name: null, status: 'active' },
      { channel: 'telegram', external_account_name: 'shop_bot', status: 'active' },
      { channel: 'website', external_account_name: null, status: 'active' },
      { channel: 'instagram', external_account_name: 'myshop', status: 'active' },
      { channel: 'whatsapp', external_account_name: null, status: 'active' },
    ])
    expect(result.map(r => r.channel)).toEqual(['whatsapp', 'instagram', 'telegram', 'website', 'api'])
    expect(result.find(r => r.channel === 'instagram')?.account).toBe('@myshop')
    expect(result.find(r => r.channel === 'telegram')?.account).toBe('@shop_bot')
    // WhatsApp connected before the number was stored: no account, still ok.
    expect(result.find(r => r.channel === 'whatsapp')?.account).toBeNull()
    expect(result.find(r => r.channel === 'website')?.account).toBeNull()
    expect(result.find(r => r.channel === 'api')?.account).toBeNull()
  })

  it('does not double the @ when the stored name already has one', () => {
    expect(summarizeConnections([
      { channel: 'telegram', external_account_name: '@shop_bot', status: 'active' },
    ])[0].account).toBe('@shop_bot')
  })

  it('marks an expired token as needing a reconnect', () => {
    expect(summarizeConnections([
      { channel: 'instagram', external_account_name: 'myshop', status: 'token_expired' },
    ])).toEqual([{ channel: 'instagram', account: '@myshop', state: 'reconnect' }])
  })

  it('prefers the working row when a channel has both', () => {
    expect(summarizeConnections([
      { channel: 'instagram', external_account_name: 'old', status: 'token_expired' },
      { channel: 'instagram', external_account_name: 'new', status: 'active' },
    ])).toEqual([{ channel: 'instagram', account: '@new', state: 'ok' }])
  })

  it('ignores unknown channels and statuses, and returns [] when nothing is connected', () => {
    expect(summarizeConnections([])).toEqual([])
    expect(summarizeConnections([
      { channel: 'fax', external_account_name: 'x', status: 'active' },
      { channel: 'whatsapp', external_account_name: '+7', status: 'disconnected' },
    ])).toEqual([])
  })
})
