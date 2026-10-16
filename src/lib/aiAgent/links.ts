import { productAbsoluteUrl } from '@/lib/crossProduct'

// Ссылки в кабинет AI-агента для Telegram-уведомлений владельцу. Всегда на
// agent.invoices.kz: раньше вели на https://www.invoices.kz/ai-agent/...,
// то есть лишний редирект www→apex и в итоге не тот поддомен.
export const AI_AGENT_DIALOGS_URL = productAbsoluteUrl('aiAgent', '/ai-agent/dialogs')
export const AI_AGENT_REVIEW_URL = productAbsoluteUrl('aiAgent', '/ai-agent/review')

export function aiAgentUrl(path: string): string {
  return productAbsoluteUrl('aiAgent', path)
}
