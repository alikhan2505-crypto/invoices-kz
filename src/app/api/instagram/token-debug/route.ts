import { NextRequest, NextResponse } from 'next/server'

// Diagnostic-only: asks Meta itself what's wrong with the configured token,
// without ever returning or logging the token value.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  const report: Record<string, unknown> = {
    tokenPresent: !!accessToken,
    tokenLength: accessToken?.length ?? 0,
    tokenHasWhitespace: accessToken ? /\s/.test(accessToken) : null,
    tokenFirst6: accessToken?.slice(0, 6) ?? null,
    tokenLast4: accessToken?.slice(-4) ?? null,
    igUserId,
  }

  if (accessToken) {
    const res = await fetch(`https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${accessToken}`)
    report.debugTokenResponse = await res.json()
  }

  return NextResponse.json(report)
}
