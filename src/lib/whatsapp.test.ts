import { describe, it, expect } from 'vitest'
import { buildWhatsAppFlowMessage } from './whatsapp'
import type { FlowStep } from './aiAgent/flow'

describe('buildWhatsAppFlowMessage', () => {
  it('returns a plain text message for a terminal (no-button) step', () => {
    const step: FlowStep = { id: 's1', text: 'Спасибо!', buttons: [] }
    expect(buildWhatsAppFlowMessage(step)).toEqual({ type: 'text', text: { body: 'Спасибо!' } })
  })

  it('returns Interactive Reply Buttons for 1-3 buttons', () => {
    const step: FlowStep = { id: 's1', text: 'Выберите', buttons: [{ label: 'Да', nextStepId: null }, { label: 'Нет', nextStepId: null }] }
    expect(buildWhatsAppFlowMessage(step)).toEqual({
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Выберите' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'btn:s1:0', title: 'Да' } },
            { type: 'reply', reply: { id: 'btn:s1:1', title: 'Нет' } },
          ],
        },
      },
    })
  })

  it('returns an Interactive List Message for 4-10 buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'Выберите товар',
      buttons: [1, 2, 3, 4, 5].map(n => ({ label: `Товар ${n}`, nextStepId: null })),
    }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.type).toBe('interactive')
    expect(result.interactive.type).toBe('list')
    expect(result.interactive.action.sections[0].rows).toHaveLength(5)
    expect(result.interactive.action.sections[0].rows[0]).toEqual({ id: 'btn:s1:0', title: 'Товар 1' })
  })

  it('truncates a button label to 20 chars for Reply Buttons', () => {
    const step: FlowStep = { id: 's1', text: 'x', buttons: [{ label: 'Очень длинное название кнопки, которое точно не влезет', nextStepId: null }] }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20)
  })

  it('caps a list message at 10 rows even with more buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'x',
      buttons: Array.from({ length: 12 }, (_, i) => ({ label: `Товар ${i}`, nextStepId: null })),
    }
    const result: any = buildWhatsAppFlowMessage(step)
    expect(result.interactive.action.sections[0].rows).toHaveLength(10)
  })
})
