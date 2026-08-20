// Telegram Bot API helpers for the multi-tenant AI-агент channel --
// fills the same role src/lib/instagram.ts fills for the Instagram channel.
// Pure logic (update parsing, dedup key, history pairing) lives here with
// colocated tests (telegram.test.ts); the fetch wrappers are live network
// calls and stay untested per codebase convention (see the note atop
// instagramAiReply.ts).

// Mirrors InstagramApiError in src/lib/instagram.ts -- a 401 on a send
// means the bot token is dead (revoked via BotFather), which the callers
// translate into the connection's token_expired status.
export class TelegramApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'TelegramApiError'
    this.status = status
  }
}

// Telegram guarantees update_id is unique PER BOT, not globally -- two
// different customers' bots can each see update_id 100000001, so the dedup
// key stored in ai_agent_messages.external_id (globally unique index) is
// scoped by the bot id.
export function telegramDedupKey(botId: string, updateId: number): string {
  return `tg:${botId}:${updateId}`
}

export type ParsedTelegramUpdate =
  | { kind: 'ignore' }
  | { kind: 'start'; chatId: string }
  | { kind: 'text'; chatId: string; text: string; fromHandle: string; updateId: number }

// Classifies a raw Telegram Update. Only fresh `message` updates count --
// edited_message, channel_post, callback_query etc. arrive under different
// keys and fall through to 'ignore', as do non-text messages (photos,
// stickers, voice), messages from other bots, and slash-commands. /start is
// the one command that gets a response (a short static greeting, sent by
// the webhook route without touching the AI pipeline).
export function parseTelegramUpdate(update: unknown): ParsedTelegramUpdate {
  const u = update as { update_id?: unknown; message?: { text?: unknown; from?: { is_bot?: boolean; username?: string; first_name?: string }; chat?: { id?: unknown } } } | null
  const msg = u?.message
  if (!msg || typeof msg.text !== 'string' || !msg.text.trim()) return { kind: 'ignore' }
  if (msg.from?.is_bot) return { kind: 'ignore' }
  const chatIdRaw = msg.chat?.id
  if (typeof chatIdRaw !== 'number' && typeof chatIdRaw !== 'string') return { kind: 'ignore' }
  const chatId = String(chatIdRaw)
  const text = msg.text.trim()
  // "/start", "/start ref123" (deep-link payload), "/start@MyBot" all greet.
  if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@')) {
    return { kind: 'start', chatId }
  }
  if (text.startsWith('/')) return { kind: 'ignore' }
  if (typeof u?.update_id !== 'number') return { kind: 'ignore' }
  return {
    kind: 'text',
    chatId,
    text,
    fromHandle: msg.from?.username || msg.from?.first_name || 'unknown',
    updateId: u.update_id,
  }
}

// Pairs raw ai_agent_messages rows (ascending by created_at) into
// incoming/reply exchanges for generateAiReply's conversationHistory --
// the exact pairing rule the Instagram tenant path applies inline in
// webhookHandler.ts: an inbound row pairs with the next *sent* outbound
// row; a still-pending or skipped draft was never seen by the customer,
// so it doesn't count as "already said".
export function pairConversationHistory(
  rows: { direction: string; text: string; status: string }[],
  maxPairs: number
): { incoming: string; reply: string }[] {
  const pairs: { incoming: string; reply: string }[] = []
  let pendingIncoming: string | null = null
  for (const row of rows) {
    if (row.direction === 'inbound') {
      pendingIncoming = row.text
    } else if (row.direction === 'outbound' && row.status === 'sent' && pendingIncoming) {
      pairs.push({ incoming: pendingIncoming, reply: row.text })
      pendingIncoming = null
    }
  }
  return pairs.slice(-maxPairs)
}

// The token only ever appears inside the request URL -- error messages
// carry Telegram's `description` field and the method name, never the URL,
// so a thrown TelegramApiError is safe to console.error.
async function callTelegram(botToken: string, method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data: { ok?: boolean; result?: unknown; description?: string } | null = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new TelegramApiError(res.status, data?.description || `Telegram ${method} failed (HTTP ${res.status})`)
  }
  return data.result
}

// Validates a pasted BotFather token and identifies the bot behind it.
export async function getTelegramMe(botToken: string): Promise<{ id: string; username: string }> {
  const me = await callTelegram(botToken, 'getMe', {}) as { id: number; username?: string }
  return { id: String(me.id), username: me.username || String(me.id) }
}

// secret_token comes back on every delivery as the
// X-Telegram-Bot-Api-Secret-Token header; the same value also rides in the
// URL's ?secret= for the connection lookup. allowed_updates keeps Telegram
// from delivering update types the webhook ignores anyway.
export async function setTelegramWebhook(botToken: string, url: string, secret: string): Promise<void> {
  await callTelegram(botToken, 'setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  })
}

export async function deleteTelegramWebhook(botToken: string): Promise<void> {
  await callTelegram(botToken, 'deleteWebhook', { drop_pending_updates: true })
}

// Plain text, no parse_mode -- AI-generated replies routinely contain
// characters ('_', '*', '<') that would break Markdown/HTML entity parsing
// and get the whole sendMessage rejected.
export async function sendTelegramBotMessage(botToken: string, chatId: string, text: string): Promise<void> {
  await callTelegram(botToken, 'sendMessage', { chat_id: chatId, text })
}
