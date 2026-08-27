import { describe, it, expect } from 'vitest'
import { buildInstagramFlowMessage } from './instagram'
import type { FlowStep } from './aiAgent/flow'

describe('buildInstagramFlowMessage', () => {
  it('returns a plain text message for a terminal (no-button) step', () => {
    const step: FlowStep = { id: 's1', text: 'Спасибо!', buttons: [] }
    expect(buildInstagramFlowMessage(step)).toEqual({ text: 'Спасибо!' })
  })

  it('returns quick_replies for a step with buttons', () => {
    const step: FlowStep = { id: 's1', text: 'Выберите', buttons: [{ label: 'Да', nextStepId: null }, { label: 'Нет', nextStepId: null }] }
    expect(buildInstagramFlowMessage(step)).toEqual({
      text: 'Выберите',
      quick_replies: [
        { content_type: 'text', title: 'Да', payload: 'btn:s1:0' },
        { content_type: 'text', title: 'Нет', payload: 'btn:s1:1' },
      ],
    })
  })

  it('truncates a button label to 20 chars', () => {
    const step: FlowStep = { id: 's1', text: 'x', buttons: [{ label: 'Очень длинное название кнопки, которое точно не влезет', nextStepId: null }] }
    const result = buildInstagramFlowMessage(step)
    expect(result.quick_replies![0].title.length).toBeLessThanOrEqual(20)
  })

  it('caps quick replies at 13 even with more buttons', () => {
    const step: FlowStep = {
      id: 's1', text: 'x',
      buttons: Array.from({ length: 15 }, (_, i) => ({ label: `Вариант ${i}`, nextStepId: null })),
    }
    const result = buildInstagramFlowMessage(step)
    expect(result.quick_replies).toHaveLength(13)
  })
})
