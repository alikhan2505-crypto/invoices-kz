import { describe, it, expect } from 'vitest'
import { isVisibleInDialog, VISIBLE_IN_DIALOG_FILTER } from './dialogVisibility'

describe('isVisibleInDialog', () => {
  it('shows every inbound message and sent outbound replies', () => {
    expect(isVisibleInDialog({ direction: 'inbound', status: 'sent' })).toBe(true)
    expect(isVisibleInDialog({ direction: 'inbound', status: null })).toBe(true)
    expect(isVisibleInDialog({ direction: 'outbound', status: 'sent' })).toBe(true)
  })

  it('hides rejected and still-pending drafts the customer never received', () => {
    expect(isVisibleInDialog({ direction: 'outbound', status: 'skipped' })).toBe(false)
    expect(isVisibleInDialog({ direction: 'outbound', status: 'pending_review' })).toBe(false)
  })

  it('keeps the PostgREST filter in sync with the predicate', () => {
    expect(VISIBLE_IN_DIALOG_FILTER).toBe('direction.eq.inbound,status.eq.sent')
  })
})
