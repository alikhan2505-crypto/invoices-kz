// Мастер «сначала канал» /ai-agent/setup (16.10.2026) -- чистая логика шагов,
// без сети и env: годится и для клиентской страницы, и для маршрутов API.
//
// Шаги: 0 «Создать» → 1 «Канал» → 2 «О бизнесе» → 3 «Проверка» → 4 «Запуск».
// Агент-черновик создаётся выключенным (is_enabled = false, launched_at =
// null) и клиентам не отвечает, пока владелец не нажмёт «Запустить»: все
// обработчики входящих молчат при is_enabled = false.

// Решение основателя 4: мастер сначала только для админов, до его личной
// проверки. Одна константа и для страницы, и для маршрутов API -- открыть
// мастер всем Про = поменять её здесь.
export const SETUP_WIZARD_ADMIN_ONLY = true

export function canUseSetupWizard(isAdmin: boolean): boolean {
  return SETUP_WIZARD_ADMIN_ONLY ? isAdmin : true
}

export const SETUP_STEPS = [0, 1, 2, 3, 4] as const
export type SetupStep = typeof SETUP_STEPS[number]

// Описание бизнеса считается достаточным с 80 символов (без пробелов по
// краям) -- или если подключён Kaspi Bot: тогда товары и цены агент берёт
// из каталога магазина.
export const MIN_BUSINESS_DESCRIPTION_CHARS = 80

export function businessStepComplete(description: string, hasKaspiShop: boolean): boolean {
  return hasKaspiShop || description.trim().length >= MIN_BUSINESS_DESCRIPTION_CHARS
}

export type SetupConnection = { channel: string; status: string }

// Канал засчитывается, только если он реально работает. Чат для сайта
// подключается за секунду и считается каналом (решение 2); API -- тоже канал,
// хоть в мастере его и нет (подключают в настройках).
export function hasWorkingChannel(connections: SetupConnection[]): boolean {
  return connections.some(c => c.status === 'active')
}

// «Запустить» неактивна без канала (решение 2).
export function canLaunch(connections: SetupConnection[]): boolean {
  return hasWorkingChannel(connections)
}

// С какого шага продолжить настройку агента-черновика: сначала то, без чего
// нельзя запуститься (канал), потом знания, потом сразу запуск. Проверку
// (шаг 3) можно пройти и потом -- запуск она не блокирует.
export function resumeStep(params: { connections: SetupConnection[]; description: string; hasKaspiShop: boolean }): SetupStep {
  if (!hasWorkingChannel(params.connections)) return 1
  if (!businessStepComplete(params.description, params.hasKaspiShop)) return 2
  return 4
}

// ?step= из адреса: только 1..4 (0 -- это экран без агента), иначе null.
export function parseStepParam(raw: string | null | undefined): SetupStep | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 4) return null
  return n as SetupStep
}

// Можно ли уйти со шага вперёд. Канал шаг 1 НЕ требует: «Подключу позже --
// сначала проверю в тестовом чате» ведёт дальше, а без канала просто не
// загорится «Запустить».
export function canGoNext(step: SetupStep, state: { description: string; hasKaspiShop: boolean; name: string }): boolean {
  if (step === 2) return state.name.trim().length > 0 && businessStepComplete(state.description, state.hasKaspiShop)
  return step < 4
}

export type LaunchMode = 'active' | 'training'

// Режим после запуска: по умолчанию «Отвечать клиентам сразу» (решение 1).
export const DEFAULT_LAUNCH_MODE: LaunchMode = 'active'

export function parseLaunchMode(raw: unknown): LaunchMode | null {
  return raw === 'active' || raw === 'training' ? raw : null
}

// Агент-черновик: колонка launched_at есть и пуста -- И агент не работает уже
// сейчас. Включённый агент с рабочим каналом клиентам отвечает, значит, он
// запущен, даже если launched_at пуст (старый агент, получивший канал через
// настройки до A4 или до миграции): иначе у него висел бы ложный «Черновик»,
// а «Запустить» в мастере перевело бы «обучение» в «сразу». До миграции
// колонки нет вовсе -- тогда черновиков не бывает, всё ведёт себя как раньше.
export function isDraftAgent(row: Record<string, unknown> | null | undefined, connections: SetupConnection[] = []): boolean {
  if (!row || !Object.prototype.hasOwnProperty.call(row, 'launched_at')) return false
  if (row.launched_at !== null && row.launched_at !== undefined) return false
  const live = row.is_enabled !== false && hasWorkingChannel(connections)
  return !live
}

// Дальше какого шага можно попасть по ?step= из адреса или кнопкой «Назад»
// браузера (B10): шаги 3 и 4 -- только с сохранённым названием и описанием
// от 80 символов (или Kaspi Bot), как кнопка «Дальше» на шаге 2. Канал не
// требуется: «Подключу позже» законно ведёт дальше без него.
export function maxReachableStep(saved: { name: string; description: string; hasKaspiShop: boolean }): SetupStep {
  return canGoNext(2, saved) ? 4 : 2
}

// Шаг из адреса, прижатый к допустимому: не дальше maxAllowed, назад -- куда
// угодно (1..maxAllowed). Без ?step= -- fallback (обычно resumeStep).
export function clampStep(requested: SetupStep | null, maxAllowed: SetupStep, fallback: SetupStep): SetupStep {
  const wanted = requested ?? fallback
  return (wanted > maxAllowed ? maxAllowed : wanted) as SetupStep
}

// Серверная проверка «Запустить» (B10): без 80 символов описания и без Kaspi
// Bot запуск отклоняется, как и в мастере.
export function launchKnowledgeOk(description: string | null | undefined, hasKaspiShop: boolean): boolean {
  return businessStepComplete(description || '', hasKaspiShop)
}

// Ответ в режиме «Сначала показывать ответы мне» ждёт владельца в очереди.
// Чат для сайта -- исключение (решение 1): посетитель ждёт ответа прямо
// сейчас, и черновик, одобренный через час, не прочтёт уже никто.
export function shouldQueueForReview(channel: string, status: string | null | undefined): boolean {
  if (channel === 'website') return false
  return status === 'training'
}

// PostgREST об отсутствующей колонке: PGRST204 при записи («Could not find
// the 'x' column ... in the schema cache»), 42703 при чтении («column x does
// not exist»). Нужен, чтобы код работал и до применения миграции.
export function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string): boolean {
  if (!error) return false
  const msg = String(error.message || '')
  if (error.code === 'PGRST204' || error.code === '42703') return msg.includes(column)
  return msg.includes(column) && /does not exist|could not find/i.test(msg)
}
