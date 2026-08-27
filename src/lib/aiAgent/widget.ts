import crypto from 'crypto'

const WIDGET_KEY_PATTERN = /^wgt_[0-9a-f]{24}$/

export function generateWidgetKey(): string {
  return 'wgt_' + crypto.randomBytes(12).toString('hex')
}

export function isValidWidgetKeyFormat(key: string): boolean {
  return WIDGET_KEY_PATTERN.test(key)
}

// A script tag's data-key is visible to anyone who views the seller's page
// source (the normal, accepted trust model for any embeddable chat widget --
// Intercom/Crisp work the same way), so this limit protects against
// wallet-draining spam, not identity spoofing.
export const WIDGET_MESSAGE_RATE_LIMIT = 10
export const WIDGET_MESSAGE_RATE_WINDOW_MS = 60_000

export function exceedsRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= WIDGET_MESSAGE_RATE_LIMIT
}

// Second, coarser limit scoped to the whole agent rather than one visitor --
// unlike Telegram/WhatsApp/Instagram, a website visitorId costs an attacker
// nothing to fabricate fresh on every request (it's a client-generated
// value, never tied to a real platform account), so the per-visitor limit
// above is trivially bypassed by rotating it. This caps the worst case
// while still comfortably covering many genuine simultaneous visitors.
export const WIDGET_AGENT_MESSAGE_RATE_LIMIT = 60

export function exceedsAgentRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= WIDGET_AGENT_MESSAGE_RATE_LIMIT
}
