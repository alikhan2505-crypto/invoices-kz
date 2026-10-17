import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBusinessContextLine, buildCatalogBlock, buildDeliveryBlock, buildShopLinksBlock, type AgentTone, type AgentGoal, type BusinessContext } from './promptContext'
import { loadAgentCatalog, loadAgentDeliveryInfo, loadAgentShopLinks, storePinFor, NO_STORE } from './catalogContext'
import { loadAgentSalonInfo, buildSalonBlock, type SalonInfo } from './salonContext'

// Единый сборщик контекста промпта для ИИ-ответа агента: строка о бизнесе +
// каталог Kaspi Shop + доставка + ссылки на магазин + блок салона. Им
// пользуются все пять живых каналов (Instagram, Telegram, WhatsApp, сайт,
// API) и тестовый чат -- раньше каждый канал собирал это сам, а тестовый чат
// только строку о бизнесе, без каталога и доставки (аудит 15.10.2026): владелец
// проверял ответы, которых клиент никогда не получит.

export type PromptChannel = NonNullable<BusinessContext['channel']>

// Колонки ai_agents, которые нужны промпту (строка select('*') подходит).
export interface ReplyContextAgent {
  user_id: string
  name: string
  tone: string
  business_description: string | null
  goal: string
  collect_fields?: unknown
  timezone?: string | null
  currency?: string | null
  custom_instructions?: unknown
  kaspi_shop_connection_id?: string | null
  // Опция «не использовать магазин Kaspi». Колонки может ещё не быть (миграция
  // не применена) -- тогда undefined, то есть «не отключено».
  kaspi_catalog_off?: boolean | null
  salon_site_id?: string | null
}

export interface ReplyContextData {
  catalog: { name: string; price: number }[]
  deliveryInfo: string | null
  shopLinks: { kaspiShopUrl: string | null; storefrontUrl: string | null }
  salonInfo: SalonInfo | null
}

// Чистая часть: из уже загруженных данных -- строка businessContextLine.
// channel не передан = Instagram (как всегда было у Instagram-канала).
export function composeReplyContextLine(agent: ReplyContextAgent, channel: PromptChannel | undefined, data: ReplyContextData): string {
  // Агент с отключённым магазином Kaspi не называет ни товары, ни цены, ни
  // условия доставки -- в том числе общий ориентир по курьерам (иначе он
  // всё равно озвучил бы «1000-15000 ₸»).
  const deliveryBlock = storePinFor(agent) === NO_STORE ? '' : buildDeliveryBlock(data.deliveryInfo)
  return buildBusinessContextLine({
    name: agent.name,
    tone: agent.tone as AgentTone,
    description: agent.business_description || '',
    goal: agent.goal as AgentGoal,
    collectFields: Array.isArray(agent.collect_fields) ? agent.collect_fields : undefined,
    timezone: agent.timezone || undefined,
    currency: agent.currency || undefined,
    customInstructions: typeof agent.custom_instructions === 'string' ? agent.custom_instructions : undefined,
    ...(channel ? { channel } : {}),
  }) + buildCatalogBlock(data.catalog) + deliveryBlock + buildShopLinksBlock(data.shopLinks) + (data.salonInfo ? buildSalonBlock(data.salonInfo) : '')
}

// withSalon: блок салона и инструмент записи -- только в личной переписке
// (в публичном комментарии Instagram запись не ведём), и только у агента,
// привязанного к салону. Загрузчики сами никогда не бросают исключений.
export async function buildAgentReplyContext(
  supabase: SupabaseClient,
  agent: ReplyContextAgent,
  opts: { channel?: PromptChannel; withSalon: boolean },
): Promise<ReplyContextData & { businessContextLine: string }> {
  const pin = storePinFor(agent)
  const [catalog, deliveryInfo, shopLinks] = await Promise.all([
    loadAgentCatalog(supabase, agent.user_id, pin),
    loadAgentDeliveryInfo(supabase, agent.user_id, pin),
    loadAgentShopLinks(supabase, agent.user_id, pin),
  ])
  const salonInfo = opts.withSalon && agent.salon_site_id ? await loadAgentSalonInfo(supabase, agent.salon_site_id) : null
  const data: ReplyContextData = { catalog, deliveryInfo, shopLinks, salonInfo }
  return { ...data, businessContextLine: composeReplyContextLine(agent, opts.channel, data) }
}

// Тестовый чат не привязан к каналу, а строка о бизнесе называет канал
// («Ты отвечаешь … в WhatsApp»). Берём подключённый канал агента, чтобы
// промпт совпадал с тем, что увидит реальный клиент; WhatsApp первым (на нём
// сейчас упор), без подключений -- undefined, то есть Instagram, как тестовый
// чат делал всегда.
const PREVIEW_CHANNEL_ORDER: PromptChannel[] = ['whatsapp', 'instagram', 'telegram', 'website', 'api']

export function pickPreviewChannel(activeChannels: string[]): PromptChannel | undefined {
  return PREVIEW_CHANNEL_ORDER.find(c => activeChannels.includes(c))
}
