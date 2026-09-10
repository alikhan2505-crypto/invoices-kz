import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isValidBin, normalizeBin, toLookupResult, egovQuery, type BinLookupResult } from '@/lib/binLookup'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// A registry row is re-fetched after this. Companies get renamed and
// liquidated, and a stale name printed on an invoice is worse than a slow
// lookup -- but the register itself only refreshes daily, so anything
// shorter would just spend requests.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Looks a counterparty up by БИН in the state register of legal entities.
//
// This route exists because the egov key must never reach a browser: the
// portal's agreement forbids passing the key to anyone (Приложение 2,
// пп. 5.2, 12), and a NEXT_PUBLIC_ variable would hand it to every visitor.
// So the browser asks us, and we ask egov.
//
// Signed-in users only -- not because the data is private (it is a public
// register) but because an open proxy would let anyone spend our 40
// requests per minute.
export async function GET(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bin = normalizeBin(req.nextUrl.searchParams.get('bin'))
  if (!isValidBin(bin)) {
    return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  }

  const { data: cached } = await supabase
    .from('bin_lookup_cache')
    .select('*')
    .eq('bin', bin)
    .maybeSingle()

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return NextResponse.json({
      found: true,
      company: {
        bin: cached.bin,
        name: cached.name,
        address: cached.address,
        director: cached.director,
        activity: cached.activity,
        status: cached.status,
        registeredAt: cached.registered_at,
      } satisfies BinLookupResult,
    })
  }

  const key = process.env.EGOV_API_KEY
  if (!key) {
    console.error('bin-lookup: EGOV_API_KEY is not set')
    return NextResponse.json({ error: 'Справочник недоступен' }, { status: 503 })
  }

  let records: unknown
  try {
    const url = `https://data.egov.kz/api/v4/gbd_ul/v1?source=${encodeURIComponent(egovQuery(bin))}&apiKey=${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) throw new Error(`egov responded ${res.status}`)
    records = await res.json()
  } catch (e) {
    // The portal may cut access off at any time without notice (п. 11), and
    // it is simply slow sometimes. Either way the invoice must still be
    // fillable by hand, so this is reported as "lookup unavailable" and never
    // as a failure of the form.
    console.error('bin-lookup: egov request failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Справочник не отвечает' }, { status: 503 })
  }

  const company = toLookupResult(bin, Array.isArray(records) ? records : [])
  if (!company) {
    // Most often a sole proprietor: gbd_ul is a register of legal entities
    // and holds no ИП at all. That is why the caller is told "not found"
    // rather than anything resembling an error.
    return NextResponse.json({ found: false })
  }

  const { error: cacheError } = await supabase.from('bin_lookup_cache').upsert({
    bin: company.bin,
    name: company.name,
    address: company.address,
    director: company.director,
    activity: company.activity,
    status: company.status,
    registered_at: company.registeredAt,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'bin' })
  // A cache miss costs a request next time; it is not worth failing the
  // lookup the user is waiting on.
  if (cacheError) console.error('bin-lookup: cache write failed:', cacheError.message)

  return NextResponse.json({ found: true, company })
}
