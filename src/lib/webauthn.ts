// Apex domain as rpID covers both invoices.kz and www.invoices.kz (the canonical
// host after the www-redirect) — WebAuthn allows rpID to be any registrable
// domain suffix of the origin that's actually calling the API.
export const RP_ID = 'invoices.kz'
export const RP_NAME = 'invoices.kz'

export const EXPECTED_ORIGINS = process.env.NODE_ENV === 'production'
  ? ['https://invoices.kz', 'https://www.invoices.kz']
  : ['https://invoices.kz', 'https://www.invoices.kz', 'http://localhost:3000']

export const CHALLENGE_TTL_MS = 5 * 60 * 1000
