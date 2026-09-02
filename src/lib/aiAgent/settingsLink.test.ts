import { describe, it, expect } from 'vitest'
import { buildAgentSettingsHref } from './settingsLink'

describe('buildAgentSettingsHref', () => {
  const agentA = { id: 'agent-a' }
  const agentB = { id: 'agent-b' }

  it('uses the explicitly selected agent when one is given', () => {
    expect(buildAgentSettingsHref('agent-a', [agentA, agentB])).toBe('/ai-agent/settings?agent=agent-a')
  })

  it('falls back to the only agent when selection is "all" and exactly one agent exists', () => {
    expect(buildAgentSettingsHref('all', [agentA])).toBe('/ai-agent/settings?agent=agent-a')
  })

  it('refuses to guess and points at the agent list when "all" is selected with 2+ agents', () => {
    expect(buildAgentSettingsHref('all', [agentA, agentB])).toBe('/ai-agent')
  })

  it('points at the agent list when there are no agents at all', () => {
    expect(buildAgentSettingsHref('all', [])).toBe('/ai-agent')
  })

  it('appends a tab param when given', () => {
    expect(buildAgentSettingsHref('agent-a', [agentA], 'channels')).toBe('/ai-agent/settings?agent=agent-a&tab=channels')
  })

  it('treats an empty selection the same as "all"', () => {
    expect(buildAgentSettingsHref('', [agentA])).toBe('/ai-agent/settings?agent=agent-a')
  })
})
