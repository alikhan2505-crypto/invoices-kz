// Pages where the top utility bar (wallet pill, bell, account) renders nothing.
// Single source of truth for TopUtilityBar itself AND for TopUtilityBarGate,
// which uses it to avoid even downloading the bar's code (supabase, framer-motion,
// qrcode) on these pages. Keep the two in sync by only ever editing this list.

// App chrome has no business on public/marketing pages: the landing, auth,
// legal pages, and client-facing public document views (where the viewer
// may be a logged-in platform user who is NOT the document's owner).
function isPublicPage(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/cashier-api' ||
    pathname === '/invoices-landing' ||
    pathname.startsWith('/lp/') ||
    pathname.startsWith('/view/') ||
    pathname.startsWith('/contract-view/') ||
    pathname.startsWith('/verify/') ||
    pathname.startsWith('/promo/') ||
    pathname.startsWith('/shop/') ||
    pathname.startsWith('/tools/') ||
    // Гайды — публичные статьи со своей шапкой: плашка закрывала там
    // переключатель «Қазақша» у вошедших (15.10.2026).
    pathname === '/tools' ||
    pathname === '/guides' ||
    pathname.startsWith('/guides/')
  )
}

export function isUtilityBarHiddenPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? ''
  if (isPublicPage(p)) return true
  // Founder-requested 2026-09-17: internal admin tool with its own header.
  if (p === '/admin/site-generator') return true
  // 2026-09-18: the salon booking planner has its own Telegram-QR login.
  if (p.startsWith('/planner/')) return true
  // 21.09.2026: /products is the start page with its own header and button.
  if (p === '/products') return true
  return false
}
