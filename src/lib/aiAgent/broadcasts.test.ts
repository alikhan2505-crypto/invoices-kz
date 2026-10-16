import { describe, it, expect } from 'vitest'
import { isStaleSendingBroadcast, findRecentDuplicateBroadcast, findOlderDuplicateBroadcast, findBroadcastAfterDrop, BROADCAST_STALE_AFTER_MS, BROADCAST_DUPLICATE_WINDOW_MS, BROADCAST_MAX_DURATION_S } from './broadcasts'

const now = new Date('2026-10-15T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

describe('isStaleSendingBroadcast', () => {
  it('leaves a send that may still be running alone', () => {
    expect(isStaleSendingBroadcast({ status: 'sending', created_at: ago(60_000) }, now)).toBe(false)
    expect(isStaleSendingBroadcast({ status: 'sending', created_at: ago(BROADCAST_MAX_DURATION_S * 1000) }, now)).toBe(false)
  })

  it('marks a sending row older than the function can live as stale', () => {
    expect(isStaleSendingBroadcast({ status: 'sending', created_at: ago(BROADCAST_STALE_AFTER_MS) }, now)).toBe(true)
    expect(isStaleSendingBroadcast({ status: 'sending', created_at: ago(24 * 3600_000) }, now)).toBe(true)
  })

  it('never touches finished rows', () => {
    expect(isStaleSendingBroadcast({ status: 'done', created_at: ago(24 * 3600_000) }, now)).toBe(false)
    expect(isStaleSendingBroadcast({ status: 'failed', created_at: ago(24 * 3600_000) }, now)).toBe(false)
  })
})

describe('findRecentDuplicateBroadcast', () => {
  const row = (o: Partial<{ agent_id: string; channel: string; message: string; status: string; created_at: string }>) => ({
    agent_id: 'a1', channel: 'whatsapp', message: 'Скидка 20% до пятницы', status: 'done', created_at: ago(60_000), ...o,
  })
  const candidate = { agentId: 'a1', channel: 'whatsapp', message: 'Скидка 20% до пятницы' }

  it('catches a retry after a dropped connection (already sent or still sending)', () => {
    expect(findRecentDuplicateBroadcast(candidate, [row({})], now)).not.toBeNull()
    expect(findRecentDuplicateBroadcast(candidate, [row({ status: 'sending' })], now)).not.toBeNull()
    expect(findRecentDuplicateBroadcast({ ...candidate, message: '  Скидка 20%   до пятницы ' }, [row({})], now)).not.toBeNull()
  })

  it('allows a different text, agent or channel', () => {
    expect(findRecentDuplicateBroadcast({ ...candidate, message: 'Новинки недели' }, [row({})], now)).toBeNull()
    expect(findRecentDuplicateBroadcast({ ...candidate, agentId: 'a2' }, [row({})], now)).toBeNull()
    expect(findRecentDuplicateBroadcast({ ...candidate, channel: 'telegram' }, [row({})], now)).toBeNull()
  })

  it('allows re-sending the same text after the window, or after a failed/crashed send', () => {
    expect(findRecentDuplicateBroadcast(candidate, [row({ created_at: ago(BROADCAST_DUPLICATE_WINDOW_MS + 1000) })], now)).toBeNull()
    expect(findRecentDuplicateBroadcast(candidate, [row({ status: 'failed' })], now)).toBeNull()
  })
})

describe('findOlderDuplicateBroadcast (race-safe re-check after insert)', () => {
  const row = (id: string, createdMsAgo: number, extra: Partial<{ status: string; message: string; channel: string; agent_id: string }> = {}) => ({
    id, agent_id: 'a1', channel: 'telegram', message: 'Скидка 10%', status: 'sending', created_at: ago(createdMsAgo), ...extra,
  })

  it('cancels the newer of two identical concurrent broadcasts, keeps the older', () => {
    const older = row('b-older', 2000)
    const newer = row('a-newer', 1000)
    const list = [newer, older]
    expect(findOlderDuplicateBroadcast(newer, list, now)?.id).toBe('b-older')
    expect(findOlderDuplicateBroadcast(older, list, now)).toBeNull()
  })

  it('breaks an exact timestamp tie by id, so exactly one of the two proceeds', () => {
    const x = row('x', 1000)
    const y = row('y', 1000)
    const list = [x, y]
    expect(findOlderDuplicateBroadcast(x, list, now)).toBeNull()
    expect(findOlderDuplicateBroadcast(y, list, now)?.id).toBe('x')
  })

  it('ignores older rows with another text, channel or a failed status', () => {
    const own = row('own', 1000)
    const list = [own, row('o1', 2000, { message: 'Другой текст' }), row('o2', 2000, { channel: 'whatsapp' }), row('o3', 2000, { status: 'failed' })]
    expect(findOlderDuplicateBroadcast(own, list, now)).toBeNull()
  })

  it('returns null when its own row is not in the list', () => {
    expect(findOlderDuplicateBroadcast({ id: 'missing', created_at: ago(1000) }, [row('o', 2000)], now)).toBeNull()
  })
})

describe('findBroadcastAfterDrop', () => {
  const item = (extra: Partial<{ status: string; message: string; createdAt: string }> = {}) => ({
    id: 'b1', agentId: 'a1', channel: 'telegram', message: 'Скидка 10%', status: 'sending', createdAt: ago(30_000), ...extra,
  })
  const candidate = { agentId: 'a1', channel: 'telegram', message: '  Скидка   10% ' }

  it('finds a sending or done row with the same text', () => {
    expect(findBroadcastAfterDrop(candidate, [item()], now)?.id).toBe('b1')
    expect(findBroadcastAfterDrop(candidate, [item({ status: 'done' })], now)?.id).toBe('b1')
  })

  it('does not count failed, old or different broadcasts', () => {
    expect(findBroadcastAfterDrop(candidate, [item({ status: 'failed' })], now)).toBeNull()
    expect(findBroadcastAfterDrop(candidate, [item({ createdAt: ago(BROADCAST_DUPLICATE_WINDOW_MS + 1000) })], now)).toBeNull()
    expect(findBroadcastAfterDrop(candidate, [item({ message: 'Другое' })], now)).toBeNull()
    expect(findBroadcastAfterDrop(candidate, [], now)).toBeNull()
  })
})
