import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchKaspiOperations } from '@/lib/kaspiPay/operationsQuery'
import { buildStatementWorkbookBuffer } from '@/lib/kaspiPay/statementExport'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// A period export can span far more than the statement view's own 200-row
// page; a sane upper bound still keeps one request well inside Vercel's
// default function budget (this route does no external network calls,
// unlike kaspi-shop's orders export, so there's no pagination-timeout risk
// to size against here -- 5000 is just a generous ceiling against abuse).
const MAX_EXPORT_ROWS = 5000

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const direction = req.nextUrl.searchParams.get('direction') || 'all'
  const category = req.nextUrl.searchParams.get('category') || 'all'
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const operations = await fetchKaspiOperations(user.id, { direction, category, from, to, limit: MAX_EXPORT_ROWS })

  const buffer = buildStatementWorkbookBuffer(operations)
  const filename = `kaspi_vypiska_${new Date().toISOString().slice(0, 10)}.xlsx`
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
