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
  | { kind: 'photo'; chatId: string; fromHandle: string; updateId: number; fileId: string; caption: string }
  | { kind: 'voice'; chatId: string; fromHandle: string; updateId: number; fileId: string }
  // A real message (has chat + non-bot from) that isn't text/photo/voice/
  // start -- video, document, sticker, location, contact, poll, or a
  // malformed photo/voice missing a usable file_id/update_id.
  | { kind: 'unsupported'; chatId: string }

// Classifies a raw Telegram Update. Only fresh `message` updates count --
// edited_message, channel_post, callback_query etc. arrive under different
// keys and fall through to 'ignore', as do messages from other bots and
// slash-commands other than /start. Text, photo, and voice messages get
// their own kind; anything else with a real chat gets 'unsupported' (the
// webhook route replies with a polite static message instead of silence).
export function parseTelegramUpdate(update: unknown): ParsedTelegramUpdate {
  const u = update as {
    update_id?: unknown
    message?: {
      text?: unknown
      caption?: unknown
      from?: { is_bot?: boolean; username?: string; first_name?: string }
      chat?: { id?: unknown }
      photo?: { file_id?: unknown }[]
      voice?: { file_id?: unknown }
    } | null
  } | null
  const msg = u?.message
  if (!msg) return { kind: 'ignore' }
  if (msg.from?.is_bot) return { kind: 'ignore' }
  const chatIdRaw = msg.chat?.id
  if (typeof chatIdRaw !== 'number' && typeof chatIdRaw !== 'string') return { kind: 'ignore' }
  const chatId = String(chatIdRaw)
  const fromHandle = msg.from?.username || msg.from?.first_name || 'unknown'
  const updateId = typeof u?.update_id === 'number' ? u.update_id : undefined

  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    // Telegram sends multiple resolutions of the same photo -- the last
    // entry is the largest.
    const largest = msg.photo[msg.photo.length - 1]
    const fileId = typeof largest?.file_id === 'string' ? largest.file_id : undefined
    if (!fileId || updateId === undefined) return { kind: 'unsupported', chatId }
    const caption = typeof msg.caption === 'string' ? msg.caption.trim() : ''
    return { kind: 'photo', chatId, fromHandle, updateId, fileId, caption }
  }
  if (msg.voice && typeof msg.voice.file_id === 'string') {
    if (updateId === undefined) return { kind: 'unsupported', chatId }
    return { kind: 'voice', chatId, fromHandle, updateId, fileId: msg.voice.file_id }
  }

  if (typeof msg.text !== 'string' || !msg.text.trim()) {
    // No text, no photo, no voice -- video/document/sticker/location/etc.
    return { kind: 'unsupported', chatId }
  }
  const text = msg.text.trim()
  // "/start", "/start ref123" (deep-link payload), "/start@MyBot" all greet.
  if (text === '/start' || text.startsWith('/start ') || text.startsWith('/start@')) {
    return { kind: 'start', chatId }
  }
  if (text.startsWith('/')) return { kind: 'ignore' }
  if (updateId === undefined) return { kind: 'ignore' }
  return { kind: 'text', chatId, text, fromHandle, updateId }
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

// Downloads a Telegram file (photo or voice note) for the AI-агент
// photo/voice pipeline. Telegram's getFile doesn't return a mime type --
// callers already know it from which ParsedTelegramUpdate kind they're
// handling (photo is always re-encoded JPEG by Telegram; voice is always
// ogg/opus), so this returns bytes only.
export async function downloadTelegramMedia(fileId: string, botToken: string): Promise<Buffer> {
  const file = await callTelegram(botToken, 'getFile', { file_id: fileId }) as { file_path?: string }
  if (!file?.file_path) {
    throw new TelegramApiError(502, 'getFile returned no file_path')
  }
  const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`)
  if (!res.ok) {
    throw new TelegramApiError(res.status, 'file download failed')
  }
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
