import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadTenantConnectionByAgentId } from '@/lib/aiAgent/webhookHandler'
import {
  setInstagramIceBreakers, getInstagramIceBreakers, deleteInstagramIceBreakers,
  getInstagramSubscribedFields, setInstagramSubscribedFields, InstagramApiError,
} from '@/lib/instagram'
import { DEFAULT_ICE_BREAKERS, buildIceBreakersBody, validateIceBreakers } from '@/lib/instagramIceBreakers'

// Админ-маршрут «готовых вопросов» (Ice Breakers) Instagram-аккаунта агента.
// Защита та же, что у /api/instagram/setup-webhook: заголовок x-internal-secret
// = IG_AUTOMATION_SECRET. Клиентского интерфейса нет намеренно.
//
//   GET    ?agentId=...            прочитать установленные вопросы и поля вебхука аккаунта
//   POST   {agentId, items?, confirm?, subscribePostbacks?}
//                                  БЕЗ confirm: true -- только показывает, что будет
//                                  отправлено (сухой прогон, к Meta не обращается).
//                                  С confirm: true -- ставит вопросы (по умолчанию
//                                  DEFAULT_ICE_BREAKERS); с subscribePostbacks: true
//                                  ещё подписывает аккаунт на messaging_postbacks
//                                  (иначе нажатия до нас не дойдут).
//   DELETE {agentId, confirm: true} снять вопросы
//
// Нажатия приходят вебхуком messaging_postbacks, поэтому, кроме вопросов,
// нужны ДВЕ подписки: на уровне приложения Meta (Webhooks -> Instagram ->
// messaging_postbacks) и на уровне аккаунта (subscribePostbacks).

export const dynamic = 'force-dynamic'

const POSTBACK_FIELDS = ['comments', 'messages', 'messaging_postbacks']

function authorized(req: NextRequest): boolean {
  const given = req.headers.get('x-internal-secret')
  const expected = process.env.IG_AUTOMATION_SECRET
  if (!given || !expected) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function metaError(err: unknown) {
  const status = err instanceof InstagramApiError ? err.status : 500
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Meta API error' }, { status: status >= 400 && status < 600 ? status : 502 })
}

async function connectionFor(agentId: unknown) {
  if (typeof agentId !== 'string' || !agentId) return { error: NextResponse.json({ error: 'agentId required' }, { status: 400 }) }
  const conn = await loadTenantConnectionByAgentId(agentId)
  if (!conn) return { error: NextResponse.json({ error: 'no active instagram connection for this agent' }, { status: 404 }) }
  return { conn }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { conn, error } = await connectionFor(req.nextUrl.searchParams.get('agentId'))
  if (!conn) return error!
  try {
    const [iceBreakers, subscribed] = await Promise.all([
      getInstagramIceBreakers(conn.externalAccountId, conn.accessToken),
      getInstagramSubscribedFields(conn.accessToken),
    ])
    return NextResponse.json({ iceBreakers, subscribed })
  } catch (err) {
    return metaError(err)
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const { conn, error } = await connectionFor(body?.agentId)
  if (!conn) return error!

  const items = body?.items === undefined ? DEFAULT_ICE_BREAKERS : body.items
  const checked = validateIceBreakers(items)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  if (body?.confirm !== true) {
    return NextResponse.json({
      dryRun: true,
      note: 'Ничего не отправлено. Повторите запрос с "confirm": true.',
      willSet: buildIceBreakersBody(checked.items),
      willSubscribe: body?.subscribePostbacks === true ? POSTBACK_FIELDS : null,
    })
  }

  try {
    await setInstagramIceBreakers(conn.externalAccountId, conn.accessToken, checked.items)
    if (body?.subscribePostbacks === true) {
      await setInstagramSubscribedFields(conn.accessToken, POSTBACK_FIELDS)
    }
    return NextResponse.json({ ok: true, set: checked.items, subscribed: body?.subscribePostbacks === true ? POSTBACK_FIELDS : undefined })
  } catch (err) {
    return metaError(err)
  }
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const { conn, error } = await connectionFor(body?.agentId)
  if (!conn) return error!
  if (body?.confirm !== true) {
    return NextResponse.json({ dryRun: true, note: 'Ничего не удалено. Повторите запрос с "confirm": true.' })
  }
  try {
    await deleteInstagramIceBreakers(conn.externalAccountId, conn.accessToken)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return metaError(err)
  }
}
