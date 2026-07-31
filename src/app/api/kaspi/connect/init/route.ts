import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { initConnect } from '@/lib/kaspiPay/client'
import { setPendingAttempt } from '@/lib/kaspiPay/pendingConnect'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phoneNumber } = await req.json()
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

  try {
    const { processId, identity, userToken } = await initConnect(phoneNumber)
    // The pairing identity + entrance userToken are needed again on verify
    // (to sign the finish step and continue the same entrance session), so
    // they're cached here rather than round-tripped through the client.
    setPendingAttempt(processId, { identity, userToken, userId: user.id, phoneNumber })
    return NextResponse.json({ processId })
  } catch (e: any) {
    console.error('Kaspi connect init error:', e.message)
    return NextResponse.json({ error: 'kaspi_unavailable' }, { status: 502 })
  }
}
