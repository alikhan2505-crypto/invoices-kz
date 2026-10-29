import { isValidBinIin } from '@/lib/kzIdentifiers'
import type { NameLookupRole, NameLookupTool } from '@/lib/toolQuota'
import { parseNameLookupResponse, type NameLookupStatus } from './nameLookup'

// Автоподстановка названия по БИН/ИИН в бесплатных документах /tools (schet,
// avr, kp, nakladnaya): название ложится в поле само, когда набрана 12-я цифра,
// без кнопки «Найти» (29.10.2026). Кнопка остаётся запасным ручным вариантом.
//
// Чистая логика без React, чтобы дебаунс, кэш и «не затирать введённое»
// проверялись тестами. Компонент BinNameField только связывает её с полем.
//
// Квоты. Сервер (/api/tools/name-lookup) сначала смотрит свой кэш (бесплатно),
// затем живой реестр: 3 раза на IP в квартал на КАЖДОЕ поле каждого инструмента.
// Автоподстановка ходит в тот же роут и тратит ровно то, что тратит кнопка, но
// бережнее:
//   - только по БИН с верной контрольной цифрой (опечатка не сжигает попытку);
//   - один запрос на уникальный БИН за жизнь страницы (кэш найдено/не найдено
//     общий для обоих полей и всех вызовов, параллельные запросы схлопываются);
//   - после печати названия руками автопоиск молчит: незачем платить попыткой
//     за то, что человек уже ввёл;
//   - поиск запускает только ЖИВОЙ ввод БИН в поле (change() зовут из обработчика
//     ввода). БИН, пришедший из черновика или запомненных реквизитов, поиск не
//     будит: иначе каждая перезагрузка страницы с БИН без названия (прошлый
//     поиск не нашёл) списывала бы слот живого реестра без действия человека.

export type LookupOutcome = { status: NameLookupStatus; name: string | null }
export type LookupArgs = { bin: string; tool: NameLookupTool; role: NameLookupRole }
export type LookupFn = (args: LookupArgs) => Promise<LookupOutcome>

/** Живой запрос в POST /api/tools/name-lookup; любой сбой сети — «недоступно». */
export const fetchNameLookup: LookupFn = async ({ bin, tool, role }) => {
  try {
    const res = await fetch('/api/tools/name-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bin, tool, role }),
    })
    return parseNameLookupResponse(res.ok, await res.json().catch(() => null))
  } catch {
    return { status: 'unavailable', name: null }
  }
}

export const onlyBinDigits = (s: unknown): string => String(s ?? '').replace(/\D/g, '').slice(0, 12)

/** Годится ли БИН/ИИН для автопоиска: 12 цифр и верная контрольная цифра. */
export const isLookupWorthy = (bin: string): boolean => bin.length === 12 && isValidBinIin(bin)

/**
 * Сессия поиска: кэш окончательных ответов (найдено / не найдено) по БИН и
 * схлопывание одновременных запросов. «Лимит» и «недоступно» не кэшируются,
 * чтобы ручная кнопка могла повторить попытку.
 */
export function createLookupSession(fn: LookupFn) {
  const cache = new Map<string, LookupOutcome>()
  const inflight = new Map<string, Promise<LookupOutcome>>()
  return {
    peek: (bin: string) => cache.get(bin) ?? null,
    lookup(args: LookupArgs): Promise<LookupOutcome> {
      const hit = cache.get(args.bin)
      if (hit) return Promise.resolve(hit)
      const pending = inflight.get(args.bin)
      if (pending) return pending
      const p = fn(args).then(outcome => {
        if (outcome.status === 'found' || outcome.status === 'miss') cache.set(args.bin, outcome)
        return outcome
      }).finally(() => { inflight.delete(args.bin) })
      inflight.set(args.bin, p)
      return p
    },
  }
}
export type LookupSession = ReturnType<typeof createLookupSession>

// Одна сессия на страницу (модуль живёт, пока открыта вкладка).
let shared: LookupSession | null = null
export function sharedLookupSession(): LookupSession {
  return (shared ??= createLookupSession(fetchNameLookup))
}

/**
 * Статус поля автопоиска: обычные статусы кнопки плюс «похоже на опечатку» и
 * «название осталось прежним» (БИН поправили, а название не наше или от другого БИН).
 */
export type AutoStatus = NameLookupStatus | 'invalid' | 'stale'

export interface AutoLookupHost {
  tool: NameLookupTool
  role: NameLookupRole
  /** Что сейчас стоит в поле названия (читается в момент решения, не раньше). */
  getName: () => string
  onStatus: (s: AutoStatus) => void
  /** Положить название в поле. Вызывается только если поле пустое или хранит прошлую подстановку. */
  onName: (name: string) => void
  /** Автоподстановка реально положила название (для аналитики). */
  onAutofilled?: () => void
  /**
   * Искать ли название при наборе (по умолчанию да). false: только по кнопке; набор БИН
   * лишь проверяет контрольную цифру и показывает подсказку «название осталось прежним»,
   * сеть не трогает (решение основателя 29.10.2026 для бесплатных инструментов).
   */
  autoSearch?: boolean
}

export interface AutoLookup {
  /** Вызывать при каждом ЖИВОМ вводе БИН (не при подстановке из черновика). Правка других полей сюда не попадает. */
  change: (bin: string) => void
  /**
   * БИН пришёл не с клавиатуры (черновик, запомненные реквизиты, сброс): стоящее
   * рядом название считаем принадлежащим этому БИН, подсказку «не обновилось» для него не показываем.
   */
  adopt: (bin: string) => void
  /** Название, положенное поиском (кнопкой или авто): его можно заменить следующим поиском. */
  markFilled: (name: string, bin?: string) => void
  dispose: () => void
}

export const AUTO_DEBOUNCE_MS = 450

/**
 * Решение основателя 29.10.2026 (вопрос 28): в бесплатных инструментах /tools/* название по
 * БИН подставляется ТОЛЬКО по кнопке «Найти» (живой реестр тратит квартальный лимит IP).
 * Подстановка при наборе остаётся для остальных версий (кабинет: /create использует свой
 * поиск useBinLookup). Автопоиск написан и покрыт тестами: чтобы включить его для платных
 * пользователей этих форм, достаточно передать true здесь (или завести проверку тарифа).
 */
export const AUTO_NAME_LOOKUP_ENABLED = false

export function createAutoLookup(
  session: LookupSession,
  host: AutoLookupHost,
  debounceMs: number = AUTO_DEBOUNCE_MS,
): AutoLookup {
  let timer: ReturnType<typeof setTimeout> | null = null
  let seq = 0
  let filled: string | null = null
  // БИН, которому, как мы знаем, принадлежит название в поле (подстановка или черновик).
  let owner: string | null = null
  const attempted = new Set<string>()

  // Название можно писать, если оно пустое или это прошлая подстановка поиска
  // (исправили БИН, прежнее название уже не про эту компанию).
  const writable = () => {
    const cur = host.getName().trim()
    return cur === '' || (filled !== null && cur === filled)
  }
  const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }

  const run = async (bin: string, mySeq: number) => {
    if (!writable()) { host.onStatus('idle'); return }
    attempted.add(bin)
    host.onStatus('loading')
    const outcome = await session.lookup({ bin, tool: host.tool, role: host.role })
    if (mySeq !== seq) return // БИН уже другой — ответ устарел
    if (outcome.name && writable()) {
      filled = outcome.name
      owner = bin
      host.onName(outcome.name)
      host.onStatus('found')
      host.onAutofilled?.()
    } else if (outcome.name) {
      host.onStatus('idle') // пока ждали, человек напечатал своё название
    } else {
      host.onStatus(outcome.status)
    }
  }

  return {
    change(bin) {
      seq++
      clearTimer()
      if (bin.length !== 12) { host.onStatus('idle'); return }
      if (!isLookupWorthy(bin)) { host.onStatus('invalid'); return }
      // Только кнопка: без сети; если в поле уже стоит название от другого БИН, предупреждаем.
      if (host.autoSearch === false) {
        host.onStatus(host.getName().trim() !== '' && bin !== owner ? 'stale' : 'idle')
        return
      }
      // Название уже стоит (руками, из черновика, из запомненного) и это не наша подстановка:
      // не трогаем и не тратим запрос, но говорим, что оно не обновлялось (БИН другой).
      if (!writable()) { host.onStatus(bin === owner ? 'idle' : 'stale'); return }
      const mySeq = seq
      // Ответ по этому БИН уже есть в кэше сессии (вернулись к прежним цифрам):
      // кладём сразу, без ожидания и без сети.
      if (session.peek(bin)) { void run(bin, mySeq); return }
      // Спрашивали, но ответа нет (лимит, сеть): сам не повторяем, есть кнопка.
      if (attempted.has(bin)) { host.onStatus('idle'); return }
      host.onStatus('idle')
      timer = setTimeout(() => { timer = null; void run(bin, mySeq) }, debounceMs)
    },
    adopt(bin) { seq++; clearTimer(); owner = bin.length === 12 ? bin : null },
    markFilled(name, bin) { filled = name; if (bin) owner = bin },
    dispose() { seq++; clearTimer() },
  }
}
