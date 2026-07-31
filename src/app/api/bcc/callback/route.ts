import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyState } from '@/lib/bccState'
import { getBccAppToken, BCC_AUTH_CLIENT_BASE, BCC_BUSINESS_ACCOUNT_BASE } from '@/lib/bccAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REDIRECT_URI = 'https://www.invoices.kz/api/bcc/callback'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  if (!code || !state) {
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }

  const verified = verifyState(state, process.env.BCC_STATE_SECRET!)
  if (!verified) {
    console.error('BCC callback: invalid or expired state')
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }

  try {
    const appToken = await getBccAppToken()

    const tokenRes = await fetch(`${BCC_AUTH_CLIENT_BASE}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appToken}`,
      },
      body: JSON.stringify({
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        client_secret: process.env.BCC_CLIENT_SECRET,
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`)
    const { access_token, refresh_token, expires_in } = await tokenRes.json()

    const accountsRes = await fetch(`${BCC_BUSINESS_ACCOUNT_BASE}/accounts`, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'x-client-token': access_token,
        'accept': 'application/json',
      },
    })
    if (!accountsRes.ok) throw new Error(`accounts fetch failed: ${accountsRes.status} ${await accountsRes.text()}`)
    const accounts = await accountsRes.json()
    const account = accounts.find((a: any) => a.is_main) || accounts[0]
    if (!account) throw new Error('no accounts returned for this user')

    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    await supabase.from('bcc_connections').upsert({
      user_id: verified.userId,
      iban: account.iban,
      currency: account.currency,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      status: 'active',
      last_checked_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=connected')
  } catch (e: any) {
    console.error('BCC callback error:', e.message)
    return NextResponse.redirect('https://www.invoices.kz/profile/acquiring?bcc=error')
  }
}
