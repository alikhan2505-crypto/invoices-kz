import type { SupabaseClient } from '@supabase/supabase-js'
import type { FlowDefinition } from './flow'

// A pre-built "Сценарий" (flow, see flow.ts/flowEngine.ts) for a
// newly-linked salon agent -- founder's own framing 18.09.2026: "будем
// потихоньку добавлять агентов и учить делать то что надо всем салонам
// красоты", meant as a reusable, refinable starting point, fully editable
// afterward through the existing FlowBuilder UI (src/components/aiAgent/
// FlowBuilder.tsx) like any other flow -- this just seeds it instead of
// leaving a new salon agent with an empty scenario list.
//
// Deliberately just a greeting menu, not an attempt to capture the
// booking itself: flows can only send canned text and branch on button
// clicks (see flow.ts) -- there is no free-text capture step, so the
// actual service/date/time can only ever be gathered on the freeform-LLM
// side (bookingTool in instagramAiReply.ts). Both terminal steps below
// end with buttons: [] specifically so the customer's next message (free
// text) falls straight through to that path, per the normal flow-exit
// behavior already documented in flowEngine.ts.
// Exported for its own colocated test (round-tripped through
// parseFlowDefinition's real runtime rules there), same exception this
// codebase already makes for other pure-data/pure-logic pieces of an
// otherwise network/DB-calling module (see parseExtractedFieldsBlock's
// own comment in instagramAiReply.ts).
export const SALON_STARTER_DEFINITION: FlowDefinition = {
  steps: [
    {
      id: 'greeting',
      text: 'Здравствуйте! Хотите записаться на услугу?',
      buttons: [
        { label: 'Да, хочу записаться', nextStepId: 'ask_details' },
        { label: 'Сначала узнать цены', nextStepId: 'prices' },
      ],
    },
    {
      id: 'ask_details',
      text: 'Отлично! Напишите, пожалуйста, на какую услугу и на какие дату и время вам удобно — я подберу для вас время.',
      buttons: [],
    },
    {
      id: 'prices',
      text: 'Напишите, какая услуга вас интересует — расскажу подробнее о цене и длительности.',
      buttons: [],
    },
  ],
}

// Idempotent: only inserts when the agent has no is_start flow yet (the
// DB's own unique index, ai_agent_flows_one_start_per_agent, is the real
// guarantee against a duplicate -- this check just avoids a noisy insert
// error on the common case of calling this again for an already-set-up
// agent). Never throws -- a failed seed must not block linking an agent
// to a salon; the owner can always add a scenario by hand afterward.
export async function ensureSalonStarterFlow(supabase: SupabaseClient, agentId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('ai_agent_flows')
      .select('id')
      .eq('agent_id', agentId)
      .eq('is_start', true)
      .maybeSingle()
    if (existing) return

    const { error } = await supabase.from('ai_agent_flows').insert({
      agent_id: agentId,
      name: 'Запись на услугу',
      trigger_words: ['запись', 'записаться', 'бронь', 'забронировать'],
      is_start: true,
      definition: SALON_STARTER_DEFINITION,
    })
    if (error) console.error('ensureSalonStarterFlow: insert failed:', error.message)
  } catch (err: any) {
    console.error('ensureSalonStarterFlow failed (non-fatal):', err?.message || err)
  }
}
