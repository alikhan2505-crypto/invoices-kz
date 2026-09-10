import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isValidBin, normalizeBin, toLookupResult, fromKgdTaxpayer, egovQuery,
  type BinLookupResult,
} from '@/lib/binLookup'
import {
  parseTaxpayer, parseVatStatus, KGD_TAXPAYER_URL, KGD_VAT_URL, KGD_TAXPAYER_TYPES,
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
    }

    // A fresh row can still be missing its VAT status: it was cached before
    // the VAT lookup existed, or КГД was unreachable at the time. Left alone
    // that gap would persist for the whole cache lifetime, so it is filled
    // in on the next read instead of waiting for the row to expire. The
    // identity fields are not re-fetched -- only the hole is.
    if (company.isVatPayer === null || company.isVatPayer === undefined) {
      const vat = await lookUpVat(bin)
      if (vat) {
        company.isVatPayer = vat.isVatPayer
        company.vatRegisteredAt = vat.registeredAt
        const { error } = await supabase.from('bin_lookup_cache')
          .update({ is_vat_payer: vat.isVatPayer, vat_registered_at: vat.registeredAt })
          .eq('bin', bin)
        if (error) console.error('bin-lookup: VAT backfill failed:', error.message)
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

  const vat = await lookUpVat(bin)
  if (vat) {
    company.isVatPayer = vat.isVatPayer
    company.vatRegisteredAt = vat.registeredAt
  }

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
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'bin' })
  // A cache miss costs a request next time; not worth failing the lookup
  // someone is waiting on.
  if (cacheError) console.error('bin-lookup: cache write failed:', cacheError.message)

  return NextResponse.json({ found: true, company })
}
