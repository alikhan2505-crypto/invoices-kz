import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasAiAgentPlan, AI_AGENT_PROFILE_COLUMNS } from '@/lib/aiAgent/planGate'
import { canLaunch, canUseSetupWizard, parseLaunchMode, isMissingColumnError, launchKnowledgeOk } from '@/lib/aiAgent/setupWizard'

// «Запустить» -- последний шаг мастера /ai-agent/setup (16.10.2026).
// Агент-черновик до этого выключен (is_enabled = false) и клиентам не
// отвечает. Запуск: is_enabled = true, launched_at = now(), status = active
// («Отвечать клиентам сразу», по умолчанию) или training («Сначала
// показывать ответы мне»). Без работающего канала -- отказ (решение 2).
// Без описания бизнеса от 80 символов и без Kaspi Bot -- тоже отказ (B10):
// мастер не пускает дальше шага 2, но адрес ?step=4 или прямой запрос к API
// не должны выпускать к клиентам агента, который ничего не знает о бизнесе.
//
// Колонки launched_at до миграции ai_agent_launch.sql нет -- тогда запуск
// пишет только is_enabled и status, как и раньше.

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select(AI_AGENT_PROFILE_COLUMNS).eq('id', user.id).maybeSingle()
  if (!hasAiAgentPlan(profile)) return NextResponse.json({ error: 'admin_only' }, { status: 403 })
  // Мастер пока только для админов (решение 4) -- и его маршрут тоже.
  if (!canUseSetupWizard(!!profile?.is_admin)) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const mode = parseLaunchMode(body?.mode)
  if (!mode) return NextResponse.json({ error: 'invalid mode' }, { status: 400 })

  // Владелец: service-role клиент обходит RLS, поэтому user_id в фильтре.
  const { data: agent } = await supabase
    .from('ai_agents')
    .select('id, business_description, kaspi_shop_connection_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Kaspi Bot -- как в мастере: закреплённый за агентом магазин этого
  // аккаунта или активный магазин аккаунта (тогда каталог реально попадает
  // в ответы, catalogContext.ts).
  const { data: shops } = await supabase.from('kaspi_shop_connections').select('id, is_active').eq('user_id', user.id)
  const hasKaspiShop = (shops || []).some(s => s.is_active || s.id === agent.kaspi_shop_connection_id)
  if (!launchKnowledgeOk(agent.business_description, hasKaspiShop)) {
    return NextResponse.json({ error: 'needs_business' }, { status: 400 })
  }

  const { data: connections, error: connError } = await supabase
    .from('ai_agent_channel_connections')
    .select('channel, status')
    .eq('agent_id', agent.id)
  if (connError) return NextResponse.json({ error: connError.message }, { status: 500 })
  if (!canLaunch(connections || [])) return NextResponse.json({ error: 'no_channel' }, { status: 400 })

  const base = { is_enabled: true, status: mode }
  let result = await supabase
    .from('ai_agents')
    .update({ ...base, launched_at: new Date().toISOString() })
    .eq('id', agent.id)
    .eq('user_id', user.id)
    .select('id, is_enabled, status')
    .maybeSingle()
  if (result.error && isMissingColumnError(result.error, 'launched_at')) {
    result = await supabase
      .from('ai_agents')
      .update(base)
      .eq('id', agent.id)
      .eq('user_id', user.id)
      .select('id, is_enabled, status')
      .maybeSingle()
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ agent: { id: result.data.id, isEnabled: !!result.data.is_enabled, status: result.data.status } })
}
