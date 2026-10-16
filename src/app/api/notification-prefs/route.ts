import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  NOTIFICATION_EVENTS,
  LEGACY_TELEGRAM_MASTER_EVENT,
  NOTIFY_PROFILE_COLUMNS,
  getNotificationEvent,
  isToggleable,
  legacyColumnFor,
  legacyTelegramMaster,
  resolveAllPrefs,
  type NotifyProfile,
} from '@/lib/notificationPrefs'
import { isMissingSchemaError, selectWithNotificationPrefs } from '@/lib/notificationPrefsServer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function authUser(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!accessToken) return null
  const { data: { user } } = await supabaseAuth.auth.getUser(accessToken)
  return user
}

async function loadOwnProfile(userId: string) {
  return selectWithNotificationPrefs<NotifyProfile>(NOTIFY_PROFILE_COLUMNS, cols =>
    supabase.from('profiles').select(cols).eq('id', userId).maybeSingle() as any,
  )
}

// Настройки уведомлений текущего пользователя: каталог событий (для
// страницы) + действующее значение каждого тумблера (явный выбор или
// значение по умолчанию). migrated=false — колонка notification_prefs ещё не
// создана: тумблеры Telegram по отдельным событиям сохранить нельзя.
export async function GET(req: NextRequest) {
  const user = await authUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await loadOwnProfile(user.id)
  if (error) return NextResponse.json({ error: 'lookup_failed' }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json(
    {
      migrated: Object.prototype.hasOwnProperty.call(profile, 'notification_prefs'),
      telegramConnected: !!profile.telegram_chat_id,
      hasEmail: !!profile.email,
      // Старый общий рубильник Telegram — до миграции страница показывает
      // его одним тумблером «Все уведомления в Telegram».
      telegramMaster: legacyTelegramMaster(profile),
      events: NOTIFICATION_EVENTS.map(e => ({
        key: e.key,
        audience: e.audience,
        group: e.group,
        channels: e.channels,
        toggleable: e.toggleable,
        managedAt: e.managedAt ?? null,
      })),
      values: resolveAllPrefs(profile),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

// Один тумблер за запрос: { event, channel, value }. Пишется ровно один
// ключ notification_prefs одной атомарной функцией (set_notification_pref) —
// два быстрых переключения не затирают друг друга, другие колонки профиля
// (тариф, админ, кошелёк, Telegram) этот маршрут не трогает вовсе.
export async function PATCH(req: NextRequest) {
  const user = await authUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }) }
  const event = typeof body?.event === 'string' ? body.event : ''
  const channel = typeof body?.channel === 'string' ? body.channel : ''
  const value = body?.value

  // Общий рубильник Telegram (старая колонка notify_telegram) — до миграции
  // единственный способ выключить/включить Telegram, не отвязывая бота.
  if (event === LEGACY_TELEGRAM_MASTER_EVENT) {
    if (channel !== 'telegram' || typeof value !== 'boolean') {
      return NextResponse.json({ error: 'invalid_toggle' }, { status: 400 })
    }
    const { error } = await supabase.from('profiles').update({ notify_telegram: value }).eq('id', user.id)
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, event, channel, value, legacy: true })
  }
  const def = getNotificationEvent(event)
  if (!def || typeof value !== 'boolean' || !isToggleable(event, channel)) {
    return NextResponse.json({ error: 'invalid_toggle' }, { status: 400 })
  }

  // Приветственная цепочка — своя колонка-отписка, её же читают крон и
  // ссылка «отписаться» из письма.
  if (def.key === 'welcome_series') {
    const { error } = await supabase.from('profiles').update({ email_optout: !value }).eq('id', user.id)
    if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, event, channel, value })
  }

  const { error: rpcError } = await supabase.rpc('set_notification_pref', {
    p_user: user.id, p_event: def.key, p_channel: channel, p_value: value,
  })
  if (!rpcError) return NextResponse.json({ ok: true, event, channel, value })

  const migrationPending = isMissingSchemaError(rpcError, 'set_notification_pref') || isMissingSchemaError(rpcError, 'notification_prefs')
  if (!migrationPending) {
    console.error('notification-prefs: save failed for user', user.id, ':', rpcError.message)
    return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  }

  // До миграции: письма с собственной старой колонкой сохраняем в неё (её же
  // читает отправитель как значение по умолчанию). Остальное хранить негде.
  const legacy = legacyColumnFor(def.key, channel)
  if (!legacy) return NextResponse.json({ error: 'migration_pending' }, { status: 409 })
  const { error: legacyError } = await supabase.from('profiles').update({ [legacy]: value }).eq('id', user.id)
  if (legacyError) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ ok: true, event, channel, value, legacy: true })
}
