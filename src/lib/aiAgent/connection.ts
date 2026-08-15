// Same pattern as getKey() in src/lib/kaspiShop/connection.ts -- one
// dedicated encryption key per feature area, not shared across features.
export function getKey(): string {
  const key = process.env.AI_AGENT_ENCRYPTION_KEY
  if (!key) throw new Error('AI_AGENT_ENCRYPTION_KEY is not configured')
  return key
}
