import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kaspiShopPlanGate } from '@/lib/kaspiShop/planGate'
import { startPhoneLogin } from '@/lib/kaspiShop/cabinetAuth'
import { normalizeKzPhone, formatKzPhone } from '@/lib/kzPhone'
import { connectErrorMessage } from '@/lib/kaspiShop/connectMessages'
import { claimConnectSmsSlots, releaseConnectSmsSlots, isConnectionRefusal } from '@/lib/kaspiShop/connectSmsLimits'

// Счётчики лимитов лежат в базе: нужен сервисный ключ (как в остальных маршрутах).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Русские тексты наших собственных отказов берутся из connectMessages (тот же
// источник, по которому страница показывает kk/en); `code` в ответе остаётся.
const STEP_PHONE = { step: 'phone', resumable: false } as const

async function requireUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  return user
}

// Step 1 of the real cabinet login (phone + SMS, confirmed live 2026-08-13
// -- see docs/superpowers/specs/2026-08-12-kaspi-cabinet-api-findings.md).
// Nothing is saved yet -- POST /api/kaspi-shop/connect/otp completes the
// login and does the actual save + auto-import.
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notPro = await kaspiShopPlanGate(user.id)
  if (notPro) return notPro

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
  }
  // K48: phone -- только строка с настоящим казахстанским номером (десять
  // национальных цифр). Объект/число/массив раньше уходили в вызов Kaspi как есть.
  const rawPhone = body?.phone
  if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
    return NextResponse.json({ error: connectErrorMessage('ru', 'phone_required', STEP_PHONE)!, code: 'phone_required' }, { status: 400 })
  }
  // Больше одиннадцати цифр это не номер: normalizeKzPhone молча обрезал бы хвост
  // («+7 777 123 45 67 89» ушёл бы как 777 123 45 67), и SMS пришла бы не тому, кого
  // человек ввёл. Ровно одиннадцать цифр -- это код страны + десять, и начинаться они
  // могут только с 7 или 8: «+1 777 123 45 67» normalizeKzPhone тоже обрезал бы до
  // чужого «+7 177 712 34 56». Такой ввод отклоняем, а не угадываем.
  const digits = rawPhone.replace(/\D/g, '')
  if (
    rawPhone.length > 40 || digits.length > 11
    || (digits.length === 11 && digits[0] !== '7' && digits[0] !== '8')
    || !normalizeKzPhone(rawPhone)
    // Казахстанский национальный номер начинается с 7: «1771234567» ушёл бы как «+7 177…», то есть чужому абоненту.
    || normalizeKzPhone(rawPhone)![2] !== '7'
  ) {
    return NextResponse.json({ error: connectErrorMessage('ru', 'phone_invalid', STEP_PHONE)!, code: 'phone_invalid' }, { status: 400 })
  }
  // В Kaspi уходит тот же вид «+7 777 123 45 67», что и из поля ввода кабинета
  // (так вход подтверждён вживую), а не произвольный текст из запроса.
  const phone = formatKzPhone(rawPhone)

  // K48: каждый вызов заставляет Kaspi слать SMS постороннему человеку с общего
  // IP сервера. Слот занимается ДО обращения к Kaspi и не возвращается, если Kaspi
  // отказал: неудачные попытки тоже считаются. Исключение: соединение с Kaspi не
  // установилось (отказ, нет адреса: kaspi_unreachable с кодом из isConnectionRefusal) --
  // до него запрос не дошёл, SMS не отправлялась, слоты возвращаются. На таймаут и
  // обрыв слоты не возвращаются: Kaspi мог принять запрос и отправить SMS.
  const slotsAt = Date.now()
  const limit = await claimConnectSmsSlots(supabase, req.headers, user.id, phone, slotsAt)
  if (!limit.ok) {
    if (limit.reason === 'error') {
      return NextResponse.json({ error: connectErrorMessage('ru', 'limit_unavailable', STEP_PHONE)!, code: 'limit_unavailable' }, { status: 503 })
    }
    return NextResponse.json(
      {
        error: connectErrorMessage('ru', 'rate_limited', { ...STEP_PHONE, scope: limit.scope, retryAfterSec: limit.retryAfterSec })!,
        code: 'rate_limited',
        scope: limit.scope,
        retryAfterSec: limit.retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  const result = await startPhoneLogin(phone)
  if (result.status !== 'otp_required') {
    if (result.status === 'error') {
      if (result.code === 'kaspi_unreachable' && isConnectionRefusal(result.detail)) await releaseConnectSmsSlots(supabase, req.headers, user.id, phone, slotsAt)
      return NextResponse.json(
        { error: result.message, code: result.code, detail: result.detail },
        { status: result.code === 'kaspi_unreachable' ? 502 : 400 },
      )
    }
    return NextResponse.json({ error: 'Неожиданный ответ Kaspi' }, { status: 400 })
  }
  return NextResponse.json({ status: 'otp_required', otpToken: result.otpToken })
}
