import type { SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import { notifyOwnerTelegram } from '@/lib/notificationPrefsServer'
import { escapeHtml } from '@/lib/htmlEscape'
import { aiAgentUrl } from './links'
import { buildAgentSettingsHref } from './settingsLink'

// Пустой кошелёк молча подменял ответы ИИ заготовкой «Спасибо за сообщение!
// Мы скоро ответим вам лично.» (wallet.ts) -- клиенты получали её, а владелец
// узнавал об этом, только случайно открыв баланс. Теперь при подмене владельцу
// уходит колокольчик и (если подключён) Telegram -- не чаще раза в сутки на
// агента. Ответы клиентам при этом идут как прежде.
//
// Агент на обучении: клиент не получает ничего (ответ ждёт проверки), а в
// очереди лежит та же заготовка вместо ответа ИИ -- для этого случая свой
// текст, «клиенты получают заготовку» там было бы неправдой.
//
// Отметка «уже предупредили» -- сама запись в app_notifications (заголовок +
// ссылка на этого агента за последние сутки), без новой колонки и миграции.
// Telegram уходит только если эта запись реально вставилась: иначе при
// сбое вставки отметки нет, и Telegram слался бы на каждое сообщение
// клиента. Две одновременные подмены в первую секунду могут дать два
// уведомления -- это допустимо; потерять предупреждение было бы хуже.
//
// Ответ клиенту предупреждение не задерживает: scheduleBudgetDepletedAlert
// откладывает его на after() (после ответа маршрута), а Telegram ограничен
// таймаутом.

export const BUDGET_ALERT_TITLE = 'Кошелёк пуст — ИИ-агент отвечает заготовкой'
export const BUDGET_ALERT_TITLE_TRAINING = 'Кошелёк пуст — в очереди проверки заготовка вместо ответа ИИ'
export const BUDGET_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000
export const BUDGET_ALERT_TELEGRAM_TIMEOUT_MS = 5000

export function budgetAlertLink(agentId: string): string {
  return buildAgentSettingsHref(agentId, [], 'control')
}

// Чистое решение «пора ли предупреждать»: последнее предупреждение по этому
// агенту старше суток или его не было.
export function shouldSendBudgetAlert(lastSentAt: string | null, now: Date): boolean {
  if (!lastSentAt) return true
  const last = new Date(lastSentAt).getTime()
  if (!Number.isFinite(last)) return true
  return now.getTime() - last >= BUDGET_ALERT_INTERVAL_MS
}

export type BudgetAlertAgent = { id: string; user_id: string; name?: string | null; status?: string | null }

// Тексты предупреждения: колокольчик (title/body) и Telegram.
export function budgetAlertTexts(agent: BudgetAlertAgent, telegramLink: string): { title: string; body: string; telegram: string } {
  const agentName = (agent.name || '').trim() || 'ИИ-агент'
  if (agent.status === 'training') {
    return {
      title: BUDGET_ALERT_TITLE_TRAINING,
      body: `«${agentName}» на обучении: клиенты пока ничего не получают, а в очереди проверки вместо ответа ИИ лежит заготовка «Спасибо за сообщение! Мы скоро ответим вам лично.» — на балансе меньше 5 ₸. Пополните кошелёк, чтобы агент снова писал черновики сам.`,
      telegram: `Кошелёк пуст: агент «${escapeHtml(agentName)}» на обучении, и в очереди проверки вместо ответа ИИ — заготовка. Клиенты пока ничего не получают. Пополните баланс: ${escapeHtml(telegramLink)}`,
    }
  }
  return {
    title: BUDGET_ALERT_TITLE,
    body: `«${agentName}»: на балансе меньше 5 ₸, поэтому вместо ответов ИИ клиенты получают «Спасибо за сообщение! Мы скоро ответим вам лично.» Пополните кошелёк — ответы ИИ возобновятся сами.`,
    telegram: `Кошелёк пуст: агент «${escapeHtml(agentName)}» отвечает клиентам заготовкой вместо ИИ. Пополните баланс: ${escapeHtml(telegramLink)}`,
  }
}

// Best-effort: никогда не бросает.
export async function notifyOwnerBudgetDepleted(
  supabase: SupabaseClient,
  agent: BudgetAlertAgent,
  now: Date = new Date(),
): Promise<void> {
  try {
    const link = budgetAlertLink(agent.id)
    const since = new Date(now.getTime() - BUDGET_ALERT_INTERVAL_MS).toISOString()
    const { data: recent, error: recentError } = await supabase
      .from('app_notifications')
      .select('created_at')
      .eq('user_id', agent.user_id)
      .in('title', [BUDGET_ALERT_TITLE, BUDGET_ALERT_TITLE_TRAINING])
      .eq('link', link)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
    if (recentError) {
      // Не знаем, предупреждали ли уже -- лучше промолчать, чем слать на
      // каждое сообщение клиента.
      console.error('ai-agent: budget alert dedupe lookup failed for agent', agent.id, ':', recentError.message)
      return
    }
    if (!shouldSendBudgetAlert(recent?.[0]?.created_at ?? null, now)) return

    const texts = budgetAlertTexts(agent, aiAgentUrl(link))
    const { error: insertError } = await supabase
      .from('app_notifications')
      .insert({ user_id: agent.user_id, title: texts.title, body: texts.body, link })
    if (insertError) {
      console.error('ai-agent: budget alert notification insert failed for agent', agent.id, ':', insertError.message)
      return
    }

    // parse_mode HTML: имя агента и «&» в адресе экранированы в budgetAlertTexts.
    // Telegram — по настройке события «Кошелёк агента пуст» (notification_prefs).
    await notifyOwnerTelegram(supabase, agent.user_id, 'ai_wallet_empty', texts.telegram, { timeoutMs: BUDGET_ALERT_TELEGRAM_TIMEOUT_MS })
  } catch (err: any) {
    console.error('ai-agent: budget-depleted owner alert failed for agent', agent.id, ':', err?.message || err)
  }
}

// Точка вызова из обработчиков входящих: не ждёт предупреждения. В запросе
// Next.js -- after() (функция доживёт до конца работы), вне его (тесты,
// скрипты) -- обычный фоновый промис.
export function scheduleBudgetDepletedAlert(supabase: SupabaseClient, agent: BudgetAlertAgent): void {
  // Снимок полей: обработчик может поменять agent.status позже в запросе.
  const snapshot: BudgetAlertAgent = { id: agent.id, user_id: agent.user_id, name: agent.name, status: agent.status }
  const run = () => notifyOwnerBudgetDepleted(supabase, snapshot).catch(() => {})
  try {
    after(run)
  } catch {
    void run()
  }
}
