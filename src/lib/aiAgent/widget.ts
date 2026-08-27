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
