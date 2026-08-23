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
  form.append('file', new Blob([new Uint8Array(buffer)], { type: baseType }), 'voice.ogg')
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
