import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_DEBOUNCE_MS, AUTO_NAME_LOOKUP_ENABLED, createAutoLookup, createLookupSession, isLookupWorthy,
  type AutoStatus, type LookupArgs, type LookupOutcome,
} from './binAutofill'

// Настоящие БИН/ИИН с верной контрольной цифрой (kzIdentifiers.test.ts).
const BIN_A = '040340001997'
const BIN_B = '890525350143'
const BAD = '123456789012'

const found = (name: string): LookupOutcome => ({ status: 'found', name })

function setup(fn: (a: LookupArgs) => Promise<LookupOutcome>, initialName = '', autoSearch?: boolean) {
  const calls: LookupArgs[] = []
  const session = createLookupSession(a => { calls.push(a); return fn(a) })
  const state = { name: initialName, statuses: [] as AutoStatus[], autofilled: 0 }
  const ctl = createAutoLookup(session, {
    tool: 'schet', role: 'seller',
    getName: () => state.name,
    onStatus: s => state.statuses.push(s),
    onName: n => { state.name = n },
    onAutofilled: () => { state.autofilled++ },
    autoSearch,
  })
  return { calls, session, state, ctl }
}
const flush = async () => { await vi.advanceTimersByTimeAsync(AUTO_DEBOUNCE_MS + 5) }

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('isLookupWorthy', () => {
  it('needs 12 digits and a valid control digit', () => {
    expect(isLookupWorthy(BIN_A)).toBe(true)
    expect(isLookupWorthy(BAD)).toBe(false)
    expect(isLookupWorthy('04034000199')).toBe(false)
    expect(isLookupWorthy('')).toBe(false)
  })
})

describe('createLookupSession', () => {
  it('asks the server once per unique BIN (found and miss are cached)', async () => {
    const miss: LookupOutcome = { status: 'miss', name: null }
    const { calls, session } = setup(async a => (a.bin === BIN_A ? found('ТОО А') : miss))
    await session.lookup({ bin: BIN_A, tool: 'schet', role: 'seller' })
    await session.lookup({ bin: BIN_A, tool: 'schet', role: 'client' })
    await session.lookup({ bin: BIN_B, tool: 'schet', role: 'client' })
    await session.lookup({ bin: BIN_B, tool: 'schet', role: 'seller' })
    expect(calls.map(c => c.bin)).toEqual([BIN_A, BIN_B])
  })

  it('collapses concurrent requests for the same BIN', async () => {
    const { calls, session } = setup(async () => found('ТОО А'))
    const [a, b] = await Promise.all([
      session.lookup({ bin: BIN_A, tool: 'schet', role: 'seller' }),
      session.lookup({ bin: BIN_A, tool: 'schet', role: 'client' }),
    ])
    expect(calls).toHaveLength(1)
    expect(a).toEqual(b)
  })

  it('does not cache limit/unavailable, so the manual button can retry', async () => {
    let n = 0
    const { calls, session } = setup(async () => (n++ === 0 ? { status: 'limit', name: null } : found('ТОО А')))
    expect((await session.lookup({ bin: BIN_A, tool: 'schet', role: 'seller' })).status).toBe('limit')
    expect((await session.lookup({ bin: BIN_A, tool: 'schet', role: 'seller' })).status).toBe('found')
    expect(calls).toHaveLength(2)
  })
})

describe('auto lookup', () => {
  it('does nothing below 12 digits and resets the status', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО А'))
    ctl.change('04034000199')
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.statuses.at(-1)).toBe('idle')
  })

  it('waits for the debounce, then fills an empty name once', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО «Ромашка»'))
    ctl.change(BIN_A)
    await vi.advanceTimersByTimeAsync(AUTO_DEBOUNCE_MS - 50)
    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toHaveLength(1)
    expect(state.name).toBe('ТОО «Ромашка»')
    expect(state.statuses.at(-1)).toBe('found')
    expect(state.autofilled).toBe(1)
  })

  it('debounces: only the last of several quick changes is asked', async () => {
    const { calls, ctl } = setup(async () => found('ТОО Б'))
    ctl.change(BIN_A)
    await vi.advanceTimersByTimeAsync(100)
    ctl.change('04034000199') // стёрли цифру
    await vi.advanceTimersByTimeAsync(100)
    ctl.change(BIN_B)
    await flush()
    expect(calls.map(c => c.bin)).toEqual([BIN_B])
  })

  it('does not ask for a BIN with a wrong control digit and says so', async () => {
    const { calls, state, ctl } = setup(async () => found('X'))
    ctl.change(BAD)
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.statuses.at(-1)).toBe('invalid')
  })

  it('never overwrites a name the person typed (and does not spend a request)', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО Реестр'), 'ИП Иванов')
    ctl.change(BIN_A)
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.name).toBe('ИП Иванов')
    // БИН живьём набрали, название чужое для него: говорим, что оно не обновилось.
    expect(state.statuses.at(-1)).toBe('stale')
  })

  it('name that arrived with the BIN (draft/saved, adopt) is not reported as stale for that BIN, but is for another one', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО Реестр'), 'ТОО А из черновика')
    ctl.adopt(BIN_A) // БИН подставлен снаружи, поиск не запускается
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.statuses).toEqual([])
    ctl.change(BIN_A) // вернулись к тому же БИН: название его, подсказка не нужна
    await flush()
    expect(state.statuses.at(-1)).toBe('idle')
    ctl.change(BIN_B) // поправили на другой: название осталось, говорим об этом, запроса нет
    await flush()
    expect(state.statuses.at(-1)).toBe('stale')
    expect(calls).toHaveLength(0)
    expect(state.name).toBe('ТОО А из черновика')
  })

  it('adopt alone never starts a lookup (reload with a BIN and no name spends nothing)', async () => {
    const { calls, ctl } = setup(async () => found('ТОО А'), '')
    ctl.adopt(BIN_A)
    await flush()
    expect(calls).toHaveLength(0)
  })

  it('a short or mistyped BIN stays invalid/idle, never stale', async () => {
    const { state, ctl } = setup(async () => found('X'), 'ИП Иванов')
    ctl.change('0403')
    expect(state.statuses.at(-1)).toBe('idle')
    ctl.change(BAD)
    expect(state.statuses.at(-1)).toBe('invalid')
  })

  it('does not overwrite a name typed while the request was in flight', async () => {
    let release: (o: LookupOutcome) => void = () => {}
    const { state, ctl } = setup(() => new Promise<LookupOutcome>(r => { release = r }))
    ctl.change(BIN_A)
    await flush()
    state.name = 'ИП Иванов' // человек напечатал, пока ждали ответ
    release(found('ТОО Реестр'))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.name).toBe('ИП Иванов')
    expect(state.autofilled).toBe(0)
  })

  it('replaces its own earlier fill when the BIN is corrected', async () => {
    const { state, ctl } = setup(async a => found(a.bin === BIN_A ? 'ТОО А' : 'ТОО Б'))
    ctl.change(BIN_A)
    await flush()
    expect(state.name).toBe('ТОО А')
    ctl.change(BIN_B)
    await flush()
    expect(state.name).toBe('ТОО Б')
  })

  it('does not ask again for the same BIN when it is re-reported', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО А'))
    ctl.change(BIN_A)
    await flush()
    ctl.change(BIN_A)
    ctl.change(BIN_A)
    await flush()
    expect(calls).toHaveLength(1)
    expect(state.name).toBe('ТОО А')
  })

  it('returning to a BIN already answered refills from the session cache without the network', async () => {
    const { calls, state, ctl } = setup(async a => found(a.bin === BIN_A ? 'ТОО А' : 'ТОО Б'))
    ctl.change(BIN_A); await flush()
    ctl.change(BIN_B); await flush()
    ctl.change(BIN_A); await vi.advanceTimersByTimeAsync(0)
    expect(state.name).toBe('ТОО А')
    expect(calls.map(c => c.bin)).toEqual([BIN_A, BIN_B])
  })

  it('ignores a stale answer when the BIN changed meanwhile', async () => {
    const pending = new Map<string, (o: LookupOutcome) => void>()
    const { state, ctl } = setup(a => new Promise<LookupOutcome>(r => { pending.set(a.bin, r) }))
    ctl.change(BIN_A)
    await flush()
    ctl.change('04034000199')
    pending.get(BIN_A)!(found('ТОО А'))
    await vi.advanceTimersByTimeAsync(0)
    expect(state.name).toBe('')
  })

  it('shows limit like the button and does not retry by itself', async () => {
    const { calls, state, ctl } = setup(async () => ({ status: 'limit', name: null }))
    ctl.change(BIN_A)
    await flush()
    expect(state.statuses.at(-1)).toBe('limit')
    ctl.change(BIN_A)
    await flush()
    expect(calls).toHaveLength(1)
  })

  it('a name set by the manual button can be replaced by the next auto lookup', async () => {
    const { state, ctl } = setup(async () => found('ТОО Б'))
    state.name = 'ТОО А'
    ctl.markFilled('ТОО А')
    ctl.change(BIN_B)
    await flush()
    expect(state.name).toBe('ТОО Б')
  })

  it('dispose cancels a pending lookup', async () => {
    const { calls, ctl } = setup(async () => found('ТОО А'))
    ctl.change(BIN_A)
    ctl.dispose()
    await flush()
    expect(calls).toHaveLength(0)
  })
})

describe('только по кнопке (решение основателя 29.10.2026 для бесплатных инструментов)', () => {
  it('в бесплатных формах автопоиск выключен', () => {
    expect(AUTO_NAME_LOOKUP_ENABLED).toBe(false)
  })
  it('набор 12 цифр не трогает сеть и не подставляет название', async () => {
    const { calls, state, ctl } = setup(async () => found('ТОО Тест'), '', false)
    ctl.change(BIN_A)
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.name).toBe('')
    expect(state.statuses.at(-1)).toBe('idle')
  })
  it('неверная контрольная цифра по-прежнему подсказывается, без сети', async () => {
    const { calls, state, ctl } = setup(async () => found('x'), '', false)
    ctl.change(BAD)
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.statuses.at(-1)).toBe('invalid')
  })
  it('название от прошлого БИН осталось: подсказка «не обновилось», сети нет', async () => {
    const { calls, state, ctl } = setup(async () => found('x'), 'ТОО Старое', false)
    ctl.adopt(BIN_A)
    ctl.change(BIN_B)
    await flush()
    expect(calls).toHaveLength(0)
    expect(state.statuses.at(-1)).toBe('stale')
    ctl.change(BIN_A) // вернулись к БИН, которому принадлежит название
    expect(state.statuses.at(-1)).toBe('idle')
  })
  it('по умолчанию (autoSearch не задан) автопоиск работает, как раньше', async () => {
    const { calls, ctl } = setup(async () => found('ТОО Тест'))
    ctl.change(BIN_A)
    await flush()
    expect(calls).toHaveLength(1)
  })
})
