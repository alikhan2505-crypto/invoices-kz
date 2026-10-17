import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { firstReviewDraftAt } from '@/lib/aiAgent/trainingExit'
import { agentRowShouldExitTraining } from '@/lib/aiAgent/trainingStatus'
import { backfillWhatsAppDisplayName } from '@/lib/aiAgent/whatsappDisplayName'
import { canUseSetupWizard, isDraftAgent, isMissingColumnError } from '@/lib/aiAgent/setupWizard'

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

// AI-агент is admin-only for now (founder decision, not yet a public plan
// perk) -- same requireAdmin shape as src/app/api/kaspi/admin-stats/route.ts
// and src/app/api/kaspi-shop/niches/{request,result}/route.ts, kept as a
// separate check after requireUser (rather than folded into one function)
// so a logged-out caller still gets 401 Unauthorized and only a logged-in
// non-admin gets the distinct 403 admin_only body.
async function hasAiAgentAccess(userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, bonus_expires_at, trial_expires_at').eq('id', userId).single()
  return !!profile?.is_admin || getActivePlan(profile).canAiAgent
}

const VALID_TONES = ['friendly', 'professional', 'energetic', 'caring']
const VALID_GOALS = ['answer_questions', 'qualify_lead', 'book_appointment']
// Preset keys mirror COLLECT_FIELD_LABELS in src/lib/aiAgent/promptContext.ts;
// anything else in the array is a user-typed custom field (free text, capped).
const VALID_TIMEZONES = ['Asia/Almaty', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Aqtau']
const VALID_CURRENCIES = ['KZT', 'USD', 'EUR', 'RUB']
const MAX_COLLECT_FIELDS = 15
const MAX_CUSTOM_FIELD_LEN = 60

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  // Multi-agent (2026-08-20): ?agentId= loads a specific agent (404 if not
  // owned). Without it: exactly one agent is unambiguous, so keep loading
  // it directly (preserves the exact pre-multi-agent behavior for a
  // single-agent user). Two or more agents used to silently fall back to
  // the most recently created one -- a real bug found in the 2026-09-02
  // usability audit: any link elsewhere that forgot ?agentId= would
  // silently open/edit the wrong agent with no on-screen sign anything was
  // wrong. Now it's a loud 400 instead, so a missed call site fails
  // immediately in testing rather than quietly misconfiguring an agent.
  //
  // ?new=1 (whole-branch review, 2026-09-02): the «Создать агента» flow
  // always wants a blank form regardless of how many agents the account
  // already owns -- there's no agent to load and thus no ambiguity to
  // detect, so this skips the lookups entirely rather than tripping the
  // 400 above for exactly the multi-agent accounts this feature targets.
  const agentId = req.nextUrl.searchParams.get('agentId')
  const isNew = req.nextUrl.searchParams.get('new') === '1'
  let agent: any = null
  if (!isNew) {
    if (agentId) {
      const { data } = await supabase.from('ai_agents').select('*').eq('id', agentId).eq('user_id', user.id).maybeSingle()
      if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      agent = data
    } else {
      const { data: ownedAgents, error: ownedAgentsError } = await supabase.from('ai_agents').select('id').eq('user_id', user.id)
      if (ownedAgentsError) return NextResponse.json({ error: ownedAgentsError.message }, { status: 500 })
      if (ownedAgents.length > 1) {
        return NextResponse.json({ error: 'ambiguous_agent' }, { status: 400 })
      }
      const { data } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      agent = data
    }
  }
  const { data: profile } = await supabase.from('profiles').select('company_name').eq('id', user.id).maybeSingle()

  // Every Kaspi Shop store on this account, so the settings page can offer a
  // choice instead of silently following whichever one is active in the Kaspi
  // Bot section. Deliberately NOT filtered by is_active -- that flag is the
  // default, not a restriction on what an agent may quote from.
  const { data: shops } = await supabase
    .from('kaspi_shop_connections')
    .select('id, company_name, merchant_id, is_active')
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
  const kaspiShops = (shops || []).map(s => ({
    id: s.id,
    name: s.company_name || `Магазин ${s.merchant_id || ''}`.trim(),
    isActive: !!s.is_active,
  }))

  if (isNew) {
    // Колонка kaspi_catalog_off уже есть? Видно по ключу в любой строке
    // select('*') -- явный список колонок до миграции падал бы.
    const { data: anyAgent } = await supabase.from('ai_agents').select('*').limit(1).maybeSingle()
    return NextResponse.json({ agent: null, suggestedName: profile?.company_name || '', connections: [], kaspiShops, kaspiCatalogSupported: !!anyAgent && 'kaspi_catalog_off' in anyAgent })
  }
  // Прогресс обучения -- только для показа. Статус здесь НЕ меняется (до
  // 16.10.2026 открытие настроек само выпускало агента из обучения, молча):
  // выход случается на входящем сообщении или в очереди проверки, и владелец
  // получает об этом уведомление (trainingExit.ts). Срок в днях идёт от
  // первого черновика; нет черновиков -- отсчёт не начался (null).
  const trainingFirstDraftAt = agent && agent.status === 'training'
    ? await firstReviewDraftAt(supabase, agent.id)
    : null
  const trainingExitPending = !!agent && agentRowShouldExitTraining(agent, new Date(), trainingFirstDraftAt)

  // external_account_id нужен чату для сайта: это ключ виджета в коде
  // вставки (без него после перезагрузки страницы код показывал
  // data-key="undefined"). Секретов в нём нет ни у одного канала -- токены
  // лежат в access_token_enc / api_token_hash и сюда не попадают.
  const { data: connectionRows } = agent
    ? await supabase.from('ai_agent_channel_connections').select('channel, external_account_id, external_account_name, status').eq('agent_id', agent.id)
    : { data: [] }
  let connections = connectionRows || []
  // Номер WhatsApp для чипа у подключений, сделанных до того, как callback
  // начал его сохранять -- лениво, один раз (см. whatsappDisplayName.ts).
  if (agent && connections.some(c => c.channel === 'whatsapp' && c.status === 'active' && !c.external_account_name)) {
    const display = await backfillWhatsAppDisplayName(supabase, agent.id)
    if (display) {
      connections = connections.map(c => (c.channel === 'whatsapp' && c.status === 'active' && !c.external_account_name ? { ...c, external_account_name: display } : c))
    }
  }

  return NextResponse.json({
    agent: agent ? {
      id: agent.id,
      name: agent.name,
      tone: agent.tone,
      businessDescription: agent.business_description,
      goal: agent.goal,
      collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : [],
      timezone: agent.timezone || 'Asia/Almaty',
      currency: agent.currency || 'KZT',
      customInstructions: agent.custom_instructions || '',
      stopPhrases: Array.isArray(agent.stop_phrases) ? agent.stop_phrases : [],
      historyPairs: typeof agent.history_pairs === 'number' ? agent.history_pairs : 5,
      // Статус бота (Контроль tab). Column default is true; a null from a
      // pre-column row still reads as enabled.
      isEnabled: agent.is_enabled !== false,
      status: agent.status,
      // Training progress, so the settings page can say how much is left
      // before the agent answers customers on its own instead of queueing.
      trainingMessageCount: agent.training_message_count ?? 0,
      trainingStartedAt: agent.training_started_at || null,
      // Начало отсчёта дней обучения (первый черновик на проверке) и флаг
      // «срок вышел -- агент начнёт отвечать сам со следующего сообщения».
      trainingFirstDraftAt,
      trainingExitPending,
      // null = follow the account's active store (the behaviour every agent
      // had before stores became selectable).
      // A pin to a store that is not on this account any more reads as null
      // (the FK is ON DELETE SET NULL, so this is only a belt-and-braces
      // guard) -- otherwise the page would keep re-sending a dead id and
      // every save would fail with «магазин не найден».
      kaspiShopConnectionId: agent.kaspi_shop_connection_id && kaspiShops.some(s => s.id === agent.kaspi_shop_connection_id)
        ? agent.kaspi_shop_connection_id
        : null,
      // «Не использовать магазин Kaspi» (kaspi_catalog_off): агент не называет
      // товары, цены, доставку и ссылки на магазин. До миграции колонки нет --
      // читается как false (agent загружен через select('*')).
      kaspiCatalogOff: agent.kaspi_catalog_off === true,
      metaPixelId: agent.meta_pixel_id || null,
      // Мастер /ai-agent/setup (16.10.2026): черновик -- launched_at есть и
      // пуст. До миграции колонки нет: isDraft всегда false, как раньше.
      isDraft: isDraftAgent(agent, connections),
      launchedAt: agent.launched_at ?? null,
    } : null,
    suggestedName: profile?.company_name || '',
    connections,
    kaspiShops,
    // true, когда миграция ai_agent_kaspi_catalog_off.sql применена (ключ
    // есть в строке агента) -- без неё страница не показывает опцию.
    kaspiCatalogSupported: !!agent && 'kaspi_catalog_off' in agent,
  })
}

// Multi-agent (2026-08-20): an explicit `agentId` in the body means UPDATE
// that agent (ownership-verified); no agentId means INSERT a new agent row.
// The old upsert-on-user_id is gone along with the UNIQUE(user_id)
// constraint. The payload still deliberately omits status/
// training_started_at/training_message_count -- re-saving settings (editing
// the business description, say) never resets an agent's training clock
// back to defaults. Those three columns are only ever set by their own
// defaults (first creation) or by the review-queue route (training
// progress).
export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasAiAgentAccess(user.id))) return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const body = await req.json()

  // Шаг 0 мастера «Создать» (16.10.2026): мгновенный агент-черновик.
  // Название = company_name или «Ассистент», всё остальное -- значения
  // колонок по умолчанию; is_enabled = false и launched_at = null, поэтому
  // он НЕ отвечает клиентам, пока владелец не нажмёт «Запустить»
  // (agents/[id]/launch). Мастер пока только для админов (решение 4).
  if (body?.draft === true && !body?.agentId) {
    const { data: owner } = await supabase.from('profiles').select('is_admin, company_name').eq('id', user.id).maybeSingle()
    if (!canUseSetupWizard(!!owner?.is_admin)) return NextResponse.json({ error: 'admin_only' }, { status: 403 })
    const draftName = (typeof owner?.company_name === 'string' && owner.company_name.trim()) || 'Ассистент'
    const { data, error } = await supabase
      .from('ai_agents')
      .insert({ user_id: user.id, name: draftName.slice(0, 120), is_enabled: false })
      .select('id, name, status, is_enabled')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ agent: data })
  }

  const { agentId, name, tone, businessDescription, goal, collectFields, timezone, currency, customInstructions, historyPairs, isEnabled, stopPhrases, kaspiShopConnectionId, kaspiCatalogOff } = body

  if (agentId !== undefined && typeof agentId !== 'string') return NextResponse.json({ error: 'invalid agentId' }, { status: 400 })
  if (historyPairs !== undefined && (typeof historyPairs !== 'number' || historyPairs < 1 || historyPairs > 20)) {
    return NextResponse.json({ error: 'invalid historyPairs' }, { status: 400 })
  }
  if (isEnabled !== undefined && typeof isEnabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid isEnabled' }, { status: 400 })
  }
  if (kaspiCatalogOff !== undefined && typeof kaspiCatalogOff !== 'boolean') {
    return NextResponse.json({ error: 'invalid kaspiCatalogOff' }, { status: 400 })
  }
  if (kaspiShopConnectionId !== undefined && kaspiShopConnectionId !== null && typeof kaspiShopConnectionId !== 'string') {
    return NextResponse.json({ error: 'invalid kaspiShopConnectionId' }, { status: 400 })
  }

  // A store id arrives from the browser, so it is a caller-supplied reference
  // to another table's row -- verify it belongs to THIS user before storing it,
  // or an agent could be pointed at a competitor's catalog by editing the
  // request. loadAgentCatalog re-checks ownership on every read too; this check
  // is here so the bad value never reaches the column in the first place.
  if (typeof kaspiShopConnectionId === 'string' && kaspiShopConnectionId) {
    const { data: shop } = await supabase
      .from('kaspi_shop_connections')
      .select('id')
      .eq('id', kaspiShopConnectionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!shop) return NextResponse.json({ error: 'kaspi shop not found' }, { status: 400 })
  }

  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!VALID_TONES.includes(tone)) return NextResponse.json({ error: 'invalid tone' }, { status: 400 })
  if (!VALID_GOALS.includes(goal)) return NextResponse.json({ error: 'invalid goal' }, { status: 400 })
  if (timezone !== undefined && !VALID_TIMEZONES.includes(timezone)) return NextResponse.json({ error: 'invalid timezone' }, { status: 400 })
  if (currency !== undefined && !VALID_CURRENCIES.includes(currency)) return NextResponse.json({ error: 'invalid currency' }, { status: 400 })

  // collectFields: preset keys pass through as-is, anything else is a
  // user-typed custom field -- kept as trimmed free text with a length cap
  // (it gets interpolated into the agent's prompt, promptContext.ts).
  const fields: string[] = Array.isArray(collectFields)
    ? collectFields
        .filter((f: unknown): f is string => typeof f === 'string')
        .map(f => f.trim().slice(0, MAX_CUSTOM_FIELD_LEN))
        .filter(f => f.length > 0)
        .slice(0, MAX_COLLECT_FIELDS)
    : []

  // stopPhrases: free-text list, same trim+cap shape as collectFields'
  // custom-field path -- these are interpolated into no prompt (matched
  // literally in code, not sent to the model), so the cap is generous.
  const phrases: string[] = Array.isArray(stopPhrases)
    ? stopPhrases
        .filter((p: unknown): p is string => typeof p === 'string')
        .map(p => p.trim().slice(0, 80))
        .filter(p => p.length > 0)
        .slice(0, 20)
    : ['оператор', 'человек', 'менеджер', 'позовите', 'поговорить с человеком']

  const payload = {
    name,
    tone,
    business_description: typeof businessDescription === 'string' ? businessDescription : '',
    goal,
    collect_fields: fields,
    // Legacy booleans stay in sync for rollback safety (never-drop
    // convention) -- nothing reads them anymore after 2026-08-20.
    collect_name: fields.includes('name'),
    collect_phone: fields.includes('phone'),
    timezone: timezone || 'Asia/Almaty',
    currency: currency || 'KZT',
    // Free-text prompt addendum -- capped hard since it's interpolated into
    // every LLM call (longer text = higher per-reply token cost).
    custom_instructions: typeof customInstructions === 'string' ? customInstructions.slice(0, 2000) : '',
    stop_phrases: phrases,
    history_pairs: typeof historyPairs === 'number' ? Math.round(historyPairs) : 5,
    // Статус бота: only touch the column when the client sent an explicit
    // boolean -- an older client omitting the field must never accidentally
    // re-enable an agent the owner paused.
    ...(typeof isEnabled === 'boolean' ? { is_enabled: isEnabled } : {}),
    // Which Kaspi Shop store this agent quotes from. Only written when the
    // client sent the field, same rule as isEnabled above -- an older client
    // omitting it must not silently unpin an agent back to the active store.
    // An explicit null IS a choice ("follow the active store") and is stored.
    // Отказ от магазина снимает и закрепление: «не использовать» и «закреплён
    // за магазином X» не должны жить в строке одновременно.
    ...(kaspiShopConnectionId !== undefined || kaspiCatalogOff === true
      ? { kaspi_shop_connection_id: kaspiCatalogOff === true ? null : (kaspiShopConnectionId || null) }
      : {}),
    // «Не использовать магазин Kaspi». Пишется только если клиент прислал
    // флаг (страница шлёт его лишь когда колонка есть); без миграции запись
    // откатывается ниже, а не ломает сохранение всей формы.
    ...(typeof kaspiCatalogOff === 'boolean' ? { kaspi_catalog_off: kaspiCatalogOff } : {}),
  }

  // Одна попытка записи: обновление или вставка (с прежним откатом launched_at).
  async function writeAgent(p: Record<string, unknown>) {
    if (agentId) {
      return supabase.from('ai_agents').update(p).eq('id', agentId).eq('user_id', user!.id).select().maybeSingle()
    }
    // Прежний путь создания (форма настроек): агент отвечает, как только
    // подключён канал, -- значит, он сразу «запущен». launched_at ставится,
    // чтобы такой агент никогда не выглядел черновиком мастера. До миграции
    // колонки нет -- вставка без неё, как раньше.
    let inserted = await supabase
      .from('ai_agents')
      .insert({ user_id: user!.id, ...p, launched_at: new Date().toISOString() })
      .select()
      .single()
    if (inserted.error && isMissingColumnError(inserted.error, 'launched_at')) {
      inserted = await supabase
        .from('ai_agents')
        .insert({ user_id: user!.id, ...p })
        .select()
        .single()
    }
    return inserted
  }

  let result: { data: any; error: { code?: string | null; message?: string | null } | null } = await writeAgent(payload)
  if (result.error && 'kaspi_catalog_off' in payload && isMissingColumnError(result.error, 'kaspi_catalog_off')) {
    // Миграция ai_agent_kaspi_catalog_off.sql ещё не применена. «Не использовать
    // магазин» без колонки сохранить нечем -- честная ошибка, ничего не
    // записано. Значение false ничего не меняет: сохраняем остальное без колонки.
    if (kaspiCatalogOff === true) {
      return NextResponse.json({ error: 'kaspi_catalog_migration' }, { status: 409 })
    }
    const { kaspi_catalog_off: _omit, ...withoutColumn } = payload
    result = await writeAgent(withoutColumn)
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  if (!result.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const agent = result.data

  // No wallet row to seed since the 2026-08-18 unified-wallet merge: spend
  // now debits the shared profiles.kaspi_wallet_balance, which always exists
  // (every user has a profiles row) and reads as 0 via COALESCE when untouched.

  return NextResponse.json({ agent })
}
