import { describe, it, expect } from 'vitest'
import type { PersonCheckResult } from './run'
import { buildPersonGroups, countPersonRows, personText } from './rows'

const clean = { found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null }
const cleanRnu = { found: false, count: 0 }
const base = (over: Partial<PersonCheckResult> = {}): PersonCheckResult => ({
  iin: '900101300017', entrepreneur: { state: 'none' }, enforcement: clean, rnu: { supplier: cleanRnu, related: cleanRnu }, ...over,
})
const row = (r: PersonCheckResult, id: string) => buildPersonGroups(r).flatMap(g => g.rows).find(x => x.id === id)

describe('реестр должников', () => {
  it('чисто', () => {
    const x = row(base(), 'enforcement')!
    expect(x.tone).toBe('ok')
    expect(x.link?.href).toContain('data.egov.kz') // видимая ссылка на источник обязательна по условиям портала
  })
  it('есть производства: замечание с числами', () => {
    const x = row(base({ enforcement: { found: true, count: 2, activeCount: 1, totalAmount: 184300, earliestStart: '2024-03-01' } }), 'enforcement')!
    expect(x.tone).toBe('bad')
    expect(x.text).toContain('2')
    expect(x.text).toContain('1')
  })
  it('не ответил: «не проверено», не «чисто»', () => {
    const x = row(base({ enforcement: null }), 'enforcement')!
    expect(x.tone).toBe('unknown')
    expect(x.text).toMatch(/не значит/)
    expect(x.link?.href).toContain('aisoip.adilet.gov.kz')
  })
})

describe('ИП', () => {
  it('нет ИП: справочная строка, без вердиктов про налоги', () => {
    const g = buildPersonGroups(base())
    const ip = g.find(x => x.id === 'entrepreneur')!
    expect(ip.rows.map(r => r.id)).toEqual(['ip'])
    expect(ip.rows[0].tone).toBe('info')
  })
  it('реестры не ответили: «не удалось проверить»', () => {
    const ip = row(base({ entrepreneur: { state: 'unknown' } }), 'ip')!
    expect(ip.tone).toBe('unknown')
    expect(ip.text).toMatch(/Не удалось проверить/)
  })
  const found = (over: Record<string, unknown> = {}): PersonCheckResult => base({
    entrepreneur: {
      state: 'found',
      entrepreneur: {
        name: 'ИП Пример', status: null, registeredAt: '2019-03-12', isVatPayer: false, vatRegisteredAt: null,
        isUnreliable: false, unreliableCategories: [], totalArrear: 0, taxArrear: 0, taxRegimes: null, rehabilitation: undefined,
        ...over,
      },
    },
  })
  it('чистый ИП', () => {
    const g = buildPersonGroups(found()).find(x => x.id === 'entrepreneur')!
    expect(g.rows.map(r => [r.id, r.tone])).toEqual([
      ['ip', 'info'], ['unreliable', 'ok'], ['bankruptcy', 'ok'], ['arrear', 'ok'], ['regime', 'unknown'],
    ])
  })
  it('долг и неблагонадёжность видны', () => {
    const r = found({ totalArrear: 16015.86, taxArrear: 16015.86, isUnreliable: true, unreliableCategories: ['inactive'] })
    expect(row(r, 'arrear')!.tone).toBe('bad')
    expect(row(r, 'unreliable')!.tone).toBe('bad')
    expect(row(r, 'unreliable')!.details.join(' ')).toMatch(/Причина/)
  })
  it('банкрот по категории', () => {
    const r = found({ isUnreliable: true, unreliableCategories: ['bankrupt'] })
    expect(row(r, 'bankruptcy')!.tone).toBe('bad')
  })
  it('«в списке», но причина не распознана: про банкротство честно «не знаем»', () => {
    const r = found({ isUnreliable: true, unreliableCategories: [] })
    expect(row(r, 'bankruptcy')!.tone).toBe('unknown')
  })
  it('неизвестные вердикты не превращаются в «чисто»', () => {
    const r = found({ isUnreliable: null, unreliableCategories: null, totalArrear: null })
    expect(row(r, 'unreliable')!.tone).toBe('unknown')
    expect(row(r, 'bankruptcy')!.tone).toBe('unknown')
    expect(row(r, 'arrear')!.tone).toBe('unknown')
  })
  it('реабилитация: нет строки, пока проверка не включена; есть при ответе', () => {
    expect(row(found(), 'rehabilitation')).toBeUndefined()
    expect(row(found({ rehabilitation: null }), 'rehabilitation')!.tone).toBe('unknown')
    expect(row(found({ rehabilitation: { state: 'not_listed' } }), 'rehabilitation')!.tone).toBe('ok')
    expect(row(found({ rehabilitation: { state: 'listed', since: '2025-01-02' } }), 'rehabilitation')!.tone).toBe('bad')
  })
})

describe('госзакупки: РНУ', () => {
  it('чисто: две строки без замечаний, ссылка-источник на реестр', () => {
    const g = buildPersonGroups(base()).find(x => x.id === 'procurement')!
    expect(g.rows.map(r => [r.id, r.tone])).toEqual([['rnu', 'ok'], ['rnuRelated', 'ok']])
    expect(g.rows[0].link?.href).toContain('goszakup.gov.kz')
    expect(decodeURIComponent(g.rows[1].link?.href ?? '')).toContain('filter[head_biin]=900101300017')
  })
  it('участник и учредитель в реестре: замечания с числом записей', () => {
    const r = base({ rnu: { supplier: { found: true, count: 1 }, related: { found: true, count: 2 } } })
    expect(row(r, 'rnu')!.tone).toBe('bad')
    expect(row(r, 'rnuRelated')!.tone).toBe('bad')
    expect(row(r, 'rnuRelated')!.text).toContain('2')
  })
  it('портал не ответил: «не проверено», не «чисто»', () => {
    const r = base({ rnu: { supplier: null, related: null } })
    expect(row(r, 'rnu')!.tone).toBe('unknown')
    expect(row(r, 'rnuRelated')!.tone).toBe('unknown')
    expect(row(r, 'rnuRelated')!.text).toMatch(/не значит/)
  })
})

describe('вручную и счётчики', () => {
  it('суды и розыск всегда ручные', () => {
    const g = buildPersonGroups(base()).find(x => x.id === 'manual')!
    expect(g.rows.map(r => [r.id, r.tone])).toEqual([['court', 'manual'], ['wanted', 'manual']])
    expect(g.rows[0].link?.href).toBe('https://office.sud.kz')
  })
  it('судимость нигде не «проверена»: в строках её нет, в тексте сказано прямо', () => {
    const ids = buildPersonGroups(base()).flatMap(g => g.rows.map(r => r.id))
    expect(ids).not.toContain('conviction')
    expect(personText.conviction.title).toMatch(/не проверяется/)
  })
  it('счётчики: замечание, чисто, справочно, остальное', () => {
    const groups = buildPersonGroups(base({ enforcement: { found: true, count: 1, activeCount: 1, totalAmount: 0, earliestStart: null } }))
    expect(countPersonRows(groups)).toEqual({ bad: 1, ok: 2, info: 1, other: 2 })
  })
})
