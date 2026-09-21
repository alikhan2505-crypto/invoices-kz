// Shared dark "docs" palette for the Kaspi Cashier API surfaces
// (/cashier-api and /kaspi-api/docs) -- deliberately NOT the invoices.kz
// brand violet/teal (COLOR.violet/teal/ground in src/app/page.tsx). This
// audience is developers/technical founders, not the accounting-software
// buyer of the main landing -- see
// docs/superpowers/specs/2026-08-30-cashier-api-landing-design.md
// "Аудитория и тон". Values match GitHub Dark / Stripe docs. Kept as a
// single source of truth so /cashier-api, /kaspi-api/docs, and the Scalar
// customCss override in ApiDocsViewer.tsx all stay visually identical
// instead of three hand-copied literal blocks that could drift apart.
export const CASHIER_API_COLOR = {
  bg0: '#0a0c10',
  bg1: '#0d1117',
  bg2: '#161b22',
  text: '#c9d1d9',
  muted: '#8b949e',
  accent: '#7ee787',
  border: '#21262d',
  borderStrong: '#30363d',
  button: '#238636',
  buttonHover: '#2ea043',
} as const

export const CASHIER_API_FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const CASHIER_API_FONT_MONO = "'SF Mono', Consolas, monospace"

// Same roles, but resolved from the app's own theme tokens: the cabinet and the
// docs inside the product shell follow the site's light/dark setting like every
// other cabinet (founder, 21.09.2026). The public landing keeps the dark palette above.
export const CASHIER_API_THEMED = {
  bg0: 'var(--nav-surface-glass)',
  bg1: 'var(--nav-surface-glass)',
  bg2: 'var(--nav-surface-glass)',
  text: 'var(--nav-text-primary)',
  muted: 'var(--nav-text-secondary)',
  accent: 'var(--nav-accent)',
  border: 'var(--nav-border)',
  borderStrong: 'var(--nav-border)',
  button: 'var(--nav-accent)',
  buttonHover: 'var(--nav-accent)',
} as const
