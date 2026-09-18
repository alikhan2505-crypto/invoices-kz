import { describe, it, expect } from 'vitest'
import { parseFlowDefinition } from './flow'
import { SALON_STARTER_DEFINITION } from './salonStarterFlow'

describe('salon starter flow definition', () => {
  it('is a well-formed FlowDefinition per parseFlowDefinition\'s own runtime rules', () => {
    // Round-tripped through JSON the same way it actually travels once
    // read back out of the jsonb column -- the TS type alone doesn't
    // check parseFlowDefinition's runtime rules (no dangling nextStepId,
    // unique ids, non-empty text/label), only this does.
    const parsed = parseFlowDefinition(JSON.parse(JSON.stringify(SALON_STARTER_DEFINITION)))
    expect(parsed).not.toBeNull()
    expect(parsed?.steps.length).toBe(3)
    expect(parsed?.steps[0].id).toBe('greeting')
  })

  it('both non-greeting steps are terminal (buttons: []), so the customer\'s next free-text message falls through to the AI booking tool', () => {
    const nonGreeting = SALON_STARTER_DEFINITION.steps.filter((s) => s.id !== 'greeting')
    expect(nonGreeting.every((s) => s.buttons.length === 0)).toBe(true)
  })
})
