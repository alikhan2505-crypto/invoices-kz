// Pulls the useful fields out of a Resend email.received webhook payload.
//
// Resend's own docs describe the inbound webhook only as "parses the contents
// and attachments, and then sends a POST request" -- the payload's exact shape
// is not published. So this reads defensively over the key names Resend uses
// elsewhere in its API, and the caller stores the whole payload alongside the
// extracted columns. If a field turns out to live under a name not listed
// here, the reply is still in `raw` and nothing has been lost.

export interface InboundEmailFields {
  resendId: string | null
  from: string | null
  to: string | null
  subject: string | null
  text: string | null
  receivedAt: string | null
}

function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  return null
}

/** First non-empty string among `keys`, looked up on `source`. */
function pick(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const found = str(source[key])
    if (found) return found
  }
  return null
}

/**
 * `to` as a single string. Resend sends recipients as an array in the send API
 * and there is no reason to assume inbound differs, but a bare string is
 * accepted too rather than silently dropping the recipient.
 */
function recipient(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find(v => str(v))
    return first ? str(first) : null
  }
  return str(value)
}

export function extractInboundEmail(payload: unknown): InboundEmailFields {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>

  return {
    // email_id is what the retrieve-received-email endpoint takes; id is the
    // fallback for a payload that names it plainly.
    resendId: pick(data, ['email_id', 'id', 'inbound_email_id']),
    from: pick(data, ['from', 'from_address', 'sender']),
    to: recipient(data.to ?? data.to_address ?? data.recipient),
    subject: pick(data, ['subject']),
    text: pick(data, ['text', 'text_body', 'plain', 'body']),
    receivedAt: pick(data, ['created_at', 'received_at']) || pick(root, ['created_at']),
  }
}

/**
 * Whether this payload is an inbound message rather than one of the delivery
 * events (email.sent, email.delivered, ...) that share the webhook shape.
 *
 * Unknown types are treated as NOT received: subscribing to the wrong event by
 * accident should leave the table empty and obvious, not fill it with our own
 * outgoing mail masquerading as customer replies.
 */
export function isReceivedEvent(payload: unknown): boolean {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  return str(root.type) === 'email.received'
}

/**
 * The Telegram line announcing a reply.
 *
 * Deliberately short: the webhook payload carries no body at all, so there is
 * nothing to quote, and a notification that only says who wrote and about
 * what is the honest shape of what we know. The full text is fetched from
 * Resend when someone actually reads the thread.
 */
export function inboundNotificationText(fields: InboundEmailFields): string {
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const from = escape(fields.from || 'неизвестный отправитель')
  const subject = fields.subject ? escape(fields.subject) : 'без темы'
  return `✉️ <b>Ответ на нашу почту</b>

От: ${from}
Тема: ${subject}`
}
