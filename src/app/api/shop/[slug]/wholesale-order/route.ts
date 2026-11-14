import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { resolveStorefrontBySlug } from '@/lib/kaspiShop/storefront'
import { loadWholesaleModelByVariant, resolveWholesaleLine, type ResolvedWholesaleLine } from '@/lib/kaspiShop/wholesaleStorefront'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'
import { resolveInvoiceVatType } from '@/lib/invoiceTax'
import { isUuid } from '@/lib/uuidFormat'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { claimWindowSlot, dayBucket, hourBucket, windowKey } from '@/lib/windowLimits'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY!)

const MAX_CART_LINES = 20
const MAX_LINE_QTY = 999
const BIN_PATTERN = /^\d{12}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Анонимный POST создаёт настоящий счёт продавцу и шлёт письмо с mail@invoices.kz на
// указанный адрес (аудит 14.11.2026): без потолков это фабрика счетов и почтовый
// релей с нашего домена. Три независимых потолка: с одного IP, на один адрес
// получателя, на одну витрину за сутки.
const WHOLESALE_PER_IP_HOUR = 5
const WHOLESALE_PER_EMAIL_DAY = 3
const WHOLESALE_PER_SHOP_DAY = 30

interface CartLineInput { modelId: string; size: string; color: string; qty: number }

// Public, unauthenticated -- creates a REAL invoices.kz счёт from the cart,
// then the buyer pays it on /view/[token] exactly like any other счёт (bank
// details + Kaspi Cashier if the seller has Pro + a connected Kaspi Cashier
// -- zero payment code here). Mirrors the canonical server-side invoice path
// already used by src/app/api/cron/recurring/route.ts and
// src/lib/aiAgent/invoiceSend.ts: RPC claim_invoice_number + insert into
// invoices, public_token comes from that row's own column default.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Null also when the owner's Pro has lapsed (resolvePublicStorefront) --
  // this route creates a real счёт with the service role, so a lapsed
  // seller's storefront must not keep issuing invoices on their behalf.
  const storefront = await resolveStorefrontBySlug(slug)
  if (!storefront) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const rawItems = Array.isArray(body?.items) ? body.items : []
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : ''
  const clientBin = typeof body?.clientBin === 'string' ? body.clientBin.trim() : ''
  const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : ''
  const clientPhone = normalizeKzPhone(typeof body?.clientPhone === 'string' ? body.clientPhone : '')

  if (!clientName) return NextResponse.json({ error: 'Укажите название компании' }, { status: 400 })
  if (!BIN_PATTERN.test(clientBin)) return NextResponse.json({ error: 'БИН должен состоять из 12 цифр' }, { status: 400 })
  if (!clientEmail || clientEmail.length > 254 || !EMAIL_PATTERN.test(clientEmail)) return NextResponse.json({ error: 'Укажите email' }, { status: 400 })

  const items: CartLineInput[] = rawItems
    .filter((it: any) =>
      typeof it?.modelId === 'string' && typeof it?.size === 'string' && typeof it?.color === 'string' &&
      Number.isInteger(it?.qty) && it.qty > 0 && it.qty <= MAX_LINE_QTY
    )
    .slice(0, MAX_CART_LINES)
    .map((it: any) => ({ modelId: it.modelId, size: it.size, color: it.color, qty: it.qty }))
  if (items.length === 0) return NextResponse.json({ error: 'Корзина пуста' }, { status: 400 })
  // modelId - uuid: на мусорный id запрос к базе падал бы исключением (500).
  // Корзина отклоняется целиком, как и при недоступных товарах ниже.
  if (items.some(it => !isUuid(it.modelId))) {
    return NextResponse.json({ error: 'Часть товаров в корзине больше недоступна, обновите страницу' }, { status: 400 })
  }

  // Потолки занимаем атомарно ДО создания счёта и письма. Счётчик не читается: отказ
  // (анонимный маршрут, который пишет в базу и шлёт почту, без лимита не работает).
  const limits: Array<[string, number]> = [
    [windowKey('wsorder-ip', quotaIp(clientIp(req.headers)), hourBucket()), WHOLESALE_PER_IP_HOUR],
    [windowKey('wsorder-email', clientEmail.toLowerCase(), dayBucket()), WHOLESALE_PER_EMAIL_DAY],
    [windowKey('wsorder-shop', storefront.connectionId, dayBucket()), WHOLESALE_PER_SHOP_DAY],
  ]
  for (const [key, limit] of limits) {
    const claim = await claimWindowSlot(supabase, key, limit)
    if (claim.ok) continue
    // Тексты те же, что уже переведены на kk и en в словаре витрины (src/lib/i18n/storefront.ts).
    if (claim.reason === 'limit') return NextResponse.json({ error: 'Слишком много заказов подряд, попробуйте позже' }, { status: 429 })
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 503 })
  }

  let resolved: (ResolvedWholesaleLine | null)[]
  try {
    resolved = await Promise.all(items.map(async it => {
      const found = await loadWholesaleModelByVariant(storefront.connectionId, it.modelId, it.size, it.color)
      return resolveWholesaleLine(found?.model ?? null, found?.variant ?? null, it.qty)
    }))
  } catch (e: any) {
    console.error('wholesale-order: line resolution failed', e.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }
  // All-or-nothing, same as the existing shop/[slug]/order flow: a partially
  // resolvable cart is rejected outright rather than silently dropping lines.
  if (resolved.some(l => l === null)) {
    return NextResponse.json({ error: 'Часть товаров в корзине больше недоступна, обновите страницу' }, { status: 400 })
  }
  const lines = resolved as ResolvedWholesaleLine[]
  const total = lines.reduce((sum, l) => sum + l.price * l.qty, 0)

  const { data: invoiceNumber, error: numberError } = await supabase
    .rpc('claim_invoice_number', { p_user_id: storefront.userId })
  if (numberError) {
    console.error('wholesale-order: claim_invoice_number failed', numberError.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }

  // Режим НДС продавца фиксируем в счёте при создании. Профиль не прочитался —
  // оставляем null: просмотр тогда возьмёт режим профиля, как и раньше.
  const { data: sellerProfile } = await supabase
    .from('profiles').select('vat_type').eq('id', storefront.userId).maybeSingle()

  const { data: invoice, error: insertError } = await supabase
    .from('invoices')
    .insert({
      user_id: storefront.userId,
      number: invoiceNumber,
      amount: total,
      status: 'sent',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      vat_type: sellerProfile ? resolveInvoiceVatType(null, sellerProfile) : null,
      services: lines,
    })
    .select('public_token')
    .single()
  if (insertError || !invoice) {
    // Same trigger + error text as /create's own client-side check
    // (enforce_invoice_limit_trigger, see supabase/migrations/README.md) --
    // the seller's own monthly счёт limit applies here too, and a buyer
    // hitting it needs a human-readable reason, not a raw Postgres error.
    if (insertError?.message.includes('invoice_limit_reached')) {
      return NextResponse.json({ error: 'Продавец временно не может выставлять новые счета в этом месяце — свяжитесь с ним напрямую' }, { status: 400 })
    }
    console.error('wholesale-order: invoice insert failed', insertError?.message)
    return NextResponse.json({ error: 'Не удалось оформить заявку' }, { status: 500 })
  }

  const publicLink = `https://invoices.kz/view/${invoice.public_token}`
  // clientName comes straight from an anonymous public POST body -- HTML-
  // escaped before going into the email body so a buyer can't inject markup
  // (a fake "click here" link, broken layout) into mail sent from our own
  // mail@invoices.kz address. companyName is seller-controlled (set once at
  // Kaspi Shop connect time), escaped too for defense-in-depth.
  const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  try {
    await resend.emails.send({
      from: 'invoices.kz <mail@invoices.kz>',
      to: clientEmail,
      subject: `Счёт №${invoiceNumber} на ${total.toLocaleString('ru-KZ')} ₸ от ${storefront.companyName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1C2056; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">INVOICES.KZ</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; color: #374151;">Здравствуйте, <strong>${escapeHtml(clientName)}</strong>!</p>
            <p style="color: #6b7280;">Ваша заявка у ${escapeHtml(storefront.companyName)} оформлена. Счёт на оплату — по ссылке ниже.</p>
            <a href="${publicLink}" style="display: inline-block; margin-top: 12px; background: #1C2056; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Открыть счёт №${invoiceNumber}</a>
          </div>
        </div>
      `,
    })
  } catch (e: any) {
    // Best-effort -- the счёт already exists and is reachable via the
    // returned link either way, so a mail hiccup must not fail the order.
    console.error('wholesale-order: confirmation email failed (non-fatal)', e.message)
  }

  return NextResponse.json({ publicToken: invoice.public_token })
}
