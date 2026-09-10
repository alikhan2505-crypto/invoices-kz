import { NextRequest, NextResponse } from 'next/server'
import { looksLikeEmail, normalizeEmail, verdictFromStatus } from '@/lib/emailDeliverability'

// Answers one question for the login screen: will a sign-in link to this
// address actually arrive?
//
// Unauthenticated on purpose — it is called by someone who is, by definition,
// not signed in yet. It reveals only whether an address has bounced from our
// sending, never whether an account exists, and it is the difference between
// "Проверьте почту!" and the truth for anyone who mistyped their own address.
//
// The read key is required and stays here: RESEND_API_KEY can only send.
export async function POST(req: NextRequest) {
  let email = ''
  try {
    email = normalizeEmail((await req.json())?.email)
  } catch {
    return NextResponse.json({ verdict: 'unknown' })
  }

  // Junk never reaches Resend: it would spend a request to be told nothing.
  if (!looksLikeEmail(email)) return NextResponse.json({ verdict: 'unknown' })

  const key = process.env.RESEND_READ_API_KEY
  if (!key) {
    console.error('email/deliverable: RESEND_READ_API_KEY is not set')
    return NextResponse.json({ verdict: 'unknown' })
  }

  try {
    const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6_000),
    })
    return NextResponse.json({ verdict: verdictFromStatus(res.status) })
  } catch (e) {
    // Never a hard failure. A check that is down must not become a second
    // way to be locked out — the caller reads 'unknown' as "go ahead".
    console.error('email/deliverable: suppression lookup failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ verdict: 'unknown' })
  }
}
