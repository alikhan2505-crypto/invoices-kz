// WB issues JWTs (180-day validity per their own docs) via the seller
// cabinet -- we only ever READ them, never verify the signature (WB's own
// API does that on every real call; a bad token simply fails there). `exp`
// is a registered, universally-standard JWT claim (RFC 7519) -- safe to
// rely on. Everything else in the payload is stored as-is for diagnostics
// rather than parsed into named fields: this session's research could not
// verify WB's exact claim names for granted categories/scopes, and
// guessing them would be exactly the kind of fabricated confidence this
// codebase's own "не уверен" precedent (see /kaspi-shop/nkt) exists to avoid.
export function decodeWbToken(token: string): { expiresAt: string; claims: Record<string, unknown> } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  let claims: Record<string, unknown>
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    claims = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return null

  const exp = (claims as Record<string, unknown>).exp
  if (typeof exp !== 'number') return null

  return { expiresAt: new Date(exp * 1000).toISOString(), claims }
}

export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}
