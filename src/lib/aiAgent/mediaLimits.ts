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
