// Серверная обработка сообщения в бот уведомлений для CFO. Вызывается вебхуком
// только для чата, уже привязанного к профилю (telegram_chat_id), — поэтому
// пишем строго в кабинет этого профиля, service-role клиентом с явным user_id.
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadWorkspace } from './data'
import { almatyToday } from './digest'
import { toDbAmount } from './money'
import { checkParsed, confirmation, extractJson, parsePrompt, TELEGRAM_MARK, UNDO_WORDS } from './telegramInput'
import { validateOperation } from './validate'

const UNDO_WINDOW_MS = 60 * 60 * 1000

// null — у профиля нет кабинета CFO: вебхук ответит своим обычным текстом.
export async function handleCfoMessage(db: SupabaseClient, userId: string, text: string): Promise<string | null> {
  const { data: company } = await db.from('cfo_companies').select('id').eq('user_id', userId).maybeSingle()
  if (!company) return null
  const today = almatyToday()

  if (UNDO_WORDS.includes(text.trim().toLowerCase())) {
    const { data: last } = await db.from('cfo_operations').select('id, created_at')
      .eq('user_id', userId).like('comment', `${TELEGRAM_MARK}%`)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!last || Date.now() - new Date(last.created_at).getTime() > UNDO_WINDOW_MS) return 'Отменять нечего: за последний час через Telegram операций не было.'
    const { error } = await db.from('cfo_operations').delete().eq('id', last.id).eq('user_id', userId)
    return error ? 'Не удалось отменить — удалите операцию в кабинете.' : '↩️ Последняя операция отменена.'
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return 'Ввод через Telegram временно недоступен.'
  const ws = await loadWorkspace(company.id, userId, db)
  const message = await new Anthropic({ apiKey }).messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: parsePrompt(ws, today, text) }],
  })
  const raw = message.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('')
  const parsed = extractJson(raw)
  if (!parsed || (parsed as { error?: unknown }).error) {
    return 'Это не похоже на операцию. Пример: «аренда 300 000», «пришло 450к от ТОО Ромашка», «такси 3500 вчера».'
  }
  const checked = checkParsed(parsed, ws, today, text)
  if (!checked.ok) return checked.error
  const d = checked.draft
  const problem = validateOperation(d, { accounts: ws.accounts, articles: ws.articles, today })
  if (problem) return `Не записал: ${problem}.`
  const { error } = await db.from('cfo_operations').insert({
    user_id: userId, company_id: company.id, direction: d.direction, amount: toDbAmount(d.amount), account_id: d.accountId,
    to_account_id: null, article_id: d.articleId, counterparty: d.counterparty, comment: d.comment,
    paid_on: d.paidOn, accrued_on: d.accruedOn, status: d.status,
  })
  if (error) {
    console.error('cfo telegram insert failed for', userId, ':', error.message)
    return 'Не удалось записать операцию — попробуйте ещё раз.'
  }
  return confirmation(ws, d, today)
}
