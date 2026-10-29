// Боевая реализация ReminderStore (dmReminder.ts) поверх Supabase service-role.
// Все ошибки чтения трактуются в сторону «молчать»: лишнее напоминание хуже пропущенного.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  REMINDER_AFTER_MS, REMINDER_DAILY_LIMIT, REMINDER_STUCK_AFTER_MS, REMINDER_TABLE, REMINDER_WINDOW_MAX_MS,
  latestInboundAt, reminderConfigFromRows,
  type ReminderConfig, type ReminderConversation, type ReminderRow, type ReminderStore,
} from './dmReminder'
import { SPECIAL_TRIGGERS, type TemplateRow } from './instagramSpecialTemplates'

export function createReminderStore(db: SupabaseClient): ReminderStore {
  const table = () => db.from(REMINDER_TABLE)
  return {
    async expireStale(nowIso) {
      const now = Date.parse(nowIso)
      // Окно закрыто: последнее входящее старше 22 часов.
      await table().update({ status: 'skipped', reason: 'expired' })
        .eq('status', 'pending').lt('last_inbound_at', new Date(now - REMINDER_WINDOW_MAX_MS).toISOString())
      // Ответ так и не ушёл (строка осталась 'prepared'): напоминать не о чем.
      await table().update({ status: 'skipped', reason: 'unconfirmed' })
        .eq('status', 'prepared').lt('created_at', new Date(now - 24 * 3600_000).toISOString())
    },

    async reapStuck(nowIso) {
      const { data, error } = await table().update({ status: 'failed', reason: 'interrupted' })
        .eq('status', 'sending').lt('claimed_at', new Date(Date.parse(nowIso) - REMINDER_STUCK_AFTER_MS).toISOString()).select('id')
      return error || !data ? 0 : data.length
    },

    async loadAgentConfigs() {
      const { data, error } = await db.from('ai_agent_reply_templates')
        .select('id, agent_id, trigger_words, reply_text, channel')
        .contains('trigger_words', [SPECIAL_TRIGGERS.reminder])
        .or('channel.is.null,channel.eq.dm')
      const out = new Map<string, ReminderConfig>()
      if (error || !data) return out
      const byAgent = new Map<string, TemplateRow[]>()
      for (const r of data as (TemplateRow & { agent_id: string })[]) {
        byAgent.set(r.agent_id, [...(byAgent.get(r.agent_id) ?? []), r])
      }
      for (const [agentId, rows] of byAgent) {
        const cfg = reminderConfigFromRows(rows)
        if (cfg.enabled) out.set(agentId, cfg)
      }
      return out
    },

    async listDue(nowIso, limit, agentIds) {
      if (agentIds.length === 0) return []
      const now = Date.parse(nowIso)
      const { data, error } = await table()
        .select('id, agent_id, conversation_id, token, link_sent_at, last_inbound_at')
        .eq('status', 'pending')
        .in('agent_id', agentIds)
        .lte('link_sent_at', new Date(now - REMINDER_AFTER_MS).toISOString())
        .gt('last_inbound_at', new Date(now - REMINDER_WINDOW_MAX_MS).toISOString())
        .order('link_sent_at', { ascending: true })
        .limit(limit)
      if (error || !data) return []
      return data as ReminderRow[]
    },

    async conversation(id) {
      const { data } = await db.from('ai_agent_conversations')
        .select('external_thread_id, channel, source, paused_for_human').eq('id', id).maybeSingle()
      return (data as ReminderConversation | null) ?? null
    },

    latestInboundAt: conversationId => latestInboundAt(db, conversationId),

    async hasVisit(token) {
      const { data, error } = await db.from('tool_events').select('id').eq('utm_content', token).limit(1)
      if (error) return true
      return !!data && data.length > 0
    },

    async markSkipped(id, reason) {
      await table().update({ status: 'skipped', reason }).eq('id', id).eq('status', 'pending')
    },

    async countClaimsSince(agentId, sinceIso) {
      const { count, error } = await table().select('id', { count: 'exact', head: true })
        .eq('agent_id', agentId).gte('claimed_at', sinceIso)
      return error ? REMINDER_DAILY_LIMIT : (count ?? 0)
    },

    async claim(id, nowIso) {
      const { data, error } = await table().update({ status: 'sending', claimed_at: nowIso })
        .eq('id', id).eq('status', 'pending').select('id')
      return !error && !!data && data.length === 1
    },

    async markSent(id, nowIso) {
      await table().update({ status: 'sent', sent_at: nowIso }).eq('id', id)
    },

    async markFailed(id, reason) {
      await table().update({ status: 'failed', reason }).eq('id', id)
    },

    async logOutbound(conversationId, text) {
      await db.from('ai_agent_messages').insert({
        conversation_id: conversationId, direction: 'outbound', text, is_ai_generated: false, status: 'sent',
      })
    },
  }
}
