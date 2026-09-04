import type { SupabaseClient } from '@supabase/supabase-js'

// Per-conversation ceiling on billed AI replies (security audit
// 2026-09-04: none of the five channels had any rate limit, and every
// inbound message costs the seller 5 ₸ plus a real Anthropic call.
// Telegram was the softest target -- bot usernames are public and
// searchable, so anyone could sit there draining a seller's wallet).
//
// Scoped per CONVERSATION rather than per agent on purpose: a flood comes
// from one thread, and capping the agent as a whole would let one abusive
// chat silence every other customer the seller has.
export const REPLIES_PER_CONVERSATION_PER_HOUR = 30

// Counts what actually costs money -- outbound AI replies already stored
// for this conversation in the last hour. Fails OPEN on a query error:
// the wallet balance is still a hard backstop underneath (the agent stops
// entirely once it can't cover a reply), so a transient database hiccup
// must not silence a real customer conversation.
export async function isConversationRateLimited(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await supabase
    .from('ai_agent_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .gte('created_at', since)
  if (error) {
    console.error('ai-agent rate limit: count failed for conversation', conversationId, ':', error.message)
    return false
  }
  return (count ?? 0) >= REPLIES_PER_CONVERSATION_PER_HOUR
}
