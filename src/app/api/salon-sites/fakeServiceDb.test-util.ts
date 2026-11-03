// Подставной serviceSupabase для тестов маршрутов /api/salon-sites: цепочка
// supabase-js, у которой чтение и запись отвечают заданными результатами.
// Один синглтон на файл теста (vitest изолирует модули по файлам).
type Result = { data: unknown; error: { message: string; code?: string } | null }

export const salonDb = {
  /** Что видят select-цепочки (проверки перед записью, список). */
  read: { data: null, error: null } as Result,
  /** Что видят insert/update/upsert/delete-цепочки. */
  write: { data: null, error: null } as Result,
  /** Ответ requireAdmin. */
  admin: { userId: 'admin1' } as { userId: string } | { error: string; status: number },
  /** Чтение по таблицам перекрывает общее: { salon_site_variants: {...} }. */
  readByTable: {} as Record<string, Result>,
  reset() {
    this.read = { data: null, error: null }
    this.write = { data: null, error: null }
    this.admin = { userId: 'admin1' }
    this.readByTable = {}
  },
  client: {
    from(table: string) {
      let isWrite = false
      const pick = (): Result => (isWrite ? salonDb.write : salonDb.readByTable[table] ?? salonDb.read)
      const b: any = {
        select: () => b,
        eq: () => b,
        order: () => b,
        insert: () => { isWrite = true; return b },
        update: () => { isWrite = true; return b },
        upsert: () => { isWrite = true; return b },
        delete: () => { isWrite = true; return b },
        single: async () => pick(),
        maybeSingle: async () => pick(),
        then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(pick()).then(res, rej),
      }
      return b
    },
  },
}
