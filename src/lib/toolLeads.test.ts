import { describe, it, expect } from 'vitest'
import { TOOL_LABELS } from './toolLeads'

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
