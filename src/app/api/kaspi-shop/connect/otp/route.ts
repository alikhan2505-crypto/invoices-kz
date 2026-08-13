import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { submitOtp } from '@/lib/kaspiShop/cabinetAuth'
import { getMerchantInfo, listCatalog } from '@/lib/kaspiShop/cabinetApi'
import { saveConnection, loadConnection } from '@/lib/kaspiShop/connection'

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

// Step 2: completes the real cabinet login, then auto-fetches the company
// name (closing the "why do I have to type this myself" question from
// earlier brainstorming) and imports the seller's existing catalog --
// something the official Merchant API has no endpoint for at all. Imported
// products land disabled: the seller reviews and turns tracking on
// deliberately, rather than every SKU repricing the moment it's imported.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  const { otpToken, code, merchantId } = body
  if (!otpToken || !code || !merchantId) {
    return NextResponse.json({ error: 'otpToken, code и merchantId обязательны' }, { status: 400 })
  }

  const loginResult = await submitOtp(otpToken, code)
  if (loginResult.status !== 'success') {
    return NextResponse.json({ error: loginResult.status === 'error' ? loginResult.message : 'Не удалось завершить вход' }, { status: 400 })
  }
  const sessionCookies = loginResult.sessionCookies

  const merchant = await getMerchantInfo(sessionCookies, merchantId)
  if (!merchant) {
    return NextResponse.json({ error: 'Не удалось получить данные магазина по указанному ID продавца — проверьте ID' }, { status: 400 })
  }

  await saveConnection({ userId: user.id, sessionCookies, merchantId, companyName: merchant.name })
  const connection = await loadConnection(user.id)
  if (!connection) {
    return NextResponse.json({ error: 'Подключение не удалось сохранить' }, { status: 500 })
  }

  let imported = 0
  try {
    const offers = await listCatalog(sessionCookies, merchantId, true)
    for (const offer of offers) {
      const { data: product, error: productError } = await supabase
        .from('kaspi_shop_tracked_products')
        .insert({
          connection_id: connection.id,
          user_id: user.id,
          kaspi_sku: offer.sku,
          product_name: offer.title,
          brand: offer.brandName || offer.brandCode || '',
          store_id: offer.points[0] || '',
          stock_count: 0,
          own_current_price: offer.minPrice,
          floor_price: offer.minPrice,
          undercut_step: 100,
          check_frequency_minutes: 15,
          enabled: false,
          kaspi_master_sku: offer.masterSku,
          kaspi_brand: offer.brandName || offer.brandCode || null,
          kaspi_category: offer.masterCategory,
        })
        .select('id')
        .single()
      if (productError || !product) {
        console.error('kaspi-shop connect/otp: failed to import offer', offer.sku, productError?.message)
        continue
      }

      const cityRows = Object.entries(offer.allCityPrices).map(([cityCode, entry]) => ({
        tracked_product_id: product.id,
        city_code: cityCode,
        own_current_price: entry.price,
      }))
      if (cityRows.length > 0) {
        const { error: cityError } = await supabase.from('kaspi_shop_product_city_prices').insert(cityRows)
        if (cityError) console.error('kaspi-shop connect/otp: failed to import city prices for', offer.sku, cityError.message)
      }
      imported += 1
    }
  } catch (err: any) {
    // The connection itself is already saved and valid -- a partial or
    // failed catalog import is a recoverable follow-up, not a reason to
    // report the whole connect as failed.
    console.error('kaspi-shop connect/otp: catalog import failed', err.message)
  }

  return NextResponse.json({ status: 'connected', companyName: merchant.name, importedProducts: imported })
}
