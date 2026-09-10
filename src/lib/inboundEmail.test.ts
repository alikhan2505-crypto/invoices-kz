import { describe, it, expect } from 'vitest'
import { extractInboundEmail, isReceivedEvent } from './inboundEmail'

describe('isReceivedEvent', () => {
  it('accepts email.received', () => {
    expect(isReceivedEvent({ type: 'email.received' })).toBe(true)
  })

  it('rejects the delivery events that share the webhook shape', () => {
    for (const type of ['email.sent', 'email.delivered', 'email.bounced', 'email.opened']) {
      expect(isReceivedEvent({ type }), type).toBe(false)
    }
  })

  it('rejects an unknown or missing type rather than guessing', () => {
    // Storing our own outgoing mail as a customer reply would be worse than
    // storing nothing: it looks like feedback that nobody actually sent.
    expect(isReceivedEvent({ type: 'something.new' })).toBe(false)
    expect(isReceivedEvent({})).toBe(false)
    expect(isReceivedEvent(null)).toBe(false)
  })
})

describe('extractInboundEmail', () => {
  it('reads a payload nested under data', () => {
    const result = extractInboundEmail({
      type: 'email.received',
      created_at: '2026-09-10T06:30:00.000Z',
      data: {
        email_id: 'abc-123',
        from: 'Жасмин <askar7013@gmail.com>',
        to: ['otvet@zenesyon.resend.app'],
        subject: 'Re: Вы остановились на банковских реквизитах',
        text: 'Не нашла где вводить БИК',
      },
    })
    expect(result.resendId).toBe('abc-123')
    expect(result.from).toBe('Жасмин <askar7013@gmail.com>')
    expect(result.to).toBe('otvet@zenesyon.resend.app')
    expect(result.subject).toBe('Re: Вы остановились на банковских реквизитах')
    expect(result.text).toBe('Не нашла где вводить БИК')
    expect(result.receivedAt).toBe('2026-09-10T06:30:00.000Z')
  })

  it('reads a flat payload with no data wrapper', () => {
    const result = extractInboundEmail({
      type: 'email.received',
      id: 'flat-1',
      from: 'a@b.kz',
      to: 'otvet@zenesyon.resend.app',
      subject: 'Ответ',
      body: 'Текст',
    })
    expect(result.resendId).toBe('flat-1')
    expect(result.text).toBe('Текст')
  })

  it('accepts the alternative key names Resend might use', () => {
    const result = extractInboundEmail({
      data: { inbound_email_id: 'x', sender: 'a@b.kz', recipient: 'otvet@z.resend.app', text_body: 'T' },
    })
    expect(result.resendId).toBe('x')
    expect(result.from).toBe('a@b.kz')
    expect(result.to).toBe('otvet@z.resend.app')
    expect(result.text).toBe('T')
  })

  it('returns nulls instead of throwing on junk', () => {
    // The route decides what to do about a missing id; the extractor must not
    // be the thing that 500s and makes Resend retry forever.
    for (const junk of [null, undefined, 'string', 42, []]) {
      const result = extractInboundEmail(junk)
      expect(result.resendId).toBeNull()
      expect(result.text).toBeNull()
    }
  })

  it('ignores empty and whitespace-only values', () => {
    const result = extractInboundEmail({ data: { email_id: '  ', subject: '', to: [] } })
    expect(result.resendId).toBeNull()
    expect(result.subject).toBeNull()
    expect(result.to).toBeNull()
  })
})
