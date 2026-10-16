import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { isMissingColumnError } from '@/lib/aiAgent/setupWizard'

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

// Same admin-only gating as every other ai-agent route (see
// src/app/api/ai-agent/settings/route.ts for the rationale).
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

// Hard delete -- MoonAI-style (docs/superpowers/mooonai-research-findings.md
// §8): no archive/soft-delete path, the UI gates this behind a
// type-the-agent's-name confirm modal.
//
// Порядок (переписан 15.10.2026). Почти все дочерние таблицы уже ссылаются
// на агента/диалоги с ON DELETE CASCADE (conversations, messages,
// channel_connections, reply_templates, flows, invoice_drafts) -- проверено
// по pg_constraint. Без каскада остались четыре ссылки:
//   ai_agent_booking_drafts.agent_id и .conversation_id -- черновики записи
//     принадлежат агенту; РАЗОБРАННЫЕ (confirmed/rejected) удаляются вместе
//     с ним, а пока есть неразобранные (pending_approval / confirming /
//     error -- это входящие заявки планировщика салона), удаление
//     отклоняется с 409, см. UNRESOLVED_BOOKING_DRAFT_STATUSES;
//   ai_agent_broadcasts.agent_id -- история рассылок агента, удаляется;
//   salon_bookings.conversation_id -- САМА ЗАПИСЬ клиента принадлежит салону,
//     а не агенту: она остаётся в планировщике, отвязывается от диалога.
// Раньше маршрут сначала стирал сообщения, потом падал на диалогах из-за
// этих ссылок: история пропадала, а агент оставался («Не удалось удалить»).
// Теперь сначала убираются/отвязываются только эти четыре ссылки, а затем
// агент удаляется ОДНИМ запросом. Атомарен только этот последний шаг
// (каскад: диалоги, сообщения, подключения, шаблоны, сценарии, черновики
// счетов -- либо всё, либо ничего). Подготовительные шаги до него -- нет:
// если финальное удаление агента упадёт, переписка и настройки останутся,
// но уже удалённые разобранные черновики записи и история рассылок не
// вернутся, а записи салона останутся отвязанными от диалогов.
// supabase/migrations/ai_agent_delete_cascade.sql переводит эти четыре
// ссылки на CASCADE / SET NULL; шаги ниже работают и до, и после неё.
const IN_CHUNK = 200

// Черновики записи, которые салон ещё не разобрал: заявка ждёт
// подтверждения, подтверждается прямо сейчас или упала с ошибкой и ждёт
// повтора. Удалить их вместе с агентом -- значит молча потерять заявки
// клиентов из планировщика.
const UNRESOLVED_BOOKING_DRAFT_STATUSES = ['pending_approval', 'confirming', 'error']

function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

function pendingBookingDraftsMessage(count: number): string {
  const what = ruPlural(count, 'необработанная заявка', 'необработанные заявки', 'необработанных заявок')
  return `Нельзя удалить агента: в планировщике салона ${count} ${what} на запись от этого агента. Подтвердите или отклоните их в планировщике, затем удалите агента.`
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { id } = await params

  // Ownership check first -- the service-role client bypasses RLS, so
  // without the user_id filter any authenticated admin could delete another
  // user's agent by guessing its uuid.
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: conversations, error: convListError } = await supabase
    .from('ai_agent_conversations')
    .select('id')
    .eq('agent_id', agent.id)
  if (convListError) return NextResponse.json({ error: convListError.message }, { status: 500 })
  const conversationIds = (conversations || []).map(c => c.id)

  // Неразобранные заявки на запись -- отказ ДО любых изменений. Проверка и
  // по agent_id, и по диалогам агента (те же две ссылки, что и ниже).
  const { count: byAgent, error: pendingError } = await supabase
    .from('ai_agent_booking_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .in('status', UNRESOLVED_BOOKING_DRAFT_STATUSES)
  if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
  let pendingDrafts = byAgent ?? 0
  if (pendingDrafts === 0) {
    for (let i = 0; i < conversationIds.length; i += IN_CHUNK) {
      const { count, error } = await supabase
        .from('ai_agent_booking_drafts')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', conversationIds.slice(i, i + IN_CHUNK))
        .in('status', UNRESOLVED_BOOKING_DRAFT_STATUSES)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      pendingDrafts += count ?? 0
    }
  }
  if (pendingDrafts > 0) {
    return NextResponse.json(
      { error: 'pending_booking_drafts', count: pendingDrafts, message: pendingBookingDraftsMessage(pendingDrafts) },
      { status: 409 },
    )
  }

  // Записи салона остаются, только теряют ссылку на удаляемый диалог.
  for (let i = 0; i < conversationIds.length; i += IN_CHUNK) {
    const { error } = await supabase
      .from('salon_bookings')
      .update({ conversation_id: null })
      .in('conversation_id', conversationIds.slice(i, i + IN_CHUNK))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Черновики записи (здесь уже только разобранные -- см. проверку выше):
  // по агенту, и на всякий случай по его диалогам (у
  // черновика agent_id и conversation_id всегда одного агента, но ссылка по
  // диалогу тоже без каскада, и её пропуск снова уронил бы удаление).
  const { error: draftError } = await supabase.from('ai_agent_booking_drafts').delete().eq('agent_id', agent.id)
  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 })
  for (let i = 0; i < conversationIds.length; i += IN_CHUNK) {
    const { error } = await supabase
      .from('ai_agent_booking_drafts')
      .delete()
      .in('conversation_id', conversationIds.slice(i, i + IN_CHUNK))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error: broadcastError } = await supabase.from('ai_agent_broadcasts').delete().eq('agent_id', agent.id)
  if (broadcastError) return NextResponse.json({ error: broadcastError.message }, { status: 500 })

  // Один запрос: каскад удаляет диалоги, сообщения, подключения каналов,
  // шаблоны, сценарии и черновики счетов вместе с агентом -- или ничего.
  const { error: agentError } = await supabase.from('ai_agents').delete().eq('id', agent.id).eq('user_id', user.id)
  if (agentError) return NextResponse.json({ error: agentError.message }, { status: 500 })

  return NextResponse.json({ deleted: true })
}

// Тумблер «Статус бота» (15.10.2026) сохраняется сразу, а не по общей кнопке
// «Сохранить»: раньше выключение молча терялось, если владелец уходил со
// вкладки, не нажав её. Маршрут принимает ТОЛЬКО isEnabled -- остальные поля
// формы по-прежнему идут через POST /api/ai-agent/settings со всей его
// валидацией (name/tone/goal обязательны там, а здесь их нет).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.isEnabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid isEnabled' }, { status: 400 })
  }

  // user_id в фильтре -- та же проверка владельца, что и в DELETE выше:
  // service-role клиент обходит RLS.
  const { data, error } = await supabase
    .from('ai_agents')
    .update({ is_enabled: body.isEnabled })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, is_enabled')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Включили агента-черновик мастера тумблером в настройках, мимо
  // «Запустить»: он уже отвечает клиентам, значит, запущен -- иначе в списке
  // висел бы «Черновик» у работающего агента. Только пустой launched_at,
  // best-effort: до миграции колонки нет, и ошибка здесь тумблер не ломает.
  if (body.isEnabled) {
    const { error: launchError } = await supabase
      .from('ai_agents')
      .update({ launched_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('user_id', user.id)
      .is('launched_at', null)
    if (launchError && !isMissingColumnError(launchError, 'launched_at')) {
      console.error('ai-agent PATCH: launched_at update failed for', data.id, ':', launchError.message)
    }
  }

  return NextResponse.json({ agent: { id: data.id, isEnabled: !!data.is_enabled } })
}
