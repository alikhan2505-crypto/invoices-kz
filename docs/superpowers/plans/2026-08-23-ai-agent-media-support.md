# AI-агент — поддержка фото и голосовых сообщений — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo and voice messages from customers in the AI-агент's WhatsApp/Telegram/Instagram channels stop being silently dropped — voice is transcribed (OpenAI Whisper) and flows through the existing text pipeline; photos are sent to Claude's vision as an image content block; anything else unsupported gets one polite static reply instead of silence.

**Architecture:** A new shared pure module (`mediaLimits.ts`) holds size/mime-type checks and the shared fallback-reply text. A new `openaiWhisper.ts` wraps the Whisper API. Each platform gets its own media-download function (`downloadWhatsAppMedia`, `downloadTelegramMedia`; Instagram needs none — its attachments carry a ready CDN URL). `generateAiReply` gains an optional `image` param. All three tenant handlers gain an optional `media` param that skips template matching and forwards to `generateAiReply`. Classification and download/transcription happen at the webhook-route layer, not inside the handlers.

**Tech Stack:** Next.js API routes (Node runtime), Supabase, Anthropic SDK (`@anthropic-ai/sdk`), OpenAI Whisper via raw `fetch`, Vitest for colocated tests.

**Spec:** `docs/superpowers/specs/2026-08-23-ai-agent-media-support-design.md`

## Global Constraints

- Scope: only the multi-tenant AI-агент paths (`src/lib/aiAgent/*` and its three webhook routes). The legacy single-tenant Instagram bot (`isLegacyAccount` branch in `src/app/api/instagram/webhook/route.ts`, `handleIncoming`) is explicitly **not** touched.
- Billing: photo/voice AI replies cost the same 1 credit (5₸) as a text AI reply — no new billing logic, no new wallet code.
- No database schema changes — `ai_agent_messages.text` already accepts arbitrary text; no new columns needed.
- New env var `OPENAI_API_KEY` — add to `.env.local` for local testing. Adding it to Vercel Production + redeploy is an external, user-owed step **after** this plan ships, not a task in this plan.
- Testing convention (matches this codebase's existing practice, e.g. `instagramAiReply.ts`'s top-of-file comment): live network-calling functions (Whisper call, media downloads, webhook routes) stay **untested**; pure logic (limit/mime checks, `parseTelegramUpdate`'s classification) gets a colocated Vitest test. Tasks below follow this split — some have a TDD test-first step, others verify via `npx tsc --noEmit` only.
- Claude's Messages API accepts exactly these four image media types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- Every new/modified file must pass `npx tsc --noEmit` before its task is considered done.

---

### Task 1: Shared media-validation module

**Files:**
- Create: `src/lib/aiAgent/mediaLimits.ts`
- Test: `src/lib/aiAgent/mediaLimits.test.ts`

**Interfaces:**
- Produces: `SUPPORTED_IMAGE_MIME_TYPES: string[]`, `MAX_IMAGE_BYTES: number`, `MAX_AUDIO_BYTES: number`, `UNSUPPORTED_MEDIA_REPLY_TEXT: string`, `isImageWithinLimits(byteLength: number, mimeType: string): boolean`, `isAudioWithinLimits(byteLength: number): boolean`, `sniffImageMimeType(buffer: Buffer): string | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/aiAgent/mediaLimits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isImageWithinLimits, isAudioWithinLimits, sniffImageMimeType, MAX_IMAGE_BYTES, MAX_AUDIO_BYTES } from './mediaLimits'

describe('isImageWithinLimits', () => {
  it('accepts a supported mime type under the size cap', () => {
    expect(isImageWithinLimits(1024, 'image/jpeg')).toBe(true)
    expect(isImageWithinLimits(1024, 'image/png')).toBe(true)
  })

  it('accepts a mime type with charset/codec suffix by matching only the base type', () => {
    expect(isImageWithinLimits(1024, 'image/jpeg; charset=binary')).toBe(true)
  })

  it('rejects zero-length or oversized buffers', () => {
    expect(isImageWithinLimits(0, 'image/jpeg')).toBe(false)
    expect(isImageWithinLimits(MAX_IMAGE_BYTES + 1, 'image/jpeg')).toBe(false)
    expect(isImageWithinLimits(MAX_IMAGE_BYTES, 'image/jpeg')).toBe(true)
  })

  it('rejects an unsupported mime type', () => {
    expect(isImageWithinLimits(1024, 'image/bmp')).toBe(false)
    expect(isImageWithinLimits(1024, 'video/mp4')).toBe(false)
  })
})

describe('isAudioWithinLimits', () => {
  it('accepts a non-empty buffer at or under the cap', () => {
    expect(isAudioWithinLimits(1024)).toBe(true)
    expect(isAudioWithinLimits(MAX_AUDIO_BYTES)).toBe(true)
  })

  it('rejects zero-length or oversized buffers', () => {
    expect(isAudioWithinLimits(0)).toBe(false)
    expect(isAudioWithinLimits(MAX_AUDIO_BYTES + 1)).toBe(false)
  })
})

describe('sniffImageMimeType', () => {
  it('detects JPEG from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg')
  })

  it('detects PNG from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
  })

  it('detects GIF from its magic bytes', () => {
    expect(sniffImageMimeType(Buffer.from('GIF89a'))).toBe('image/gif')
  })

  it('detects WEBP from its RIFF/WEBP header', () => {
    const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')])
    expect(sniffImageMimeType(buf)).toBe('image/webp')
  })

  it('returns null for unrecognized or too-short buffers', () => {
    expect(sniffImageMimeType(Buffer.from([0x00, 0x01]))).toBeNull()
    expect(sniffImageMimeType(Buffer.from('not an image, just text'))).toBeNull()
    expect(sniffImageMimeType(Buffer.alloc(0))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/mediaLimits.test.ts`
Expected: FAIL — `Cannot find module './mediaLimits'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/aiAgent/mediaLimits.ts`:

```ts
// Shared, pure (no network/DB) constants and checks for the AI-агент
// photo/voice pipeline (docs/superpowers/specs/2026-08-23-ai-agent-media-support-design.md).
// Kept separate from the download/transcription code (which makes live
// network calls and stays untested per this codebase's convention -- see
// the top-of-file comment in instagramAiReply.ts) so the actual pass/fail
// logic here gets a colocated test.

// Claude's Messages API only accepts these four image media types.
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Anthropic's own limit for an inline base64 image.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024
// OpenAI Whisper's own per-file limit.
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024

// One shared, polite reply for anything the pipeline doesn't handle (video,
// documents, stickers, location, an oversized/corrupt file, or a download/
// transcription failure) -- sent directly by the webhook route, free (no AI
// call, no wallet debit), same cost model as a template match.
export const UNSUPPORTED_MEDIA_REPLY_TEXT = 'Пока не умею обрабатывать такой тип сообщения — опишите, пожалуйста, текстом 🙂'

export function isImageWithinLimits(byteLength: number, mimeType: string): boolean {
  const baseType = mimeType.split(';')[0].trim().toLowerCase()
  return byteLength > 0 && byteLength <= MAX_IMAGE_BYTES && SUPPORTED_IMAGE_MIME_TYPES.includes(baseType)
}

export function isAudioWithinLimits(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= MAX_AUDIO_BYTES
}

// Detects an image's real MIME type from its own bytes (magic numbers).
// Needed for Instagram DM attachments specifically -- their payload gives a
// CDN url but no declared mime type, unlike WhatsApp/Telegram which hand
// one back directly from their own media-lookup APIs.
export function sniffImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.length >= 6 && buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/mediaLimits.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiAgent/mediaLimits.ts src/lib/aiAgent/mediaLimits.test.ts
git commit -m "feat(ai-agent): add shared media validation module for photo/voice support"
```

---

### Task 2: OpenAI Whisper transcription wrapper

**Files:**
- Create: `src/lib/openaiWhisper.ts`

**Interfaces:**
- Consumes: `MAX_AUDIO_BYTES` from `src/lib/aiAgent/mediaLimits.ts` (Task 1)
- Produces: `transcribeAudio(buffer: Buffer, mimeType: string): Promise<string>`, `WhisperTranscriptionError` class

- [ ] **Step 1: Write the implementation** (no test — live network call, matches `generateAiReply`'s own untested convention)

Create `src/lib/openaiWhisper.ts`:

```ts
import { MAX_AUDIO_BYTES } from '@/lib/aiAgent/mediaLimits'

// Voice-note transcription for the AI-агент media pipeline
// (docs/superpowers/specs/2026-08-23-ai-agent-media-support-design.md).
// No test file: this is a live network call to a paid API, matching this
// codebase's existing convention (see the top-of-file comment in
// instagramAiReply.ts).

export class WhisperTranscriptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WhisperTranscriptionError'
  }
}

// mimeType is whatever the source platform reported (e.g. "audio/ogg" from
// WhatsApp/Telegram voice notes, both of which Whisper accepts natively --
// no transcoding needed for either).
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new WhisperTranscriptionError('OPENAI_API_KEY not configured')
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new WhisperTranscriptionError('audio file empty or too large')
  }

  const baseType = mimeType.split(';')[0].trim() || 'audio/ogg'
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: baseType }), 'voice.ogg')
  form.append('model', 'whisper-1')
  form.append('response_format', 'text')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new WhisperTranscriptionError(`Whisper transcription failed (HTTP ${res.status}): ${errText.slice(0, 200)}`)
  }
  const text = (await res.text()).trim()
  if (!text) throw new WhisperTranscriptionError('Whisper returned an empty transcript')
  return text
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/openaiWhisper.ts
git commit -m "feat(ai-agent): add OpenAI Whisper transcription wrapper"
```

---

### Task 3: WhatsApp media download

**Files:**
- Modify: `src/lib/whatsapp.ts`

**Interfaces:**
- Produces: `downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }>`

- [ ] **Step 1: Write the implementation** (no test — live network call)

Add to `src/lib/whatsapp.ts`, after `getWhatsAppDisplayPhoneNumber` (before `sendWhatsAppMessage`):

```ts
// Downloads a WhatsApp media object (image/audio) for the AI-агент
// photo/voice pipeline. Two-step Cloud API dance: (1) GET the media id to
// get a short-lived CDN url + declared mime_type, (2) GET that url with the
// SAME bearer token (WhatsApp's media CDN requires it, unlike a public
// image-page url).
export async function downloadWhatsAppMedia(mediaId: string, accessToken: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaRes = await fetch(`${GRAPH_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const meta = await metaRes.json().catch(() => null)
  if (!metaRes.ok || !meta?.url) {
    throw new WhatsAppApiError(metaRes.status, meta?.error?.message || 'media lookup failed')
  }

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!fileRes.ok) {
    throw new WhatsAppApiError(fileRes.status, 'media download failed')
  }
  const arrayBuffer = await fileRes.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type || 'application/octet-stream' }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp.ts
git commit -m "feat(ai-agent): add WhatsApp media download for photo/voice support"
```

---

### Task 4: Telegram media download + update parsing

**Files:**
- Modify: `src/lib/aiAgent/telegram.ts`
- Modify: `src/lib/aiAgent/telegram.test.ts`

**Interfaces:**
- Produces: `downloadTelegramMedia(fileId: string, botToken: string): Promise<Buffer>`, extended `ParsedTelegramUpdate` union with `'photo'` and `'voice'` and `'unsupported'` kinds

- [ ] **Step 1: Write the failing test** — replace the existing photo/sticker test and add new cases

In `src/lib/aiAgent/telegram.test.ts`, replace this existing test (currently asserts photos are ignored — that assertion is changing):

```ts
  it('ignores non-text messages (photo, sticker: no text field)', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, photo: [{}] }))).toEqual({ kind: 'ignore' })
    expect(parseTelegramUpdate(textUpdate({}, { text: '   ' }))).toEqual({ kind: 'ignore' })
  })
```

with:

```ts
  it('treats a message with only whitespace text as unsupported (not ignore) -- it still has a real chat/from', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: '   ' }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })

  it('parses a photo message, picking the largest (last) size and an optional caption', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, {
      text: undefined,
      caption: 'Вот такой стол',
      photo: [{ file_id: 'small123' }, { file_id: 'large456' }],
    }))
    expect(parsed).toEqual({
      kind: 'photo',
      chatId: '111',
      fromHandle: 'aigerim_a',
      updateId: 42,
      fileId: 'large456',
      caption: 'Вот такой стол',
    })
  })

  it('parses a photo message with no caption as an empty string', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, { text: undefined, photo: [{ file_id: 'only1' }] }))
    expect(parsed.kind === 'photo' && parsed.caption).toBe('')
  })

  it('parses a voice message', () => {
    const parsed = parseTelegramUpdate(textUpdate({}, { text: undefined, voice: { file_id: 'voice789' } }))
    expect(parsed).toEqual({
      kind: 'voice',
      chatId: '111',
      fromHandle: 'aigerim_a',
      updateId: 42,
      fileId: 'voice789',
    })
  })

  it('treats video/document/sticker/location and any other non-text, non-photo, non-voice message as unsupported', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, video: { file_id: 'v1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, sticker: { file_id: 's1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })

  it('falls back to unsupported for a photo/voice missing a usable file_id or update_id', () => {
    expect(parseTelegramUpdate(textUpdate({}, { text: undefined, photo: [{}] }))).toEqual({ kind: 'unsupported', chatId: '111' })
    expect(parseTelegramUpdate(textUpdate({ update_id: 'not-a-number' }, { text: undefined, voice: { file_id: 'v1' } }))).toEqual({ kind: 'unsupported', chatId: '111' })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/aiAgent/telegram.test.ts`
Expected: FAIL — photo/voice cases return `{ kind: 'ignore' }` instead of the new shapes; the whitespace-text case still returns `{ kind: 'ignore' }` too

- [ ] **Step 3: Write the implementation**

Replace `ParsedTelegramUpdate` and `parseTelegramUpdate` in `src/lib/aiAgent/telegram.ts`:

```ts
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
```

Add `downloadTelegramMedia` after `sendTelegramBotMessage`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/aiAgent/telegram.test.ts`
Expected: PASS (all cases, including the pre-existing ones untouched by this change)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (note: the webhook route `src/app/api/ai-agent/telegram/webhook/route.ts` is NOT updated in this task — it still only handles `'start'`/`'text'` and treats everything else, including the new `'photo'`/`'voice'`/`'unsupported'` kinds, as a no-op via its existing `// kind 'ignore' ...` fallthrough comment, since a switch/if-chain with unhandled cases is not a type error. This is fixed in Task 10.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/aiAgent/telegram.ts src/lib/aiAgent/telegram.test.ts
git commit -m "feat(ai-agent): classify photo/voice/unsupported Telegram updates, add media download"
```

---

### Task 5: `generateAiReply` gains an `image` parameter

**Files:**
- Modify: `src/lib/instagramAiReply.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `generateAiReply` param shape gains `image?: { base64: string; mediaType: string }`. Callers that omit it get byte-identical behavior to today.

- [ ] **Step 1: Write the implementation** (no test — live network call to Anthropic, matches this function's own existing untested convention)

In `src/lib/instagramAiReply.ts`, add `image` to the params type:

```ts
export async function generateAiReply(params: {
  incomingText: string
  fromUsername: string
  postCaption?: string
  source: 'comment' | 'dm'
  conversationHistory?: { incoming: string; reply: string }[]
  businessContextLine: string
  collectFieldsToExtract?: { key: string; label: string }[]
  // Present only for a photo message -- Claude's vision handles it, and
  // template matching is skipped upstream (callers never look for a
  // template match when this is set). Absent for every existing caller, so
  // the Anthropic request stays byte-for-byte the string it is today.
  image?: { base64: string; mediaType: string }
}): Promise<{ replyText: string; urgent: boolean; extractedFields?: Record<string, string> }> {
```

Replace the `messageLine`/request-content construction. Find:

```ts
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // max_tokens is a ceiling, not a cost -- billing is by tokens actually
    // generated, so raising it here only when extraction is requested costs
    // nothing extra for a normal-length reply. It exists so a reply near the
    // old 300-token cap plus a multi-field <<<EXTRACTED>>> JSON block can't
    // get cut off before its closing <<<END>>> delimiter, which would make
    // parseExtractedFieldsBlock silently find no match at all.
    max_tokens: hasExtraction ? 500 : 300,
    messages: [{
      role: 'user',
      content: `${params.businessContextLine} ${contextLine}${historyBlock}

Пользователь ${params.fromUsername} написал: "${params.incomingText}"

${lengthInstruction} Ответь на ТОМ ЖЕ ЯЗЫКЕ, на котором написал пользователь (например, казахский → отвечай на казахском, английский → на английском, русский → на русском). Пиши вежливо и дружелюбно. Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей.${extractionAskLine}

Также оцени: сигнализирует ли сообщение о срочности или негативе (явно злой/раздражённый тон, жалоба, угроза уйти/оставить плохой отзыв, требование вернуть деньги, срочная просьба связаться с человеком) — обычный вопрос про цены/функции НЕ считается срочным.

Верни ответ СТРОГО в этом формате, ничего больше:
URGENT: yes ИЛИ no
REPLY: текст ответа без кавычек и пояснений${extractedFormatLine}`,
    }],
  })
```

Replace with:

```ts
  // Photos have no meaningful "написал: ..." line (incomingText is a
  // caption or the '[Фото]' placeholder the caller sets when there's none)
  // -- phrase it as what actually happened so the model isn't confused by
  // a placeholder string sitting where a real quote usually goes.
  const messageLine = params.image
    ? (params.incomingText && params.incomingText !== '[Фото]'
        ? `Пользователь ${params.fromUsername} прислал(а) фото с подписью: "${params.incomingText}"`
        : `Пользователь ${params.fromUsername} прислал(а) фото без подписи.`)
    : `Пользователь ${params.fromUsername} написал: "${params.incomingText}"`

  const textContent = `${params.businessContextLine} ${contextLine}${historyBlock}

${messageLine}

${lengthInstruction} Ответь на ТОМ ЖЕ ЯЗЫКЕ, на котором написал пользователь (например, казахский → отвечай на казахском, английский → на английском, русский → на русском). Пиши вежливо и дружелюбно. Не придумывай факты о ценах, сроках или функциях, которых ты не знаешь — в таком случае вежливо предложи написать в директ для уточнения деталей.${extractionAskLine}

Также оцени: сигнализирует ли сообщение о срочности или негативе (явно злой/раздражённый тон, жалоба, угроза уйти/оставить плохой отзыв, требование вернуть деньги, срочная просьба связаться с человеком) — обычный вопрос про цены/функции НЕ считается срочным.

Верни ответ СТРОГО в этом формате, ничего больше:
URGENT: yes ИЛИ no
REPLY: текст ответа без кавычек и пояснений${extractedFormatLine}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    // max_tokens is a ceiling, not a cost -- billing is by tokens actually
    // generated, so raising it here only when extraction is requested costs
    // nothing extra for a normal-length reply. It exists so a reply near the
    // old 300-token cap plus a multi-field <<<EXTRACTED>>> JSON block can't
    // get cut off before its closing <<<END>>> delimiter, which would make
    // parseExtractedFieldsBlock silently find no match at all.
    max_tokens: hasExtraction ? 500 : 300,
    messages: [{
      role: 'user',
      // A caller that never passes `image` gets the exact same plain-string
      // content this request has sent since before this feature existed.
      content: params.image
        ? [
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                // Validated by the caller (mediaLimits.ts's
                // isImageWithinLimits) before this function is ever called
                // with an image -- safe to narrow here.
                media_type: params.image.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: params.image.base64,
              },
            },
            { type: 'text' as const, text: textContent },
          ]
        : textContent,
    }],
  })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/instagramAiReply.ts
git commit -m "feat(ai-agent): generateAiReply accepts an image param for photo messages"
```

---

### Task 6: WhatsApp handler accepts `media`

**Files:**
- Modify: `src/lib/aiAgent/whatsappWebhookHandler.ts`

**Interfaces:**
- Consumes: `generateAiReply`'s `image` param (Task 5)
- Produces: `WhatsAppIncomingParams` gains `media?: { kind: 'image'; base64: string; mediaType: string }`; `handleWhatsAppIncoming` skips template matching and forwards `image` to `generateAiReply` when `media` is present

- [ ] **Step 1: Write the implementation** (no test — this handler has no existing colocated test; it's exercised through the untested webhook-route/live-network path like its siblings)

In `src/lib/aiAgent/whatsappWebhookHandler.ts`, extend the params interface:

```ts
interface WhatsAppIncomingParams {
  externalId: string
  from: string
  customerHandle: string
  incomingText: string
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead. Never
  // set for a transcribed voice message (that flows as plain incomingText).
  media?: { kind: 'image'; base64: string; mediaType: string }
}
```

Guard the template-match block — change:

```ts
  // Template match first. WhatsApp has no "comment" concept -- every
  // message is DM-shaped, so dm-scoped (and unscoped) templates apply.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
```

to:

```ts
  // Template match first -- skipped entirely for a photo message, since
  // word-based matching has nothing meaningful to match against a caption
  // placeholder. WhatsApp has no "comment" concept -- every message is
  // DM-shaped, so dm-scoped (and unscoped) templates apply.
  let match: { id: string; reply_text: string } | null = null
  if (!params.media) {
    const { data: templates } = await supabase
      .from('ai_agent_reply_templates')
      .select('id, trigger_words, reply_text')
      .eq('agent_id', conn.agentId)
      .or('channel.is.null,channel.eq.dm')
      .order('created_at', { ascending: true })
    match = findTemplateMatch(params.incomingText, templates || [])
  }

  if (match) {
```

Add `image` to the `generateAiReply` call — change:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.customerHandle,
      source: 'dm',
      conversationHistory,
      businessContextLine: buildBusinessContextLine({
```

to:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.customerHandle,
      source: 'dm',
      conversationHistory,
      image: params.media?.kind === 'image' ? { base64: params.media.base64, mediaType: params.media.mediaType } : undefined,
      businessContextLine: buildBusinessContextLine({
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent/whatsappWebhookHandler.ts
git commit -m "feat(ai-agent): WhatsApp handler accepts a media param for photo messages"
```

---

### Task 7: Telegram handler accepts `media`

**Files:**
- Modify: `src/lib/aiAgent/telegramWebhookHandler.ts`

**Interfaces:**
- Consumes: `generateAiReply`'s `image` param (Task 5)
- Produces: `TelegramIncomingParams` gains `media?: { kind: 'image'; base64: string; mediaType: string }`; `handleTelegramIncoming` skips template matching and forwards `image` to `generateAiReply` when `media` is present

- [ ] **Step 1: Write the implementation** (no test — mirrors Task 6, same no-existing-test rationale)

In `src/lib/aiAgent/telegramWebhookHandler.ts`, extend the params interface:

```ts
interface TelegramIncomingParams {
  // telegramDedupKey(botId, update_id) -- Telegram's update_id is the
  // natural redelivery-dedup key, scoped by bot id (see telegram.ts).
  externalId: string
  chatId: string
  fromHandle: string
  incomingText: string
  // Present only for an image message -- template matching is skipped and
  // this goes straight to generateAiReply's `image` param instead.
  media?: { kind: 'image'; base64: string; mediaType: string }
}
```

Guard the template-match block — change:

```ts
  // Template match first. Telegram messages are private-chat messages, the
  // same conversational shape as Instagram DMs -- so dm-scoped (and
  // unscoped) templates apply, comment-scoped ones don't.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or('channel.is.null,channel.eq.dm')
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
```

to:

```ts
  // Template match first -- skipped entirely for a photo message, same
  // reasoning as the WhatsApp tenant path. Telegram messages are private-
  // chat messages, the same conversational shape as Instagram DMs -- so
  // dm-scoped (and unscoped) templates apply, comment-scoped ones don't.
  let match: { id: string; reply_text: string } | null = null
  if (!params.media) {
    const { data: templates } = await supabase
      .from('ai_agent_reply_templates')
      .select('id, trigger_words, reply_text')
      .eq('agent_id', conn.agentId)
      .or('channel.is.null,channel.eq.dm')
      .order('created_at', { ascending: true })
    match = findTemplateMatch(params.incomingText, templates || [])
  }

  if (match) {
```

Add `image` to the `generateAiReply` call — change:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromHandle,
      source: 'dm',
      conversationHistory,
      businessContextLine: buildBusinessContextLine({
```

to:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromHandle,
      source: 'dm',
      conversationHistory,
      image: params.media?.kind === 'image' ? { base64: params.media.base64, mediaType: params.media.mediaType } : undefined,
      businessContextLine: buildBusinessContextLine({
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent/telegramWebhookHandler.ts
git commit -m "feat(ai-agent): Telegram handler accepts a media param for photo messages"
```

---

### Task 8: Instagram tenant handler accepts `media`

**Files:**
- Modify: `src/lib/aiAgent/webhookHandler.ts`

**Interfaces:**
- Consumes: `generateAiReply`'s `image` param (Task 5)
- Produces: `TenantIncomingParams` gains `media?: { kind: 'image'; base64: string; mediaType: string }`; `handleTenantIncoming` skips template matching and forwards `image` to `generateAiReply` when `media` is present. `handleIncoming` (legacy, same file... actually a different file, `src/app/api/instagram/webhook/route.ts`) is untouched.

- [ ] **Step 1: Write the implementation** (no test — mirrors Tasks 6/7)

In `src/lib/aiAgent/webhookHandler.ts`, extend the params interface:

```ts
interface TenantIncomingParams {
  source: 'comment' | 'dm'
  externalId: string
  fromUsername: string
  incomingText: string
  replyTarget: string
  // Present only for an image DM -- template matching is skipped and this
  // is passed straight to generateAiReply's `image` param instead. Never
  // set for source: 'comment' (a comment can't carry an attachment from the
  // commenter).
  media?: { kind: 'image'; base64: string; mediaType: string }
}
```

Guard the template-match block — change:

```ts
  // Template match first, same channel-scoping rule as instagram_reply_templates.
  const { data: templates } = await supabase
    .from('ai_agent_reply_templates')
    .select('id, trigger_words, reply_text')
    .eq('agent_id', conn.agentId)
    .or(`channel.is.null,channel.eq.${params.source}`)
    .order('created_at', { ascending: true })

  const match = findTemplateMatch(params.incomingText, templates || [])

  if (match) {
```

to:

```ts
  // Template match first -- skipped entirely for a photo message, same
  // reasoning as the WhatsApp/Telegram tenant paths. Same channel-scoping
  // rule as instagram_reply_templates otherwise.
  let match: { id: string; reply_text: string } | null = null
  if (!params.media) {
    const { data: templates } = await supabase
      .from('ai_agent_reply_templates')
      .select('id, trigger_words, reply_text')
      .eq('agent_id', conn.agentId)
      .or(`channel.is.null,channel.eq.${params.source}`)
      .order('created_at', { ascending: true })
    match = findTemplateMatch(params.incomingText, templates || [])
  }

  if (match) {
```

Add `image` to the `generateAiReply` call — change:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      source: params.source,
      conversationHistory,
      businessContextLine: buildBusinessContextLine({
```

to:

```ts
    const result = await generateAiReply({
      incomingText: params.incomingText,
      fromUsername: params.fromUsername,
      source: params.source,
      conversationHistory,
      image: params.media?.kind === 'image' ? { base64: params.media.base64, mediaType: params.media.mediaType } : undefined,
      businessContextLine: buildBusinessContextLine({
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent/webhookHandler.ts
git commit -m "feat(ai-agent): Instagram tenant handler accepts a media param for photo messages"
```

---

### Task 9: WhatsApp webhook route — classify, download, transcribe, reply

**Files:**
- Modify: `src/app/api/whatsapp/webhook/route.ts`

**Interfaces:**
- Consumes: `downloadWhatsAppMedia` (Task 3), `transcribeAudio` (Task 2), `isImageWithinLimits`/`isAudioWithinLimits`/`UNSUPPORTED_MEDIA_REPLY_TEXT` (Task 1), `handleWhatsAppIncoming`'s `media` param (Task 6)

- [ ] **Step 1: Write the implementation** (no test — this route has no existing colocated test)

In `src/app/api/whatsapp/webhook/route.ts`, update imports:

```ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { loadWhatsAppConnection, handleWhatsAppIncoming } from '@/lib/aiAgent/whatsappWebhookHandler'
import { downloadWhatsAppMedia, sendWhatsAppMessage } from '@/lib/whatsapp'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
```

Extend the `WhatsAppValue` interface — change:

```ts
interface WhatsAppValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: { profile?: { name?: string }; wa_id?: string }[]
  messages?: { from?: string; id?: string; timestamp?: string; type?: string; text?: { body?: string } }[]
  statuses?: unknown[]
}
```

to:

```ts
interface WhatsAppValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: { profile?: { name?: string }; wa_id?: string }[]
  messages?: {
    from?: string
    id?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    image?: { id?: string; mime_type?: string; caption?: string }
    audio?: { id?: string; mime_type?: string }
  }[]
  statuses?: unknown[]
}
```

Replace the message loop — change:

```ts
      for (const msg of value.messages) {
        // Phase 1: text messages only -- media/location/interactive/etc.
        // are silently skipped, same as non-text Telegram updates.
        if (msg.type !== 'text' || !msg.text?.body || !msg.from || !msg.id) continue

        const contact = value.contacts?.find(c => c.wa_id === msg.from)
        const customerHandle = contact?.profile?.name || msg.from

        try {
          await handleWhatsAppIncoming(conn, {
            externalId: msg.id,
            from: msg.from,
            customerHandle,
            incomingText: msg.text.body,
          })
        } catch (err: any) {
          // A thrown error here must not abort the rest of this webhook
          // delivery's batch (other messages in the same payload).
          console.error('whatsapp webhook: processing failed for', msg.id, ':', err.message)
        }
      }
```

to:

```ts
      for (const msg of value.messages) {
        // Can't reply without knowing who to reply to -- defensive skip,
        // same as before this change.
        if (!msg.from || !msg.id) continue

        const contact = value.contacts?.find(c => c.wa_id === msg.from)
        const customerHandle = contact?.profile?.name || msg.from

        try {
          if (msg.type === 'text' && msg.text?.body) {
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.text.body,
            })
            continue
          }

          if (msg.type === 'image' && msg.image?.id) {
            const { buffer, mimeType } = await downloadWhatsAppMedia(msg.image.id, conn.accessToken)
            if (!isImageWithinLimits(buffer.byteLength, mimeType)) {
              await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
              continue
            }
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: msg.image.caption?.trim() || '[Фото]',
              media: { kind: 'image', base64: buffer.toString('base64'), mediaType: mimeType.split(';')[0].trim().toLowerCase() },
            })
            continue
          }

          if (msg.type === 'audio' && msg.audio?.id) {
            const { buffer, mimeType } = await downloadWhatsAppMedia(msg.audio.id, conn.accessToken)
            if (!isAudioWithinLimits(buffer.byteLength)) {
              await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
              continue
            }
            const transcribedText = await transcribeAudio(buffer, mimeType)
            await handleWhatsAppIncoming(conn, {
              externalId: msg.id,
              from: msg.from,
              customerHandle,
              incomingText: transcribedText,
            })
            continue
          }

          // Any other type (video, document, sticker, location, interactive,
          // etc.), or a text/image/audio message missing the field it needs.
          await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken })
        } catch (err: any) {
          // A thrown error anywhere above (download, transcription, AI
          // reply, send) must not abort the rest of this webhook delivery's
          // batch (other messages in the same payload) -- log it and try to
          // leave the customer with the same polite fallback rather than
          // silence. The fallback send itself is best-effort: if it also
          // fails (e.g. a dead token), swallow it rather than throw.
          console.error('whatsapp webhook: processing failed for', msg.id, ':', err.message)
          await sendWhatsAppMessage(conn.phoneNumberId, msg.from, UNSUPPORTED_MEDIA_REPLY_TEXT, { accessToken: conn.accessToken }).catch(() => {})
        }
      }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/whatsapp/webhook/route.ts
git commit -m "feat(ai-agent): WhatsApp webhook handles photo/voice messages, polite fallback for the rest"
```

---

### Task 10: Telegram webhook route — classify, download, transcribe, reply

**Files:**
- Modify: `src/app/api/ai-agent/telegram/webhook/route.ts`

**Interfaces:**
- Consumes: `downloadTelegramMedia` (Task 4), `transcribeAudio` (Task 2), `isImageWithinLimits`/`isAudioWithinLimits`/`UNSUPPORTED_MEDIA_REPLY_TEXT` (Task 1), `handleTelegramIncoming`'s `media` param (Task 7), extended `ParsedTelegramUpdate` (Task 4)

- [ ] **Step 1: Write the implementation** (no test — this route has no existing colocated test)

In `src/app/api/ai-agent/telegram/webhook/route.ts`, update imports — change:

```ts
import { parseTelegramUpdate, telegramDedupKey, sendTelegramBotMessage } from '@/lib/aiAgent/telegram'
import { loadTelegramConnectionBySecret, handleTelegramIncoming } from '@/lib/aiAgent/telegramWebhookHandler'
```

to:

```ts
import { parseTelegramUpdate, telegramDedupKey, sendTelegramBotMessage, downloadTelegramMedia } from '@/lib/aiAgent/telegram'
import { loadTelegramConnectionBySecret, handleTelegramIncoming } from '@/lib/aiAgent/telegramWebhookHandler'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
```

Replace the dispatch block — change:

```ts
  const parsed = parseTelegramUpdate(update)
  try {
    if (parsed.kind === 'start') {
      // /start is a chat-opening handshake, not a question -- a short
      // static greeting, no AI call, no logging, no debit. The agent's real
      // business greeting comes from the AI on the first actual message.
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    } else if (parsed.kind === 'text') {
      await handleTelegramIncoming(conn, {
        externalId: telegramDedupKey(conn.botId, parsed.updateId),
        chatId: parsed.chatId,
        fromHandle: parsed.fromHandle,
        incomingText: parsed.text,
      })
    }
    // kind 'ignore' (non-text, edits, other bots, other commands): no-op.
  } catch (err: any) {
    console.error('ai-agent telegram webhook: processing failed:', err.message)
  }
```

to:

```ts
  const parsed = parseTelegramUpdate(update)
  try {
    if (parsed.kind === 'start') {
      // /start is a chat-opening handshake, not a question -- a short
      // static greeting, no AI call, no logging, no debit. The agent's real
      // business greeting comes from the AI on the first actual message.
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, 'Здравствуйте! Напишите ваш вопрос — я на связи.')
    } else if (parsed.kind === 'text') {
      await handleTelegramIncoming(conn, {
        externalId: telegramDedupKey(conn.botId, parsed.updateId),
        chatId: parsed.chatId,
        fromHandle: parsed.fromHandle,
        incomingText: parsed.text,
      })
    } else if (parsed.kind === 'photo') {
      try {
        const buffer = await downloadTelegramMedia(parsed.fileId, conn.botToken)
        // Telegram Bot API always re-encodes photos as JPEG.
        if (!isImageWithinLimits(buffer.byteLength, 'image/jpeg')) {
          await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
        } else {
          await handleTelegramIncoming(conn, {
            externalId: telegramDedupKey(conn.botId, parsed.updateId),
            chatId: parsed.chatId,
            fromHandle: parsed.fromHandle,
            incomingText: parsed.caption || '[Фото]',
            media: { kind: 'image', base64: buffer.toString('base64'), mediaType: 'image/jpeg' },
          })
        }
      } catch (mediaErr: any) {
        console.error('ai-agent telegram webhook: photo processing failed:', mediaErr.message)
        await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT).catch(() => {})
      }
    } else if (parsed.kind === 'voice') {
      try {
        const buffer = await downloadTelegramMedia(parsed.fileId, conn.botToken)
        if (!isAudioWithinLimits(buffer.byteLength)) {
          await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
        } else {
          // Telegram voice notes are always ogg/opus.
          const transcribedText = await transcribeAudio(buffer, 'audio/ogg')
          await handleTelegramIncoming(conn, {
            externalId: telegramDedupKey(conn.botId, parsed.updateId),
            chatId: parsed.chatId,
            fromHandle: parsed.fromHandle,
            incomingText: transcribedText,
          })
        }
      } catch (mediaErr: any) {
        console.error('ai-agent telegram webhook: voice processing failed:', mediaErr.message)
        await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT).catch(() => {})
      }
    } else if (parsed.kind === 'unsupported') {
      await sendTelegramBotMessage(conn.botToken, parsed.chatId, UNSUPPORTED_MEDIA_REPLY_TEXT)
    }
    // kind 'ignore' (edits, other bots, other commands): no-op, unchanged.
  } catch (err: any) {
    console.error('ai-agent telegram webhook: processing failed:', err.message)
  }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-agent/telegram/webhook/route.ts
git commit -m "feat(ai-agent): Telegram webhook handles photo/voice messages, polite fallback for the rest"
```

---

### Task 11: Instagram webhook route (tenant branch only) — classify, download, transcribe, reply

**Files:**
- Modify: `src/app/api/instagram/webhook/route.ts`

**Interfaces:**
- Consumes: `transcribeAudio` (Task 2), `isImageWithinLimits`/`isAudioWithinLimits`/`sniffImageMimeType`/`UNSUPPORTED_MEDIA_REPLY_TEXT` (Task 1), `handleTenantIncoming`'s `media` param (Task 8)
- The legacy branch (`isLegacyAccount`, calling `handleIncoming`) is preserved byte-for-byte in behavior — only its early-exit guard is restructured to share the `is_echo` check with the tenant branch.

- [ ] **Step 1: Write the implementation** (no test — this route has no existing colocated test)

In `src/app/api/instagram/webhook/route.ts`, update imports — change:

```ts
import { loadTenantConnection, handleTenantIncoming } from '@/lib/aiAgent/webhookHandler'
```

to:

```ts
import { loadTenantConnection, handleTenantIncoming } from '@/lib/aiAgent/webhookHandler'
import { transcribeAudio } from '@/lib/openaiWhisper'
import { isImageWithinLimits, isAudioWithinLimits, sniffImageMimeType, UNSUPPORTED_MEDIA_REPLY_TEXT } from '@/lib/aiAgent/mediaLimits'
```

Replace the messaging loop — change:

```ts
    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || !msg?.text || msg.is_echo) continue
      if (isLegacyAccount) {
        await handleIncoming({
          source: 'dm',
          externalId: msg.mid,
          fromUsername: messaging.sender?.id || 'unknown',
          incomingText: msg.text,
          replyTarget: messaging.sender?.id,
        })
      } else {
        await handleTenantIncoming(tenantConnection!, {
          source: 'dm',
          externalId: msg.mid,
          fromUsername: messaging.sender?.id || 'unknown',
          incomingText: msg.text,
          replyTarget: messaging.sender?.id,
        })
      }
    }
```

to:

```ts
    for (const messaging of entry.messaging || []) {
      const msg = messaging.message
      if (!msg?.mid || msg.is_echo) continue

      const fromUsername = messaging.sender?.id || 'unknown'
      const replyTarget = messaging.sender?.id

      if (isLegacyAccount) {
        // Legacy single-tenant bot -- explicitly out of scope for photo/
        // voice support (see the design spec's "Явно не входит в объём").
        // Text-only, unchanged from before this change.
        if (!msg.text) continue
        await handleIncoming({
          source: 'dm',
          externalId: msg.mid,
          fromUsername,
          incomingText: msg.text,
          replyTarget,
        })
        continue
      }

      if (typeof msg.text === 'string' && msg.text) {
        await handleTenantIncoming(tenantConnection!, {
          source: 'dm',
          externalId: msg.mid,
          fromUsername,
          incomingText: msg.text,
          replyTarget,
        })
        continue
      }

      // No text -- check for a photo/audio attachment. Can't reply without
      // a sender id or a fetchable attachment url -- defensive skip.
      const attachment = Array.isArray(msg.attachments) ? msg.attachments[0] : undefined
      if (!replyTarget || !attachment?.payload?.url) continue

      try {
        if (attachment.type === 'image') {
          const res = await fetch(attachment.payload.url)
          if (!res.ok) throw new Error(`attachment fetch failed (HTTP ${res.status})`)
          const buffer = Buffer.from(await res.arrayBuffer())
          const mimeType = sniffImageMimeType(buffer)
          if (!mimeType || !isImageWithinLimits(buffer.byteLength, mimeType)) {
            await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
          } else {
            await handleTenantIncoming(tenantConnection!, {
              source: 'dm',
              externalId: msg.mid,
              fromUsername,
              incomingText: '[Фото]',
              replyTarget,
              media: { kind: 'image', base64: buffer.toString('base64'), mediaType },
            })
          }
        } else if (attachment.type === 'audio') {
          const res = await fetch(attachment.payload.url)
          if (!res.ok) throw new Error(`attachment fetch failed (HTTP ${res.status})`)
          const buffer = Buffer.from(await res.arrayBuffer())
          if (!isAudioWithinLimits(buffer.byteLength)) {
            await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
          } else {
            // Instagram's own audio-attachment container format isn't
            // documented -- 'audio/mp4' is a best-effort guess, same
            // honesty-over-fabrication spirit as this codebase's other
            // unverified-external-format notes (see e.g.
            // kaspi_shop_repricer_invoices_kz's dbcrfl flag). Whisper
            // generally decodes by content, not strictly by this hint.
            const transcribedText = await transcribeAudio(buffer, 'audio/mp4')
            await handleTenantIncoming(tenantConnection!, {
              source: 'dm',
              externalId: msg.mid,
              fromUsername,
              incomingText: transcribedText,
              replyTarget,
            })
          }
        } else {
          // Any other attachment type (video, file, story reply, etc.)
          await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken })
        }
      } catch (err: any) {
        // A thrown error anywhere above must not abort the rest of this
        // webhook delivery's batch (other messages in the same payload).
        // The fallback send itself is best-effort: if it also fails (e.g.
        // a dead token), swallow it rather than throw.
        console.error('instagram webhook: attachment processing failed for', msg.mid, ':', err.message)
        await sendDirectMessage(replyTarget, UNSUPPORTED_MEDIA_REPLY_TEXT, { igUserId: tenantConnection!.externalAccountId, accessToken: tenantConnection!.accessToken }).catch(() => {})
      }
    }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/instagram/webhook/route.ts
git commit -m "feat(ai-agent): Instagram tenant webhook handles photo/voice messages, polite fallback for the rest"
```

---

### Task 12: Final whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `mediaLimits.test.ts` and the modified `telegram.test.ts`

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds cleanly — per `AGENTS.md`, this project's Next.js version has route-shape rules `tsc --noEmit` alone doesn't catch (e.g. `params: Promise<{...}>`), so the build is a required gate, not a redundant check.

- [ ] **Step 4: Read-through review**

Re-read all 11 modified/created files together and confirm:
- Every path that can produce a photo/voice message ends in exactly one of: an AI reply (billed 1 credit), a template reply (free, text-only, never for photos), or the `UNSUPPORTED_MEDIA_REPLY_TEXT` fallback (free) — never silence, never a thrown error that isn't caught.
- The legacy Instagram bot's behavior (`isLegacyAccount` branch) is unchanged from before this plan — still text-only, still silently skips non-text.
- No new database migration was needed (confirm no `create table`/`alter table` crept in).

- [ ] **Step 5: Note the external follow-up for the user**

This step has no code — flag to the user in the final report: `OPENAI_API_KEY` still needs to be generated and added to Vercel Production, followed by a redeploy, before this works live (same "still owed" pattern as every other external-service feature in this project).

- [ ] **Step 6: Commit** (only if Step 4 found anything to fix; otherwise this task has no changes of its own to commit)
