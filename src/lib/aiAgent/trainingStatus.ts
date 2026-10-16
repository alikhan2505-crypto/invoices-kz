export interface TrainingState {
  status: 'training' | 'active' | 'paused'
  trainingStartedAt: string
  trainingMessageCount: number
}

export const TRAINING_DAYS_THRESHOLD = 7
export const TRAINING_MESSAGE_THRESHOLD = 20

// Whichever comes first flips training -> active, per the design spec
// (docs/superpowers/specs/2026-08-15-ai-agent-design.md). Only ever true
// when currently 'training' -- an 'active' or manually 'paused' agent is
// untouched by this check.
export function shouldExitTraining(state: TrainingState, now: Date): boolean {
  if (state.status !== 'training') return false
  const daysElapsed = (now.getTime() - new Date(state.trainingStartedAt).getTime()) / (1000 * 60 * 60 * 24)
  return daysElapsed >= TRAINING_DAYS_THRESHOLD || state.trainingMessageCount >= TRAINING_MESSAGE_THRESHOLD
}

// Счётчик обучения после решения владельца по черновику в очереди проверки.
// Засчитывается только «Отправить»: «Пропустить» значит, что ответ агента не
// подошёл, и 20 пропусков подряд не должны выпускать агента отвечать самому
// (до 15.10.2026 пропуск тоже прибавлял единицу).
export function trainingCountAfterReview(action: 'send' | 'skip', currentCount: number): number {
  const count = Number.isFinite(currentCount) && currentCount > 0 ? currentCount : 0
  return action === 'send' ? count + 1 : count
}

// Строка ai_agents в том виде, в каком её отдаёт select('*').
export interface TrainingAgentRow {
  status: string | null
  training_started_at: string | null
  training_message_count: number | null
}

const DAY_MS = 1000 * 60 * 60 * 24

// Решение «пора выходить из обучения» для строки агента из базы.
//
// Срок в днях считается от ПЕРВОГО ЧЕРНОВИКА, ушедшего на проверку
// (firstDraftAt), а не от создания агента (16.10.2026). Раньше агент без
// подключённого канала и без единого одобрения через неделю после создания
// молча переключался на самостоятельные ответы при первом же сообщении
// клиента -- владелец ни одного его ответа так и не видел. Нет черновиков --
// срок по дням не наступает вообще; порог по одобрениям работает как прежде.
export function agentRowShouldExitTraining(agent: TrainingAgentRow, now: Date, firstDraftAt: string | null): boolean {
  if (agent.status !== 'training') return false
  const count = agent.training_message_count ?? 0
  if (count >= TRAINING_MESSAGE_THRESHOLD) return true
  if (!firstDraftAt) return false
  return shouldExitTraining({ status: 'training', trainingStartedAt: firstDraftAt, trainingMessageCount: count }, now)
}

// Сколько дней осталось до выхода по сроку -- для баннера в настройках.
// null: черновиков ещё не было, отсчёт не начался.
export function trainingDaysLeft(firstDraftAt: string | null, now: Date): number | null {
  if (!firstDraftAt) return null
  const started = new Date(firstDraftAt).getTime()
  if (!Number.isFinite(started)) return null
  return Math.max(0, Math.ceil(TRAINING_DAYS_THRESHOLD - (now.getTime() - started) / DAY_MS))
}

// Может ли срок по дням вообще уже наступить. Первый черновик не бывает
// раньше создания агента, поэтому пока с training_started_at не прошло
// TRAINING_DAYS_THRESHOLD дней, искать первый черновик в базе незачем.
export function trainingDayClockMayHaveRun(agent: TrainingAgentRow, now: Date): boolean {
  if (!agent.training_started_at) return true
  const started = new Date(agent.training_started_at).getTime()
  if (!Number.isFinite(started)) return true
  return (now.getTime() - started) / DAY_MS >= TRAINING_DAYS_THRESHOLD
}
