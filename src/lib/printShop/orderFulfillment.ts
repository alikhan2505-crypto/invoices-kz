// src/lib/printShop/orderFulfillment.ts
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as opentype from 'opentype.js'
import { buildKeychainGeometries } from './keychainGeometry'
import { exportGeometryToSTL } from './stlExport'
import { findPrintShopFont } from './fonts'
import { loadPrintShopOwnerTelegramChatId } from './ownerAccount'
import { sendTelegramNotification } from '@/lib/telegramNotify'
import type { KeychainSize } from './pricing'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PrintOrderRow = {
  id: string
  font: string
  text: string
  ring_at_end: boolean
  base_color: string
  text_color: string
  size: KeychainSize
  price: number
  customer_name: string
  customer_phone: string
  note: string | null
}

// Same shape as the established pattern in src/app/api/telegram/route.ts,
// src/app/api/instagram/webhook/route.ts and src/app/api/account/delete/
// route.ts (added by the 2026-09-13 security audit, which found this exact
// bug class elsewhere): sendTelegramNotification posts with
// parse_mode: 'HTML', so ANY customer-controlled substring must be escaped.
// Unescaped, a bare '<' ("Аня <3", "рост < 5 см") makes Telegram answer 400
// and the only notification of a real paid order disappears; a deliberate
// <a href="http://evil.com"> in `note` would render as a live link in a
// message the shop owner implicitly trusts.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function loadFontFile(fontId: string): Promise<opentype.Font> {
  const meta = findPrintShopFont(fontId)
  if (!meta) throw new Error(`unknown print shop font: ${fontId}`)
  // Server side reads the SAME static file the client fetches over HTTP
  // (public/fonts/print-shop/<id>.ttf) directly off disk -- no network
  // round-trip needed, and it's the one guaranteed-available copy during
  // the webhook's short time budget.
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'print-shop', `${fontId}.ttf`))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

/**
 * Runs once a print order's Kaspi payment settles (see settlePayment.ts's
 * print_order_id branch): rebuilds the keychain geometry from the order's
 * OWN stored parameters (never trusts whatever the client's live preview
 * sent), exports two STLs (base + text, for two-color slicing), uploads
 * them to the public print-orders Storage bucket, and pings the shop
 * owner's Telegram with the order details and both file links.
 */
export async function handlePrintOrderPaid(printOrderId: string): Promise<void> {
  try {
    await fulfillPrintOrder(printOrderId)
  } catch (e: any) {
    // The payment has ALREADY settled by the time we get here (see
    // settlePayment.ts -- the row is claimed and marked 'paid' before this
    // branch runs, deliberately), and nothing retries this. Without a
    // notification the only trace is a console.error in serverless logs
    // nobody watches, so a real paid order would be completely invisible.
    //
    // Deliberately the most minimal message possible -- the order id and
    // nothing else, no customer-controlled text at all -- so it cannot hit
    // the same failure mode as the rich message in fulfillPrintOrder (an
    // HTML-parse rejection, an over-long field, ...). A UUID is inert.
    await alertOwnerOfFulfillmentFailure(printOrderId)
    throw e
  }
}

/**
 * Best-effort "something broke" ping on the one channel that does not depend
 * on whatever just failed. Never throws: it runs on an error path, and
 * masking the original fulfillment error with a secondary failure here would
 * destroy the only diagnostic information there is.
 */
async function alertOwnerOfFulfillmentFailure(printOrderId: string): Promise<void> {
  try {
    const chatId = await loadPrintShopOwnerTelegramChatId()
    if (!chatId) {
      console.error('Print shop: fulfillment failed for', printOrderId, 'AND owner has no telegram_chat_id — no alert could be sent')
      return
    }
    await sendTelegramNotification(
      chatId,
      `⚠️ Заказ ${printOrderId} оплачен, но не удалось подготовить файлы для печати — проверьте вручную.`
    )
  } catch (alertError: any) {
    console.error('Print shop: could not alert owner about failed fulfillment of', printOrderId, ':', alertError?.message)
  }
}

async function fulfillPrintOrder(printOrderId: string): Promise<void> {
  const { data: order, error } = await supabase
    .from('print_orders')
    .select('id, font, text, ring_at_end, base_color, text_color, size, price, customer_name, customer_phone, note')
    .eq('id', printOrderId)
    .single()
  if (error || !order) throw new Error(`print order ${printOrderId} not found: ${error?.message}`)
  const row = order as PrintOrderRow

  const font = await loadFontFile(row.font)
  const { baseGeometry, textGeometry } = buildKeychainGeometries({
    font, text: row.text, size: row.size, ringAtEnd: row.ring_at_end,
  })
  const baseStl = exportGeometryToSTL(baseGeometry)
  const textStl = exportGeometryToSTL(textGeometry)

  const basePath = `${printOrderId}/base.stl`
  const textPath = `${printOrderId}/text.stl`
  // upsert: true is what makes this whole function safely re-runnable. Without
  // it a second run for the same order (a manual re-fulfillment after a
  // failure, which is the ONLY retry story there is -- nothing automated
  // retries) collides on the already-uploaded object and throws again, so the
  // order could never be rescued. The STLs are rebuilt deterministically from
  // the order's own stored parameters, so overwriting is always a no-op or a
  // correction, never a loss.
  const [baseUpload, textUpload] = await Promise.all([
    supabase.storage.from('print-orders').upload(basePath, baseStl, { contentType: 'model/stl', upsert: true }),
    supabase.storage.from('print-orders').upload(textPath, textStl, { contentType: 'model/stl', upsert: true }),
  ])
  if (baseUpload.error) throw new Error(`STL upload (base) failed for ${printOrderId}: ${baseUpload.error.message}`)
  if (textUpload.error) throw new Error(`STL upload (text) failed for ${printOrderId}: ${textUpload.error.message}`)

  const baseUrl = supabase.storage.from('print-orders').getPublicUrl(basePath).data.publicUrl
  const textUrl = supabase.storage.from('print-orders').getPublicUrl(textPath).data.publicUrl

  const { error: updateError } = await supabase.from('print_orders').update({ base_stl_path: basePath, text_stl_path: textPath }).eq('id', printOrderId)
  if (updateError) {
    console.error(`Failed to update print order ${printOrderId} with STL paths: ${updateError.message}`)
  }

  const chatId = await loadPrintShopOwnerTelegramChatId()
  if (chatId) {
    const fontMeta = findPrintShopFont(row.font)
    const lines = [
      `🔑 Новый заказ брелка — ${row.price.toLocaleString('ru-KZ')} ₸`,
      `Текст: «${escapeHtml(row.text)}»`,
      `Шрифт: ${fontMeta?.label ?? row.font}`,
      `Размер: ${row.size}, кольцо: ${row.ring_at_end ? 'в конце' : 'в начале'}`,
      `Цвета: основа ${row.base_color}, текст ${row.text_color}`,
      `Клиент: ${escapeHtml(row.customer_name)}, ${row.customer_phone}`,
      row.note ? `Комментарий: ${escapeHtml(row.note)}` : null,
      '',
      `STL основа: ${baseUrl}`,
      `STL текст: ${textUrl}`,
    ].filter(Boolean)
    await sendTelegramNotification(chatId, lines.join('\n'))
  } else {
    console.error('Print shop: owner has no telegram_chat_id configured, order', printOrderId, 'notification skipped')
  }
}
