import crypto from 'crypto'

const API_KEY_PATTERN = /^agk_[0-9a-f]{48}$/

export function generateApiKey(): string {
  return 'agk_' + crypto.randomBytes(24).toString('hex')
}

export function isValidApiKeyFormat(key: string): boolean {
  return API_KEY_PATTERN.test(key)
}

// One-way hash, same idiom as kaspi_connections.api_token_hash
// (src/app/api/kaspi/regenerate-token/route.ts) -- unlike the website
// widget's data-key (meant to be publicly visible in embedded page source),
// this key is a real secret the caller's own backend holds, so only its
// hash is ever persisted. The raw key is shown to the owner exactly once,
// at generation time, and cannot be recovered afterwards -- only regenerated.
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

// A single aggregate limit is enough here -- unlike the website widget's
// visitorId (client-supplied, free to fabricate), this key is a real secret
// held server-side by the caller's own backend, so there's no spoofable
// per-end-user identity to bypass it with. Generous enough for a real
// integration fronting many end-users, still a backstop against a runaway
// retry loop burning through the wallet.
export const EXTERNAL_API_AGENT_RATE_LIMIT = 100
export const EXTERNAL_API_RATE_WINDOW_MS = 60_000

export function exceedsExternalApiRateLimit(recentMessageCount: number): boolean {
  return recentMessageCount >= EXTERNAL_API_AGENT_RATE_LIMIT
}
