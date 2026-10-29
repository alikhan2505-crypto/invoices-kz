import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReminderStore } from './dmReminderStore'
import { REMINDER_STUCK_AFTER_MS } from './dmReminder'

// Записывающий конструктор запросов: фиксирует вызовы цепочки и отдаёт заданный ответ.
function recordingDb(result: { data: unknown; error: unknown }) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = []
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as [string, unknown[]][] }
      calls.push(entry)
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (v: unknown) => void) => res(result)
          return (...args: unknown[]) => { entry.ops.push([prop, args]); return chain }
        },
      })
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const NOW_ISO = '2026-10-29T12:00:00.000Z'

describe('dmReminderStore', () => {
  it('listDue фильтрует по агентам (in agent_id) и сразу пустой список без запроса, если агентов нет', async () => {
    const r = recordingDb({ data: [], error: null })
    const store = createReminderStore(r.db)
    expect(await store.listDue(NOW_ISO, 50, [])).toEqual([])
    expect(r.calls).toHaveLength(0)
    await store.listDue(NOW_ISO, 50, ['a1', 'a2'])
    const ops = r.calls[0].ops
    expect(ops).toContainEqual(['in', ['agent_id', ['a1', 'a2']]])
    expect(ops).toContainEqual(['eq', ['status', 'pending']])
  })

  it('reapStuck закрывает только sending старше порога как failed/interrupted и возвращает число', async () => {
    const r = recordingDb({ data: [{ id: 'x' }, { id: 'y' }], error: null })
    const store = createReminderStore(r.db)
    expect(await store.reapStuck(NOW_ISO)).toBe(2)
    const ops = r.calls[0].ops
    expect(ops).toContainEqual(['update', [{ status: 'failed', reason: 'interrupted' }]])
    expect(ops).toContainEqual(['eq', ['status', 'sending']])
    const lt = ops.find(o => o[0] === 'lt')!
    expect(lt[1][0]).toBe('claimed_at')
    expect(Date.parse(NOW_ISO) - Date.parse(lt[1][1] as string)).toBe(REMINDER_STUCK_AFTER_MS)
  })

  it('reapStuck при ошибке базы возвращает 0 и не бросает', async () => {
    const r = recordingDb({ data: null, error: { code: 'x' } })
    expect(await createReminderStore(r.db).reapStuck(NOW_ISO)).toBe(0)
  })
})
