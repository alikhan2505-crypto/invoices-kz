import { NextResponse } from 'next/server'

// Public widget API routes run cross-origin -- the embed script executes on
// an arbitrary seller's own domain, never invoices.kz itself. Wide-open CORS
// is safe specifically because these routes carry NO cookie/session auth at
// all; the widget's public key (visible in the page source anyway) is the
// entire trust boundary, same as any embeddable chat widget's origin policy.
export function corsJson(body: unknown, status: number = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Access-Control-Allow-Origin': '*' } })
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
