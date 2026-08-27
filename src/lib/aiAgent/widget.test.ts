import { describe, it, expect } from 'vitest'
import { generateWidgetKey, isValidWidgetKeyFormat, exceedsRateLimit, WIDGET_MESSAGE_RATE_LIMIT, exceedsAgentRateLimit, WIDGET_AGENT_MESSAGE_RATE_LIMIT } from './widget'

describe('generateWidgetKey', () => {
  it('produces a key matching the expected format', () => {
    const key = generateWidgetKey()
    expect(isValidWidgetKeyFormat(key)).toBe(true)
  })

  it('produces a different key on every call', () => {
    expect(generateWidgetKey()).not.toBe(generateWidgetKey())
  })
})

describe('isValidWidgetKeyFormat', () => {
  it('accepts a well-formed key', () => {
    expect(isValidWidgetKeyFormat('wgt_' + 'a'.repeat(24))).toBe(true)
  })

  it('rejects a missing prefix, wrong length, or non-hex characters', () => {
    expect(isValidWidgetKeyFormat('a'.repeat(24))).toBe(false)
    expect(isValidWidgetKeyFormat('wgt_' + 'a'.repeat(10))).toBe(false)
    expect(isValidWidgetKeyFormat('wgt_' + 'z'.repeat(24))).toBe(false)
    expect(isValidWidgetKeyFormat('')).toBe(false)
  })
})

describe('exceedsRateLimit', () => {
  it('is false below the limit, true at and above it', () => {
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT - 1)).toBe(false)
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT)).toBe(true)
    expect(exceedsRateLimit(WIDGET_MESSAGE_RATE_LIMIT + 1)).toBe(true)
  })
})

describe('exceedsAgentRateLimit', () => {
  it('is false below the limit, true at and above it', () => {
    expect(exceedsAgentRateLimit(WIDGET_AGENT_MESSAGE_RATE_LIMIT - 1)).toBe(false)
    expect(exceedsAgentRateLimit(WIDGET_AGENT_MESSAGE_RATE_LIMIT)).toBe(true)
    expect(exceedsAgentRateLimit(WIDGET_AGENT_MESSAGE_RATE_LIMIT + 1)).toBe(true)
  })
})
