import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadConnection } from '@/lib/kaspiShop/connection'
import { listCatalog, authHeaders } from '@/lib/kaspiShop/cabinetApi'

// One-off introspection of the same authenticated GraphQL facade
// getMerchant/getCities already use -- looking for a mutation to restore an
// available=false offer (same technique as the earlier city-names
// discovery). Read-only: introspection can't execute anything.
async function findOfferMutations(sessionCookies: string): Promise<string[]> {
  const res = await fetch('https://mc.shop.kaspi.kz/mc/facade/graphql', {
    method: 'POST',
    headers: authHeaders(sessionCookies),
    body: JSON.stringify({
      operationName: 'IntrospectionQuery',
      variables: {},
      query: `query IntrospectionQuery {
        __schema {
          mutationType {
            fields { name args { name type { name kind ofType { name kind } } } }
          }
        }
      }`,
    }),
  })
  if (!res.ok) return [`introspection request failed: ${res.status}`]
  const json = await res.json().catch(() => null)
  const fields = json?.data?.__schema?.mutationType?.fields
  if (!Array.isArray(fields)) return [`unexpected shape: ${JSON.stringify(json).slice(0, 500)}`]
  return fields
    .filter((f: any) => /offer|avail|activ|publish|stock/i.test(f.name))
    .map((f: any) => `${f.name}(${(f.args || []).map((a: any) => a.name).join(', ')})`)
}

// TEMPORARY diagnostic route -- reuses the already-connected ABIL-SISTERS/
// ИП FIRST PROJECT account's stored session to inspect its real
// available=false catalog offers, per the founder's live report of 2
// "Сняты с продажи" products not visible where expected. Delete this route
// once the investigation is done -- same technique as the earlier
// city-names GraphQL introspection diagnostic (see kaspi_shop memory).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userId).single()
  return !!profile?.is_admin
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const connection = await loadConnection(user.id)
  if (!connection) return NextResponse.json({ error: 'no_connection' }, { status: 404 })
  if (!connection.sessionCookies) return NextResponse.json({ error: 'no_session' }, { status: 400 })

  const removed = await listCatalog(connection.sessionCookies, connection.merchantId, false)
  const active = await listCatalog(connection.sessionCookies, connection.merchantId, true)
  const offerMutations = await findOfferMutations(connection.sessionCookies)

  return NextResponse.json({
    merchantId: connection.merchantId,
    companyName: connection.companyName,
    removedCount: removed.length,
    activeCount: active.length,
    offerMutations,
    removed,
  })
}
