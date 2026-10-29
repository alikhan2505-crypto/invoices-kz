import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyRequisites, clearRequisites, hasRequisites, loadRequisites, mergeRequisites, parseRequisites,
  pickRequisites, REQUISITES_KEY, requisitesMatch, saveRequisites, TOOL_DRAFT_KEYS,
} from './requisites'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)) },
    removeItem: (k: string) => { data.delete(k) },
  }
}
const g = globalThis as unknown as { window?: unknown }
const install = (storage: unknown) => { g.window = { localStorage: storage } }

beforeEach(() => { install(fakeStorage()) })
afterEach(() => { delete g.window })

describe('parseRequisites', () => {
  it('keeps only known string keys and trims', () => {
    expect(parseRequisites(JSON.stringify({ binIin: ' 040340001997 ', companyName: 'ТОО А', evil: 'x', phone: 5, clientName: 'Покупатель' })))
      .toEqual({ binIin: '040340001997', companyName: 'ТОО А' })
  })
  it('survives junk', () => {
    expect(parseRequisites(null)).toEqual({})
    expect(parseRequisites('{oops')).toEqual({})
    expect(parseRequisites('[1]')).toEqual({})
    expect(parseRequisites('"str"')).toEqual({})
  })
  it('never carries buyer data or positions', () => {
    const out = parseRequisites(JSON.stringify({ clientName: 'X', clientBin: '1', rows: [], binIin: '1' }))
    expect(Object.keys(out)).toEqual(['binIin'])
  })
})

describe('pickRequisites / mergeRequisites', () => {
  it('takes only the keys the tool has', () => {
    expect(pickRequisites({ binIin: '1', companyName: 'A', phone: '77' }, ['binIin', 'companyName'])).toEqual({ binIin: '1', companyName: 'A' })
  })
  it('empty value erases the key, absent keys stay (another tool saved them)', () => {
    const prev = { binIin: '1', companyName: 'A', iik: 'KZ1', phone: '77' }
    expect(mergeRequisites(prev, { binIin: '1', companyName: '', phone: '88' })).toEqual({ binIin: '1', iik: 'KZ1', phone: '88' })
  })
})

describe('requisitesMatch', () => {
  const saved = { binIin: '040340001997', companyName: 'ТОО Б', address: 'Алматы' }
  it('empty form fits any saved set', () => {
    expect(requisitesMatch({ binIin: '', companyName: '' }, saved)).toBe(true)
  })
  it('same BIN fits, another BIN does not', () => {
    expect(requisitesMatch({ binIin: '040340001997' }, saved)).toBe(true)
    expect(requisitesMatch({ binIin: '890525350143' }, saved)).toBe(false)
  })
  it('without a BIN the name decides (case and spaces do not matter)', () => {
    expect(requisitesMatch({ binIin: '', companyName: ' тоо  б ' }, saved)).toBe(true)
    expect(requisitesMatch({ binIin: '', companyName: 'ТОО А' }, saved)).toBe(false)
  })
})

describe('applyRequisites', () => {
  const keys = ['binIin', 'companyName', 'director'] as const
  it('fills only empty fields and reports what it filled', () => {
    const r = applyRequisites({ binIin: '040340001997', companyName: 'Моё ТОО', director: '  ' }, { binIin: '040340001997', companyName: 'Старое', director: 'Иванов' }, keys)
    expect(r.form).toEqual({ binIin: '040340001997', companyName: 'Моё ТОО', director: 'Иванов' })
    expect(r.applied).toEqual(['director'])
    // пустая форма получает всё сохранённое
    const e = applyRequisites({ binIin: '', companyName: '', director: '' }, { binIin: '040340001997', companyName: 'Старое', director: 'Иванов' }, keys)
    expect(e.applied).toEqual(['binIin', 'companyName', 'director'])
  })
  it('reports nothing when nothing is saved', () => {
    const form = { binIin: '', companyName: '', director: '' }
    const r = applyRequisites(form, {}, keys)
    expect(r.applied).toEqual([])
    expect(r.form).toEqual(form)
  })
  it('does not mix two companies: a draft of firm A is not topped up with the saved details of firm B', () => {
    const form = { binIin: '890525350143', companyName: 'ТОО А', director: '' }
    const r = applyRequisites(form, { binIin: '040340001997', companyName: 'ТОО Б', director: 'Иванов' }, keys)
    expect(r.form).toEqual(form)
    expect(r.applied).toEqual([])
  })
  it('tops up a draft of the same company', () => {
    const r = applyRequisites({ binIin: '040340001997', companyName: 'ТОО Б', director: '' }, { binIin: '040340001997', director: 'Иванов' }, keys)
    expect(r.form.director).toBe('Иванов')
    expect(r.applied).toEqual(['director'])
  })
  it('a draft with a name but no BIN is not topped up with another company', () => {
    const r = applyRequisites({ binIin: '', companyName: 'ТОО А', director: '' }, { binIin: '040340001997', companyName: 'ТОО Б', director: 'Иванов' }, keys)
    expect(r.applied).toEqual([])
    expect(r.form.binIin).toBe('')
  })
  it('does not touch fields the tool does not have', () => {
    const r = applyRequisites({ binIin: '' }, { binIin: '1', iik: 'KZ' }, ['binIin'])
    expect(r.form).toEqual({ binIin: '1' })
  })
})

describe('storage', () => {
  it('saving another company replaces the old set whole (no phone of firm B next to the BIN of firm A)', () => {
    saveRequisites({ binIin: '040340001997', companyName: 'ТОО Б', phone: '77010000000', address: 'Алматы' })
    // инструмент без поля телефона сохраняет фирму А
    saveRequisites({ binIin: '890525350143', companyName: 'ТОО А' })
    expect(loadRequisites()).toEqual({ binIin: '890525350143', companyName: 'ТОО А' })
  })
  it('saving the same company still keeps what other tools stored', () => {
    saveRequisites({ binIin: '040340001997', companyName: 'ТОО Б', phone: '77010000000' })
    saveRequisites({ binIin: '040340001997', companyName: 'ТОО Б', address: 'Алматы' })
    expect(loadRequisites()).toEqual({ binIin: '040340001997', companyName: 'ТОО Б', phone: '77010000000', address: 'Алматы' })
  })
  it('round-trips one shared record and merges tools', () => {
    expect(saveRequisites({ binIin: '040340001997', companyName: 'ТОО А' })).toBe(true)
    expect(saveRequisites({ iik: 'KZ123' })).toBe(true)
    expect(loadRequisites()).toEqual({ binIin: '040340001997', companyName: 'ТОО А', iik: 'KZ123' })
  })
  it('removes the key when everything was erased', () => {
    const s = fakeStorage(); install(s)
    saveRequisites({ binIin: '1' })
    saveRequisites({ binIin: '' })
    expect(s.data.has(REQUISITES_KEY)).toBe(false)
    expect(hasRequisites(loadRequisites())).toBe(false)
  })
  it('works without localStorage (private mode): reads empty, writes report false, nothing throws', () => {
    const boom = new Proxy({}, { get() { throw new Error('SecurityError') } })
    install(boom)
    expect(loadRequisites()).toEqual({})
    expect(saveRequisites({ binIin: '1' })).toBe(false)
    expect(clearRequisites()).toBe(false)
  })
  it('works when setItem throws (quota)', () => {
    install({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded') }, removeItem: () => {} })
    expect(saveRequisites({ binIin: '1' })).toBe(false)
  })
  it('works when window is missing entirely (server render)', () => {
    delete g.window
    expect(loadRequisites()).toEqual({})
    expect(saveRequisites({ binIin: '1' })).toBe(false)
  })
})

describe('clearRequisites', () => {
  it('drops the shared key and scrubs supplier fields from every tool draft, keeping the rest', () => {
    const s = fakeStorage({
      [REQUISITES_KEY]: JSON.stringify({ binIin: '1' }),
      'tool-schet-kbe-manual': '1',
      [TOOL_DRAFT_KEYS[0]]: JSON.stringify({ binIin: '040340001997', companyName: 'ТОО А', iik: 'KZ1', kbe: '17', clientName: 'Покупатель', rows: [{ name: 'Товар' }] }),
      [TOOL_DRAFT_KEYS[2]]: JSON.stringify({ binIin: '040340001997', phone: '77', clientBin: '890525350143', rows: [] }),
    })
    install(s)
    expect(clearRequisites()).toBe(true)
    expect(s.data.has(REQUISITES_KEY)).toBe(false)
    expect(s.data.has('tool-schet-kbe-manual')).toBe(false)
    const schet = JSON.parse(s.data.get(TOOL_DRAFT_KEYS[0])!)
    expect(schet).toMatchObject({ binIin: '', companyName: '', iik: '', kbe: '19', clientName: 'Покупатель', rows: [{ name: 'Товар' }] })
    const kp = JSON.parse(s.data.get(TOOL_DRAFT_KEYS[2])!)
    expect(kp).toMatchObject({ binIin: '', phone: '', clientBin: '890525350143' })
  })
  it('ignores a corrupt draft', () => {
    const s = fakeStorage({ [TOOL_DRAFT_KEYS[1]]: '{oops' })
    install(s)
    expect(clearRequisites()).toBe(false)
    expect(s.data.get(TOOL_DRAFT_KEYS[1])).toBe('{oops')
  })
})
