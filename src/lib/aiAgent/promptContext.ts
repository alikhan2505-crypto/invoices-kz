export type AgentTone = 'friendly' | 'professional' | 'energetic' | 'caring'
export type AgentGoal = 'answer_questions' | 'qualify_lead' | 'book_appointment'

// The 12 preset collect-field keys the settings UI offers (2026-08-20,
// expanded from the original name/phone pair to match the founder-approved
// competitor reference). Any string NOT in this map is treated as a
// user-typed custom field and interpolated into the prompt verbatim.
export const COLLECT_FIELD_LABELS: Record<string, string> = {
  name: 'имя клиента',
  phone: 'номер телефона',
  booking: 'бронирование',
  consultation: 'запись на консультацию',
  address: 'адрес',
  purpose: 'цель обращения',
  budget: 'бюджет',
  timeline: 'желаемые сроки',
  people_count: 'количество человек',
  city: 'город',
  preferences: 'предпочтения',
  past_experience: 'прошлый опыт клиента',
}

export const CURRENCY_LABELS: Record<string, string> = {
  KZT: 'тенге (₸)',
  USD: 'доллары США ($)',
  EUR: 'евро (€)',
  RUB: 'рубли (₽)',
}

export interface BusinessContext {
  name: string
  tone: AgentTone
  description: string
  goal: AgentGoal
  collectFields?: string[]
  timezone?: string
  currency?: string
  // Which channel the agent is replying on. Optional with 'instagram' as
  // the effective default so the LIVE Instagram tenant path (which does not
  // pass it) keeps producing a byte-for-byte identical prompt line.
  channel?: 'instagram' | 'telegram' | 'whatsapp' | 'website'
  // Free-text owner instructions (ai_agents.custom_instructions), appended
  // verbatim at the end of the line. Optional: absent/empty adds nothing.
  customInstructions?: string
}

const TONE_LABELS: Record<AgentTone, string> = {
  friendly: 'дружелюбный и тёплый',
  professional: 'профессиональный и деловой',
  energetic: 'мотивирующий и энергичный',
  caring: 'заботливый и внимательный',
}

const GOAL_LABELS: Record<AgentGoal, string> = {
  answer_questions: 'отвечать на вопросы клиентов',
  qualify_lead: 'квалифицировать заявку клиента -- понять, что ему нужно, и собрать контактные данные',
  book_appointment: 'записать клиента на консультацию или приём -- предложить удобное время и собрать контакты для подтверждения записи',
}

// Builds the business-context line generateAiReply interpolates into its
// prompt (see instagramAiReply.ts's businessContextLine param). Only the
// multi-tenant webhook path calls this -- the existing single-tenant
// invoices.kz bot passes its own unchanged literal string straight to
// generateAiReply instead, so this function changing never affects it.
export function buildBusinessContextLine(ctx: BusinessContext): string {
  const desc = ctx.description.trim()
  const channelLabel = ctx.channel === 'telegram' ? 'Telegram' : ctx.channel === 'whatsapp' ? 'WhatsApp' : ctx.channel === 'website' ? 'чате на сайте' : 'Instagram'
  let line = `Ты отвечаешь от имени бизнес-аккаунта в ${channelLabel} (${ctx.name}${desc ? ' — ' + desc : ''}). Твой стиль общения: ${TONE_LABELS[ctx.tone]}. Твоя основная задача: ${GOAL_LABELS[ctx.goal]}.`

  const fields = (ctx.collectFields || []).map(f => COLLECT_FIELD_LABELS[f] || f).filter(Boolean)
  if (fields.length > 0) {
    line += ` В ходе диалога постарайся естественно узнать у клиента: ${fields.join(', ')}. Не спрашивай всё сразу -- по одному, в подходящий момент разговора.`
  }
  if (ctx.currency && CURRENCY_LABELS[ctx.currency]) {
    line += ` Все цены называй в валюте: ${CURRENCY_LABELS[ctx.currency]}.`
  }
  if (ctx.timezone) {
    line += ` Часовой пояс бизнеса: ${ctx.timezone}.`
  }
  const custom = ctx.customInstructions?.trim()
  if (custom) {
    line += ` Дополнительные инструкции от владельца бизнеса (следуй им): ${custom}`
  }
  return line
}

// «Каталог и цены» -- appended by tenant callers to businessContextLine
// when the agent owner has an ACTIVE Kaspi Shop connection, so answers
// about prices (and invoice-draft items) use real catalog numbers
// instead of free-text guesses. Pure: the Supabase load lives in
// catalogContext.ts.
export const CATALOG_MAX_PRODUCTS = 50

export function buildCatalogBlock(products: { name: string; price: number }[]): string {
  if (products.length === 0) return ''
  const lines = products.slice(0, CATALOG_MAX_PRODUCTS)
    .map(p => `${p.name} — ${p.price.toLocaleString('ru-KZ')} ₸`)
    .join('\n')
  return ` Актуальный каталог товаров и цен этого бизнеса (используй ТОЛЬКО эти цены, не выдумывай другие; если товара нет в каталоге — скажи, что уточнишь):\n${lines}`
}

// Maps an agent's raw collect_fields array (the same array
// buildBusinessContextLine above flattens into prose) into the
// {key,label}[] shape generateAiReply's collectFieldsToExtract param needs
// to both ask the model for a structured extraction AND parse it back out
// (instagramAiReply.ts's businessContextLine alone is just prose, with no
// structured keys left in it to recover). Same preset-vs-custom rule as
// buildBusinessContextLine: a preset key keeps its own key with the Russian
// label; a custom (non-preset) field has no separate system key, so its own
// text doubles as both key and label. Shared across all three tenant
// pipelines (webhookHandler.ts and its Telegram/WhatsApp twins) since the
// mapping itself is channel-agnostic -- only the pipeline skeletons around
// it are deliberately kept parallel, not this pure helper.
export function buildCollectFieldsToExtract(collectFields?: string[] | null): { key: string; label: string }[] {
  return (collectFields || [])
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map(f => ({ key: f, label: COLLECT_FIELD_LABELS[f] || f }))
}
