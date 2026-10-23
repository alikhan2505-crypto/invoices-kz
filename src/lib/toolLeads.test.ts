import { describe, it, expect } from 'vitest'
import { TOOL_LABELS, leadTelegramMessage } from './toolLeads'

// Неизвестный tool молча записался бы под fallbackTool маршрута ('waybills'),
// поэтому каждый инструмент со сбором email обязан быть в белом списке.
describe('toolLeads whitelist', () => {
  it('accepts every free tool that sends a lead', () => {
    for (const tool of ['waybills', 'margin', 'kp', 'schet', 'avr', 'nakladnaya']) {
      expect(TOOL_LABELS[tool], tool).toBeTruthy()
    }
  })

  it('labels the marketing-consent tools as such', () => {
    for (const tool of ['kp', 'schet', 'avr', 'nakladnaya']) {
      expect(TOOL_LABELS[tool]).toMatch(/согласием на рассылку/)
    }
  })
})

describe('leadTelegramMessage', () => {
  it('escapes HTML in the visitor-supplied contact (Telegram parse_mode HTML)', () => {
    const msg = leadTelegramMessage('margin', '<a href="https://evil.example">x</a> & co')
    expect(msg).not.toContain('<a')
    expect(msg).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;x&lt;/a&gt; &amp; co')
  })

  it('keeps a plain email or phone readable', () => {
    expect(leadTelegramMessage('margin', 'a@b.kz')).toContain('a@b.kz')
    expect(leadTelegramMessage('margin', '+7 701 000 00 00')).toContain('+7 701 000 00 00')
  })
})
