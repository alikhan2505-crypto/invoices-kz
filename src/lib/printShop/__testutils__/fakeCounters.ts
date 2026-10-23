import type { SupabaseClient } from '@supabase/supabase-js'

// Мини-подделка tool_kontragent_checks (как в toolQuota.test.ts): select().eq().maybeSingle(),
// update().eq().eq().select() и insert() с первичным ключом по key.
export function fakeCounters(rows: Record<string, number>, opts: { failRead?: boolean; failUpdate?: boolean } = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: (_c: string, k: string) => ({
          maybeSingle: async () => opts.failRead
            ? { data: null, error: { message: 'boom' } }
            : { data: k in rows ? { count: rows[k] } : null, error: null },
        }),
      }),
      update: (patch: { count: number }) => {
        const f: Record<string, unknown> = {}
        const chain = {
          eq: (c: string, v: unknown) => { f[c] = v; return chain },
          select: async () => {
            if (opts.failUpdate) return { data: null, error: { message: 'boom' } }
            const k = f.key as string
            if (k in rows && rows[k] === f.count) { rows[k] = patch.count; return { data: [{ key: k }], error: null } }
            return { data: [], error: null }
          },
        }
        return chain
      },
      insert: async (row: { key: string; count: number }) => {
        if (row.key in rows) return { error: { code: '23505', message: 'dup' } }
        rows[row.key] = row.count
        return { error: null }
      },
    }),
  } as unknown as SupabaseClient
}
