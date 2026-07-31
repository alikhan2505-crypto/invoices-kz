// BCC's portal lists api.bcc.kz:11443, api.bcc.kz, api-test.bcc.kz, and
// api-sandbox.bcc.kz as the "Production, Development" hosts for every
// endpoint — all sharing the same /bcc/production/... path regardless of
// host. Default to the primary one; override via BCC_API_HOST in .env.local
// (e.g. BCC_API_HOST=api-sandbox.bcc.kz) if it doesn't behave as expected.
const BCC_HOST = process.env.BCC_API_HOST || 'api.bcc.kz:11443'
export const BCC_AUTH_CLIENT_BASE = `https://${BCC_HOST}/bcc/production/v1/auth-client`
export const BCC_BUSINESS_ACCOUNT_BASE = `https://${BCC_HOST}/bcc/production/v1/business-account-management`
const BCC_OAUTH_TOKEN_URL = `https://${BCC_HOST}/bcc/production/v2/oauth/token`

// App-level (client-credentials) token — authenticates invoices.kz itself to
// BCC's API gateway. Distinct from the per-user token obtained through the
// authorization-code flow (see src/lib/bccState.ts and the connect/callback
// routes) — BCC's statement API requires BOTH on every call.
export async function getBccAppToken(): Promise<string> {
  const res = await fetch(BCC_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${process.env.BCC_CLIENT_ID}:${process.env.BCC_CLIENT_SECRET}`).toString('base64'),
    },
    body: 'grant_type=client_credentials&scope=bcc.application.business.account.management',
  })
  if (!res.ok) {
    throw new Error(`BCC app token request failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.access_token as string
}
