// Stage 5 of the product split (21.09.2026): the apex root '/' switches from
// the Счета marketing page to the Products Hub. Off (default) keeps '/'
// exactly as it always was -- the moved page (InvoicesLandingPage) still
// renders there too, see src/app/page.tsx. On sends '/' to the Hub and the
// marketing page becomes reachable only at docs.invoices.kz (and its inert
// mirror path /invoices-landing).
//
// NEXT_PUBLIC_ (not a server-only var like API_HOST_REDIRECT): this flag is
// read from both server components (src/app/page.tsx, sitemap.ts) and client
// components (the free tools below), so it has to be inlined at build for
// both -- same reasoning as NEXT_PUBLIC_SHARED_SESSION in src/lib/supabase.ts.
// Flip in Vercel + redeploy; rollback is unsetting it + redeploy.
export const ROOT_HUB_LIVE = process.env.NEXT_PUBLIC_ROOT_HUB_LIVE === '1'

// Where the free tools (/tools/waybills, /tools/margin) and guide articles
// send "see the product" clicks. Before the cutover that's still the '/'
// anchor on the page that's actually serving there; after, the page (and its
// #features section) only exists on docs.invoices.kz.
export const FEATURES_HREF = ROOT_HUB_LIVE ? 'https://docs.invoices.kz/#features' : '/#features'
