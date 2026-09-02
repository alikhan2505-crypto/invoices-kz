// Shared by any page that has its own agent-scoped context (Аналитика,
// Рассылки) and links into a specific agent's Настройки. 2026-09-02
// usability audit: two such links pointed at bare /ai-agent/settings with
// no id, which silently opened whichever agent /api/ai-agent/settings
// falls back to when none is given (the most recently created one) -- see
// docs/superpowers/specs/2026-09-02-ai-agent-multi-agent-nav-fix-design.md.
// Rule: use the caller's already-selected agent when there is one; if the
// page is showing an aggregate ("Все агенты") view, only guess when
// there's truly nothing to guess wrong (exactly one agent) -- otherwise
// send the caller to the agent list to pick one explicitly.
export function buildAgentSettingsHref(
  selectedAgentId: string,
  agents: { id: string }[],
  tab?: string
): string {
  const targetId = selectedAgentId && selectedAgentId !== 'all'
    ? selectedAgentId
    : agents.length === 1 ? agents[0].id : null
  if (!targetId) return '/ai-agent'
  const params = new URLSearchParams({ agent: targetId })
  if (tab) params.set('tab', tab)
  return `/ai-agent/settings?${params.toString()}`
}
