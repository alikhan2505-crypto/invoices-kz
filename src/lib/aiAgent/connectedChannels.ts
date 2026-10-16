// Какие каналы показывать на карточке агента в списке /ai-agent (15.10.2026).
// Карточка раньше искала только Instagram (`connections.find(c => c.channel
// === 'instagram')`), и агент, работающий в WhatsApp, выглядел как «Канал не
// подключён». Здесь -- все пять каналов, в одном порядке с вкладкой «Каналы»
// по смыслу: сначала мессенджеры, потом сайт и API.

export type AgentChannel = 'whatsapp' | 'instagram' | 'telegram' | 'website' | 'api'

export const CHANNEL_ORDER: AgentChannel[] = ['whatsapp', 'instagram', 'telegram', 'website', 'api']

export type ConnectionRow = { channel: string; external_account_name: string | null; status: string }

export type ChannelSummary = {
  channel: AgentChannel
  // Что показать рядом с названием канала: @аккаунт для Instagram/Telegram,
  // номер для WhatsApp; null -- у сайта и API своего «имени» нет.
  account: string | null
  // 'reconnect' -- подключение есть, но токен истёк (Instagram/Telegram):
  // агент там молчит, пока владелец не переподключит.
  state: 'ok' | 'reconnect'
}

function accountLabel(channel: AgentChannel, name: string | null): string | null {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  if (channel === 'instagram' || channel === 'telegram') return `@${trimmed.replace(/^@+/, '')}`
  if (channel === 'whatsapp') return trimmed
  return null
}

export function summarizeConnections(rows: ConnectionRow[]): ChannelSummary[] {
  const out: ChannelSummary[] = []
  for (const channel of CHANNEL_ORDER) {
    // По одному подключению на канал у агента (уникальность по channel +
    // external_account_id, а интерфейс подключает максимум одно на канал).
    // Если строк вдруг несколько, рабочая важнее сломанной.
    const forChannel = rows.filter(r => r.channel === channel)
    const active = forChannel.find(r => r.status === 'active')
    const expired = forChannel.find(r => r.status === 'token_expired')
    const row = active || expired
    if (!row) continue
    out.push({
      channel,
      account: accountLabel(channel, row.external_account_name),
      state: active ? 'ok' : 'reconnect',
    })
  }
  return out
}
