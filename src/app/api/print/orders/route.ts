// src/app/api/print/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as opentype from 'opentype.js'
import { priceForSize, DEFAULT_RING_SIZE, type KeychainSize, type RingSize } from '@/lib/printShop/pricing'
import { findPrintShopFont } from '@/lib/printShop/fonts'
import { buildKeychainGeometries } from '@/lib/printShop/keychainGeometry'
import { normalizeKzPhone } from '@/lib/kaspiPay/phone'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_TEXT_LENGTH = 20
const VALID_SIZES = new Set(['S', 'M', 'L'])
const VALID_RING_SIZES = new Set(['S', 'M', 'L'])
const VALID_COLORS = new Set(['белый', 'чёрный', 'серый', 'жёлтый', 'зелёный', 'красный', 'бордовый'])

// Task 7's review found that none of the 20 curated fonts have glyphs for
// extended Kazakh Cyrillic (Ә Ғ Қ Ң Ө Ұ Ү Һ І) -- some fonts silently render
// a ".notdef" box for a missing character, others make buildKeychainGeometries
// throw deep inside order fulfillment, AFTER the customer has already paid.
// glyph index 0 is the OpenType spec's ground-truth "this font cannot draw
// this character" signal regardless of what a given font happens to draw in
// that slot, so checking it here -- before an order (and a real payment) can
// even be created -- is the fix, not an optional nice-to-have.
async function loadFontFile(fontId: string): Promise<opentype.Font> {
  const buf = await readFile(path.join(process.cwd(), 'public', 'fonts', 'print-shop', `${fontId}.ttf`))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

function fontSupportsText(font: opentype.Font, text: string): boolean {
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
  // Optional and independent of `size` -- defaults to DEFAULT_RING_SIZE
  // (same default buildKeychainGeometries itself falls back to when
  // ringSize is omitted) so older/simpler clients still work.
  const ringSize = typeof body?.ringSize === 'string' && body.ringSize ? body.ringSize : DEFAULT_RING_SIZE
  const baseColor = typeof body?.baseColor === 'string' ? body.baseColor : ''
  const textColor = typeof body?.textColor === 'string' ? body.textColor : ''
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : ''
  const customerPhone = normalizeKzPhone(typeof body?.customerPhone === 'string' ? body.customerPhone : '')
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null

  if (!text || text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'Укажите текст брелка (до 20 символов)' }, { status: 400 })
  if (!findPrintShopFont(fontId)) return NextResponse.json({ error: 'Неизвестный шрифт' }, { status: 400 })
  if (!VALID_SIZES.has(size)) return NextResponse.json({ error: 'Неизвестный размер' }, { status: 400 })
  if (!VALID_RING_SIZES.has(ringSize)) return NextResponse.json({ error: 'Неизвестный размер кольца' }, { status: 400 })
  if (!VALID_COLORS.has(baseColor) || !VALID_COLORS.has(textColor)) return NextResponse.json({ error: 'Неизвестный цвет' }, { status: 400 })
  if (!customerName) return NextResponse.json({ error: 'Укажите имя' }, { status: 400 })
  if (!customerPhone) return NextResponse.json({ error: 'Укажите телефон' }, { status: 400 })

  // Defensive: fontId is already a known font at this point, so the file
  // read below should always succeed -- but if the static .ttf is ever
  // missing or unreadable, fail closed with a clean JSON error instead of
  // crashing the route with an unhandled exception.
  let font: opentype.Font
  try {
    font = await loadFontFile(fontId)
  } catch (e: any) {
    console.error('print-shop glyph validation failed to load font', fontId, ':', e.message)
    return NextResponse.json({ error: 'Не удалось проверить шрифт. Попробуйте ещё раз' }, { status: 500 })
  }
  if (!fontSupportsText(font, text)) {
    return NextResponse.json({ error: 'Этот шрифт не поддерживает один из символов в тексте — попробуйте другой шрифт' }, { status: 400 })
  }

  // Glyph coverage is only a SUBSET of "this text can be 3D-printed":
  // buildKeychainGeometries also throws "produced no drawable glyph outlines"
  // and "could not place the key-ring hole", and opentype.js 2.0's GSUB
  // handling can throw on multi-character strings for some fonts (see
  // scripts/fetch-print-shop-fonts.mjs). Those paths used to surface only
  // inside order fulfillment -- i.e. AFTER the customer had already paid,
  // where the failure is invisible to them and nothing retries it.
  //
  // Running the EXACT function fulfillment will later run, with the exact
  // same parameters, is what makes this check genuinely complete: if it
  // passes here, it passes there.
  try {
    buildKeychainGeometries({ font, text, size: size as KeychainSize, ringAtEnd, ringSize: ringSize as RingSize })
  } catch (e: any) {
    console.error('print-shop geometry pre-check failed for font', fontId, 'text', JSON.stringify(text), ':', e.message)
    return NextResponse.json({ error: 'Не удалось построить модель для этого текста — попробуйте другой шрифт или текст' }, { status: 400 })
  }

  const price = priceForSize(size as KeychainSize)

  const { data: inserted, error } = await supabase
    .from('print_orders')
    .insert({
      font: fontId,
      text,
      ring_at_end: ringAtEnd,
      ring_size: ringSize,
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
