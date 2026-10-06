// src/app/api/print/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import opentype from 'opentype.js'
import { priceForSize, type KeychainSize } from '@/lib/printShop/pricing'
import { findPrintShopFont } from '@/lib/printShop/fonts'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_TEXT_LENGTH = 20
const VALID_SIZES = new Set(['S', 'M', 'L'])
const VALID_COLORS = new Set(['белый', 'чёрный', 'серый', 'жёлтый', 'зелёный', 'красный', 'бордовый'])

// Task 7's review found that none of the 20 curated fonts have glyphs for
// extended Kazakh Cyrillic (Ә Ғ Қ Ң Ө Ұ Ү Һ І) -- some fonts silently render
// a ".notdef" box for a missing character, others make buildKeychainGeometries
// throw deep inside order fulfillment, AFTER the customer has already paid.
// glyph index 0 is the OpenType spec's ground-truth "this font cannot draw
// this character" signal regardless of what a given font happens to draw in
// that slot, so checking it here -- before an order (and a real payment) can
// even be created -- is the fix, not an optional nice-to-have.
async function fontSupportsText(fontId: string, text: string): Promise<boolean> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'print-shop', `${fontId}.ttf`))
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  for (const char of text) {
    if (font.charToGlyphIndex(char) === 0) return false
  }
  return true
}

// Public, unauthenticated -- the price is ALWAYS recomputed server-side from
// `size` via priceForSize, never taken from the client body, so a tampered
// request can't buy a keychain for less than its real price.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const fontId = typeof body?.font === 'string' ? body.font : ''
  const size = typeof body?.size === 'string' ? body.size : ''
  const ringAtEnd = body?.ringAtEnd === true
  const baseColor = typeof body?.baseColor === 'string' ? body.baseColor : ''
  const textColor = typeof body?.textColor === 'string' ? body.textColor : ''
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
  const customerPhone = normalizeKzPhone(typeof body?.customerPhone === 'string' ? body.customerPhone : '')
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null

  if (!text || text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'Укажите текст брелка (до 20 символов)' }, { status: 400 })
  if (!findPrintShopFont(fontId)) return NextResponse.json({ error: 'Неизвестный шрифт' }, { status: 400 })
  if (!VALID_SIZES.has(size)) return NextResponse.json({ error: 'Неизвестный размер' }, { status: 400 })
  if (!VALID_COLORS.has(baseColor) || !VALID_COLORS.has(textColor)) return NextResponse.json({ error: 'Неизвестный цвет' }, { status: 400 })
  if (!customerName) return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
  if (!customerPhone) return NextResponse.json({ error: 'Укажите телефон' }, { status: 400 })

  // Defensive: fontId is already a known font at this point, so the file
  // read below should always succeed -- but if the static .ttf is ever
  // missing or unreadable, fail closed with a clean JSON error instead of
  // crashing the route with an unhandled exception.
  let supported: boolean
  try {
    supported = await fontSupportsText(fontId, text)
  } catch (e: any) {
    console.error('print-shop glyph validation failed to load font', fontId, ':', e.message)
    return NextResponse.json({ error: 'Не удалось проверить шрифт. Попробуйте ещё раз' }, { status: 500 })
  }
  if (!supported) {
    return NextResponse.json({ error: 'Этот шрифт не поддерживает один из символов в тексте — попробуйте другой шрифт' }, { status: 400 })
  }

  const price = priceForSize(size as KeychainSize)

  const { data: inserted, error } = await supabase
    .from('print_orders')
    .insert({
      font: fontId,
      text,
      ring_at_end: ringAtEnd,
      base_color: baseColor,
      text_color: textColor,
      size,
      price,
      customer_name: customerName,
      customer_phone: customerPhone,
      note,
    })
    .select('id')
    .single()
  if (error || !inserted) {
    console.error('print-shop order create failed:', error?.message)
    return NextResponse.json({ error: 'Не удалось оформить заказ' }, { status: 500 })
  }

  return NextResponse.json({ orderId: inserted.id })
}
