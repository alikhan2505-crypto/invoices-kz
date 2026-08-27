import crypto from 'crypto'
import type { FlowStep } from './aiAgent/flow'

// WhatsApp Cloud API helpers for the multi-tenant AI-агент WhatsApp channel --
// fills the same role src/lib/instagram.ts fills for Instagram and
// src/lib/aiAgent/telegram.ts fills for Telegram. Same underlying Graph API
// host as Instagram's OAuth token exchange (graph.facebook.com), but a
// DIFFERENT product surface (WhatsApp Business Platform / Cloud API, not
// graph.instagram.com) with its own endpoints and v25.0 pin.
const GRAPH_API = 'https://graph.facebook.com/v25.0'

// Mirrors InstagramApiError / TelegramApiError -- a 401 on a send or API
// call means the stored access token is dead (revoked from the customer's
// Meta Business Manager), which callers translate into the connection's
// token_expired status instead of retrying forever.
export class WhatsAppApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'WhatsAppApiError'
    this.status = status
  }
}

async function callGraphApi(url: string, accessToken: string, body?: Record<string, unknown>): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new WhatsAppApiError(res.status, data?.error?.message || `WhatsApp API call failed (HTTP ${res.status})`)
  }
  return data
}

// Step 1 of Embedded Signup: exchange the short-lived `code` the JS SDK
// popup handed the frontend for a system-user access token. GET with query
// params (not a bearer-authed POST) -- this is Meta's plain OAuth token
// endpoint, same shape as any Facebook Login code exchange.
export async function exchangeWhatsAppCode(code: string, appId: string, appSecret: string): Promise<{ accessToken: string }> {
  const url = `${GRAPH_API}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
  const res = await fetch(url)
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.access_token) {
    throw new WhatsAppApiError(res.status, data?.error?.message || 'code exchange failed')
  }
  return { accessToken: data.access_token as string }
}

// Step 2: register the phone number for Cloud API messaging. Required once
// per phone number before it can send/receive via the API -- a customer's
// number that was only ever used in the regular WhatsApp Business app isn't
// usable here until this call succeeds. The 6-digit PIN is a two-step-
// verification PIN WhatsApp associates with the number; nothing in this
// integration ever needs to present it again (no SMS/voice verification
// flow lives on our side), so it's generated fresh and discarded -- never
// stored.
export async function registerWhatsAppPhoneNumber(phoneNumberId: string, accessToken: string): Promise<void> {
  const pin = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  await callGraphApi(`${GRAPH_API}/${phoneNumberId}/register`, accessToken, {
    messaging_product: 'whatsapp',
    pin,
  })
}

// Step 3: subscribe OUR app to this customer's WABA-level webhooks (message
// deliveries, statuses, etc.) -- the WhatsApp equivalent of Instagram's
// per-account me/subscribed_apps subscription (see the 2026-08-16 incident
// note in ai-agent instagram/callback/route.ts: without this, Meta silently
// delivers nothing even though the app-level webhook is configured).
export async function subscribeWhatsAppWebhooks(wabaId: string, accessToken: string): Promise<void> {
  await callGraphApi(`${GRAPH_API}/${wabaId}/subscribed_apps`, accessToken)
}

// Disconnect-time counterpart to subscribeWhatsAppWebhooks -- best-effort,
// called by the disconnect route the same way Instagram's disconnect route
// calls DELETE me/subscribed_apps.
export async function unsubscribeWhatsAppWebhooks(wabaId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new WhatsAppApiError(res.status, data?.error?.message || 'unsubscribe failed')
  }
}

// Best-effort display number for the settings-page "✓ Подключено: <number>"
// chip -- mirrors Telegram's getMe-derived @botusername. Returns null on
// any failure rather than throwing: a missing display name shouldn't fail
// an otherwise-successful connect.
export async function getWhatsAppDisplayPhoneNumber(phoneNumberId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.display_phone_number) return null
    return data.display_phone_number as string
  } catch {
    return null
  }
}

// Independent check used ONLY to decide whether a registerWhatsAppPhoneNumber
// failure is safe to ignore (Embedded Signup v4 already registers the number
// inside its own popup flow for most connect attempts, making our own
// /register call a redundant no-op that Meta rejects) -- never trust the
// register() error message alone, always re-confirm against Meta directly.
export async function isWhatsAppPhoneNumberVerified(phoneNumberId: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH_API}/${phoneNumberId}?fields=code_verification_status`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json().catch(() => null)
    return res.ok && data?.code_verification_status === 'VERIFIED'
  } catch {
    return false
  }
}

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

// Sends a plain-text WhatsApp message. `to` is the customer's WhatsApp
// phone number (E.164-ish digits, no '+', e.g. "77771234567") from the
// inbound webhook's `messages[].from`.
export async function sendWhatsAppMessage(phoneNumberId: string, to: string, text: string, opts: { accessToken: string }): Promise<void> {
  await callGraphApi(`${GRAPH_API}/${phoneNumberId}/messages`, opts.accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  })
}

const WHATSAPP_BUTTON_TITLE_MAX = 20
const WHATSAPP_LIST_ROW_TITLE_MAX = 24
const WHATSAPP_LIST_BUTTON_LABEL = 'Выбрать'
const WHATSAPP_LIST_MAX_ROWS = 10

// Pure -- decides WhatsApp's native interactive shape for a flow step's
// button count. FlowBuilder.tsx already caps a step at 8 buttons, so the
// >10 truncation branch below is defensive (unreachable via the UI today),
// not a real UX for that case.
export function buildWhatsAppFlowMessage(step: FlowStep): Record<string, unknown> {
  if (step.buttons.length === 0) {
    return { type: 'text', text: { body: step.text } }
  }
  if (step.buttons.length <= 3) {
    return {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: step.text },
        action: {
          buttons: step.buttons.map((b, i) => ({
            type: 'reply',
            reply: { id: `btn:${step.id}:${i}`, title: b.label.slice(0, WHATSAPP_BUTTON_TITLE_MAX) },
          })),
        },
      },
    }
  }
  if (step.buttons.length > WHATSAPP_LIST_MAX_ROWS) {
    console.error('ai-agent flow: step', step.id, 'has', step.buttons.length, 'buttons -- WhatsApp List Message caps at', WHATSAPP_LIST_MAX_ROWS, ', truncating')
  }
  const rows = step.buttons.slice(0, WHATSAPP_LIST_MAX_ROWS).map((b, i) => ({
    id: `btn:${step.id}:${i}`,
    title: b.label.slice(0, WHATSAPP_LIST_ROW_TITLE_MAX),
  }))
  return {
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: step.text },
      action: { button: WHATSAPP_LIST_BUTTON_LABEL, sections: [{ rows }] },
    },
  }
}

// Sends one flow step -- text, Reply Buttons, or a List Message depending
// on button count (buildWhatsAppFlowMessage). All three are session
// messages, allowed within the same 24h customer-service window as
// sendWhatsAppMessage's plain text, no template approval needed.
export async function sendWhatsAppFlowStep(phoneNumberId: string, to: string, step: FlowStep, accessToken: string): Promise<void> {
  await callGraphApi(`${GRAPH_API}/${phoneNumberId}/messages`, accessToken, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...buildWhatsAppFlowMessage(step),
  })
}
