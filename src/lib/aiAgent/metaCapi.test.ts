import { describe, it, expect } from 'vitest'
import { buildLeadEventPayload } from './metaCapi'

describe('buildLeadEventPayload', () => {
  it('matches the exact Meta Conversions API schema for business_messaging/whatsapp', () => {
    const payload = buildLeadEventPayload('clid_abc123', 1759651200)
    expect(payload).toEqual({
      data: [{
        event_name: 'Lead',
        event_time: 1759651200,
        action_source: 'business_messaging',
        messaging_channel: 'whatsapp',
        user_data: { ctwa_clid: 'clid_abc123' },
      }],
    })
  })
})
