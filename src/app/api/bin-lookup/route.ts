import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidBin, normalizeBin, toLookupResult, fromKgdTaxpayer, egovQuery,
  type BinLookupResult,
} from '@/lib/binLookup'
import {
  parseTaxpayer, parseVatStatus, parseUnreliable, parseLiquidation,
  KGD_TAXPAYER_URL, KGD_VAT_URL, KGD_UNRELIABLE_URL, KGD_LIQUIDATION_URL,
  KGD_TAXPAYER_TYPES,
} from '@/lib/kgdTaxpayer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// A registry row is re-fetched after this. Companies get renamed, liquidated
// and registered for VAT, and a stale name printed on an invoice is worse
// than a slow lookup -- but the register itself only refreshes daily, so
// anything shorter would just spend requests.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** The legal-entity register. Rich, but holds no sole proprietors. */
async function lookUpInEgov(bin: string): Promise<BinLookupResult | null> {
  const key = process.env.EGOV_API_KEY
  if (!key) {
    console.error('bin-lookup: EGOV_API_KEY is not set')
    return null
  }
  try {
    const url = `https://data.egov.kz/api/v4/gbd_ul/v1?source=${encodeURIComponent(egovQuery(bin))}&apiKey=${key}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!res.ok) throw new Error(`egov responded ${res.status}`)
    const records = await res.json()
    return toLookupResult(bin, Array.isArray(records) ? records : [])
  } catch (e) {
    console.error('bin-lookup: egov request failed:', e instanceof Error ? e.message : e)
    return null
  }
}

/** КГД. The only official source that covers ИП, at the cost of detail. */
async function lookUpInKgd(bin: string): Promise<BinLookupResult | null> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token) return null
  for (const taxpayerType of KGD_TAXPAYER_TYPES) {
    try {
      const url = `${KGD_TAXPAYER_URL}?taxpayerCode=${encodeURIComponent(bin)}&taxpayerType=${taxpayerType}`
      const res = await fetch(url, {
        headers: { 'X-Portal-Token': token },
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) continue
      const taxpayer = parseTaxpayer(await res.json())
      if (taxpayer) return fromKgdTaxpayer(bin, taxpayer)
    } catch (e) {
      console.error('bin-lookup: КГД request failed:', e instanceof Error ? e.message : e)
    }
  }
  return null
}

/**
 * VAT registration for a БИН.
 *
 * Returns undefined when nothing could be learned, which is not the same as
 * `false`: a seller reading "не плательщик НДС" on an invoice needs that to
 * mean КГД said so, not that our request timed out.
 */
async function lookUpVat(bin: string): Promise<{ isVatPayer: boolean; registeredAt: string | null } | undefined> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token) return undefined
  try {
    const res = await fetch(`${KGD_VAT_URL}?taxpayerCode=${encodeURIComponent(bin)}`, {
      headers: { 'X-Portal-Token': token },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return undefined
    // An empty body is КГД saying "not registered", so the text is read
    // first and only parsed as JSON when there is something to parse.
    const body = (await res.text()).trim()
    const status = parseVatStatus(body ? JSON.parse(body) : '')
    return status ? { isVatPayer: status.isVatPayer, registeredAt: status.registeredAt } : undefined
  } catch (e) {
    console.error('bin-lookup: КГД VAT request failed:', e instanceof Error ? e.message : e)
    return undefined
  }
}

/**
 * The two risk checks КГД lets us make with the token we have.
 *
 * Both answer null when nothing was learned, and the caller keeps that
 * distinct from a clean result all the way to the screen: a seller shown
 * silence because a request timed out would read it as "counterparty is
 * fine", which is the one wrong thing this feature could do.
 *
 * Tax debt is deliberately absent. Its service demands a second token
 * (personalAccountToken) that we do not have, and the public page carrying
 * the same data is behind a reCAPTCHA — put there precisely to stop
 * automated querying, so it is not ours to work around.
 */
async function checkRisk(bin: string): Promise<{ unreliable: boolean | null; liquidating: boolean | null }> {
  const token = process.env.KGD_PORTAL_TOKEN
  if (!token) return { unreliable: null, liquidating: null }
  const headers = { 'X-Portal-Token': token }

  const unreliable = (async () => {
    try {
      const res = await fetch(KGD_UNRELIABLE_URL, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxPayerCode: bin, language: 'ru' }),
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return null
      return parseUnreliable(await res.json())
    } catch (e) {
      console.error('bin-lookup: КГД unreliable check failed:', e instanceof Error ? e.message : e)
      return null
    }
  })()

  const liquidating = (async () => {
    try {
      const res = await fetch(`${KGD_LIQUIDATION_URL}?taxpayerCode=${encodeURIComponent(bin)}`, {
        headers,
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) return null
      return parseLiquidation(await res.json())
    } catch (e) {
      console.error('bin-lookup: КГД liquidation check failed:', e instanceof Error ? e.message : e)
      return null
    }
  })()

  const [u, l] = await Promise.all([unreliable, liquidating])
  return { unreliable: u, liquidating: l }
}

// Looks a counterparty up by БИН across both state registers.
//
// The browser never sees either credential -- the egov agreement forbids
// passing its key to anyone, and the КГД token is issued to one account by
// hand -- so the browser asks us and we ask them.
//
// Signed-in users only. Not because the data is private (both registers are
// public) but because an open proxy would spend our 40 requests a minute.
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
    const company: BinLookupResult = {
      bin: cached.bin,
      name: cached.name,
      address: cached.address,
      director: cached.director,
      activity: cached.activity,
      status: cached.status,
      registeredAt: cached.registered_at,
      source: cached.source,
      isVatPayer: cached.is_vat_payer,
      vatRegisteredAt: cached.vat_registered_at,
      isUnreliable: cached.is_unreliable,
      isLiquidating: cached.is_liquidating,
    }

    // A fresh row can still be missing its VAT status: it was cached before
    // the VAT lookup existed, or КГД was unreachable at the time. Left alone
    // that gap would persist for the whole cache lifetime, so it is filled
    // in on the next read instead of waiting for the row to expire. The
    // identity fields are not re-fetched -- only the hole is.
    const missingVat = company.isVatPayer === null || company.isVatPayer === undefined
    const missingRisk = company.isUnreliable === null || company.isUnreliable === undefined
    if (missingVat || missingRisk) {
      const [vat, risk] = await Promise.all([
        missingVat ? lookUpVat(bin) : Promise.resolve(undefined),
        missingRisk ? checkRisk(bin) : Promise.resolve(null),
      ])
      const patch: Record<string, unknown> = {}
      if (vat) {
        company.isVatPayer = vat.isVatPayer
        company.vatRegisteredAt = vat.registeredAt
        patch.is_vat_payer = vat.isVatPayer
        patch.vat_registered_at = vat.registeredAt
      }
      if (risk) {
        company.isUnreliable = risk.unreliable
        company.isLiquidating = risk.liquidating
        patch.is_unreliable = risk.unreliable
        patch.is_liquidating = risk.liquidating
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('bin_lookup_cache').update(patch).eq('bin', bin)
        if (error) console.error('bin-lookup: backfill failed:', error.message)
      }
    }

    return NextResponse.json({ found: true, company })
  }

  // The register first: when it has the company it answers with an address,
  // a director and an activity, none of which КГД publishes. КГД is the
  // fallback that covers everyone the register cannot -- sole proprietors,
  // who are simply absent from it.
  const company = (await lookUpInEgov(bin)) ?? (await lookUpInKgd(bin))
  if (!company) {
    return NextResponse.json({ found: false })
  }

  // Run together: three independent КГД calls, and the user is waiting.
  const [vat, risk] = await Promise.all([lookUpVat(bin), checkRisk(bin)])
  if (vat) {
    company.isVatPayer = vat.isVatPayer
    company.vatRegisteredAt = vat.registeredAt
  }
  company.isUnreliable = risk.unreliable
  company.isLiquidating = risk.liquidating

  const { error: cacheError } = await supabase.from('bin_lookup_cache').upsert({
    bin: company.bin,
    name: company.name,
    address: company.address,
    director: company.director,
    activity: company.activity,
    status: company.status,
    registered_at: company.registeredAt,
    source: company.source,
    is_vat_payer: company.isVatPayer,
    vat_registered_at: company.vatRegisteredAt,
    is_unreliable: company.isUnreliable,
    is_liquidating: company.isLiquidating,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'bin' })
  // A cache miss costs a request next time; not worth failing the lookup
  // someone is waiting on.
  if (cacheError) console.error('bin-lookup: cache write failed:', cacheError.message)

  return NextResponse.json({ found: true, company })
}
