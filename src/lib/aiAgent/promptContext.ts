export type AgentTone = 'friendly' | 'professional' | 'energetic' | 'caring'
export type AgentGoal = 'answer_questions' | 'qualify_lead'

export interface BusinessContext {
  name: string
  tone: AgentTone
  description: string
  goal: AgentGoal
}

const TONE_LABELS: Record<AgentTone, string> = {
  friendly: 'дружелюбный и тёплый',
  professional: 'профессиональный и деловой',
  energetic: 'мотивирующий и энергичный',
  caring: 'заботливый и внимательный',
}

const GOAL_LABELS: Record<AgentGoal, string> = {
  answer_questions: 'отвечать на вопросы клиентов',
  qualify_lead: 'квалифицировать заявку клиента -- понять, что ему нужно, и собрать контактные данные',
}

// Builds the one-sentence business-context line generateAiReply interpolates
// into its prompt (see instagramAiReply.ts's new businessContextLine param,
// Task 2). Only the multi-tenant webhook path (Task 8) calls this -- the
// existing single-tenant invoices.kz bot passes its own unchanged literal
// string straight to generateAiReply instead, so this function changing
// never affects it.
export function buildBusinessContextLine(ctx: BusinessContext): string {
  const desc = ctx.description.trim()
  return `Ты отвечаешь от имени бизнес-аккаунта в Instagram (${ctx.name}${desc ? ' — ' + desc : ''}). Твой стиль общения: ${TONE_LABELS[ctx.tone]}. Твоя основная задача: ${GOAL_LABELS[ctx.goal]}.`
}
