import { describe, it, expect } from 'vitest'
import { isTerminalStep, findStepById, firstStep, parseFlowDefinition, findFlowTriggerMatch, resolveFlowButtonClick, type FlowDefinition } from './flow'

const sample: FlowDefinition = {
  steps: [
    { id: 's1', text: 'Здравствуйте! Что вас интересует?', buttons: [{ label: 'Цены', nextStepId: 's2' }, { label: 'Готово', nextStepId: null }] },
    { id: 's2', text: 'Актуальные цены на сайте.', buttons: [] },
  ],
}

describe('isTerminalStep', () => {
  it('is true for a step with no buttons', () => {
    expect(isTerminalStep(sample.steps[1])).toBe(true)
  })
  it('is false for a step with buttons', () => {
    expect(isTerminalStep(sample.steps[0])).toBe(false)
  })
})

describe('findStepById / firstStep', () => {
  it('finds a step by id', () => {
    expect(findStepById(sample, 's2')).toEqual(sample.steps[1])
  })
  it('returns undefined for an unknown id', () => {
    expect(findStepById(sample, 'nope')).toBeUndefined()
  })
  it('returns the first array element as the entry step', () => {
    expect(firstStep(sample)).toEqual(sample.steps[0])
  })
  it('returns undefined for an empty flow', () => {
    expect(firstStep({ steps: [] })).toBeUndefined()
  })
})

describe('parseFlowDefinition', () => {
  it('accepts a well-formed definition', () => {
    expect(parseFlowDefinition(sample)).toEqual(sample)
  })

  it('rejects non-object / non-array-steps input', () => {
    expect(parseFlowDefinition(null)).toBeNull()
    expect(parseFlowDefinition('garbage')).toBeNull()
    expect(parseFlowDefinition({})).toBeNull()
    expect(parseFlowDefinition({ steps: 'nope' })).toBeNull()
    expect(parseFlowDefinition({ steps: [] })).toBeNull()
  })

  it('rejects a step missing id or text, or with non-array buttons', () => {
    expect(parseFlowDefinition({ steps: [{ text: 'x', buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', buttons: 'no' }] })).toBeNull()
  })

  it('rejects duplicate step ids', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [] }, { id: 's1', text: 'b', buttons: [] }] })).toBeNull()
  })

  it('rejects a button missing a label, or with a non-string non-null nextStepId', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ nextStepId: null }] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ label: 'x', nextStepId: 42 }] }] })).toBeNull()
  })

  it('accepts a button with nextStepId: null', () => {
    const def = { steps: [{ id: 's1', text: 'a', buttons: [{ label: 'Готово', nextStepId: null }] }] }
    expect(parseFlowDefinition(def)).toEqual(def)
  })

  it('rejects a dangling nextStepId reference', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'a', buttons: [{ label: 'x', nextStepId: 'ghost' }] }] })).toBeNull()
  })
})

describe('findFlowTriggerMatch', () => {
  const flows = [
    { id: 'f1', trigger_words: ['меню', 'menu'] },
    { id: 'f2', trigger_words: ['запись'] },
  ]
  it('matches case-insensitively against a substring', () => {
    expect(findFlowTriggerMatch('покажите МЕНЮ пожалуйста', flows)).toBe('f1')
  })
  it('returns the first matching flow in array order', () => {
    expect(findFlowTriggerMatch('menu запись', flows)).toBe('f1')
  })
  it('returns null when nothing matches', () => {
    expect(findFlowTriggerMatch('привет', flows)).toBeNull()
  })
})

describe('invoice flow steps', () => {
  it('accepts an invoice step with a valid invoiceItem and no buttons', () => {
    const def = parseFlowDefinition({ steps: [
      { id: 's1', text: 'Оформляю счёт', buttons: [], kind: 'invoice', invoiceItem: { name: 'Кружка', unitPrice: 1200 } },
    ] })
    expect(def?.steps[0].kind).toBe('invoice')
    expect(def?.steps[0].invoiceItem).toEqual({ name: 'Кружка', unitPrice: 1200 })
  })
  it('rejects an invoice step with missing/invalid invoiceItem or with buttons', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', buttons: [], kind: 'invoice' }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', kind: 'invoice', invoiceItem: { name: '', unitPrice: 5 }, buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', kind: 'invoice', invoiceItem: { name: 'A', unitPrice: 0 }, buttons: [] }] })).toBeNull()
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', kind: 'invoice', invoiceItem: { name: 'A', unitPrice: 5 }, buttons: [{ label: 'B', nextStepId: null }] }] })).toBeNull()
  })
  it('rejects an unknown kind value', () => {
    expect(parseFlowDefinition({ steps: [{ id: 's1', text: 'x', buttons: [], kind: 'weird' }] })).toBeNull()
  })
  it('legacy steps without kind still parse as message steps', () => {
    const def = parseFlowDefinition({ steps: [{ id: 's1', text: 'Привет', buttons: [] }] })
    expect(def?.steps[0].kind ?? 'message').toBe('message')
  })
})

describe('resolveFlowButtonClick', () => {
  const def: FlowDefinition = {
    steps: [
      { id: 's1', text: 'Что вас интересует?', buttons: [{ label: 'Цены', nextStepId: 's2' }, { label: 'Готово', nextStepId: null }] },
      { id: 's2', text: 'Актуальные цены на сайте.', buttons: [] },
    ],
  }

  it('advances to the next step when the button has a real nextStepId', () => {
    expect(resolveFlowButtonClick(def, 's1', 0)).toEqual({ outcome: 'advanced', nextStep: def.steps[1] })
  })

  it('ends the flow when the button has nextStepId: null', () => {
    expect(resolveFlowButtonClick(def, 's1', 1)).toEqual({ outcome: 'ended' })
  })

  it('is stale when the active step id does not exist in the definition', () => {
    expect(resolveFlowButtonClick(def, 'ghost-step', 0)).toEqual({ outcome: 'stale' })
  })

  it('is stale when the button index does not exist on the current step', () => {
    expect(resolveFlowButtonClick(def, 's1', 5)).toEqual({ outcome: 'stale' })
  })

  it('is stale when nextStepId points at a step that no longer exists (defensive, save-time validation should prevent this)', () => {
    const corrupted: FlowDefinition = { steps: [{ id: 's1', text: 'x', buttons: [{ label: 'A', nextStepId: 'ghost' }] }] }
    expect(resolveFlowButtonClick(corrupted, 's1', 0)).toEqual({ outcome: 'stale' })
  })
})
