import { describe, it, expect } from 'vitest'
import { normalizeBin, isValidBin, pickBestRecord, toLookupResult, egovQuery } from './binLookup'

// Shaped after real gbd_ul rows (checked against the live API on 2026-09-10).
const kaspi = {
  bin: '971240001315',
  nameru: 'Акционерное общество "Kaspi Bank"',
  namekz: '«Kaspi Bank» Акционерлік қоғамы',
  addressru: '050000, Г.АЛМАТЫ, УЛ. НАУРЫЗБАЙ БАТЫРА, д. 154 А',
  addresskz: '050000, АЛМАТЫ Қ., НАУРЫЗБАЙ БАТЫР К-СІ, д. 154 А',
  director: 'ЛОМТАДЗЕ МИХАИЛ',
  okedru: 'ДЕЯТЕЛЬНОСТЬ БАНКОВ',
  statusru: 'Зарегистрирован',
  datereg: '1997-01-01',
}

describe('normalizeBin', () => {
  it('keeps only digits', () => {
    expect(normalizeBin(' 971 240-001315 ')).toBe('971240001315')
  })
  it('survives empty input', () => {
    expect(normalizeBin(null)).toBe('')
    expect(normalizeBin(undefined)).toBe('')
  })
})

describe('isValidBin', () => {
  it('accepts exactly twelve digits, however they were pasted', () => {
    expect(isValidBin('971240001315')).toBe(true)
    expect(isValidBin('971 240 001 315')).toBe(true)
  })
  it('rejects anything else', () => {
    // A half-typed БИН must not reach the API: the answer would be "not
    // found", which reads as "no such company" rather than "keep typing".
    expect(isValidBin('9712400')).toBe(false)
    expect(isValidBin('9712400013159')).toBe(false)
    expect(isValidBin('')).toBe(false)
    expect(isValidBin(null)).toBe(false)
  })
})

describe('pickBestRecord', () => {
  it('collapses the duplicate rows the dataset ships', () => {
    // The live API returns this БИН twice, identically.
    const picked = pickBestRecord('971240001315', [kaspi, { ...kaspi }])
    expect(picked?.nameru).toBe(kaspi.nameru)
  })

  it('ignores rows for a different company', () => {
    const other = { ...kaspi, bin: '160340026203', nameru: 'Другая компания' }
    const picked = pickBestRecord('971240001315', [other, kaspi])
    expect(picked?.bin).toBe('971240001315')
  })

  it('prefers a registered row over a liquidated one', () => {
    const dead = { ...kaspi, statusru: 'Ликвидирован', datereg: '2020-01-01' }
    // The dead row is newer, so this also proves status outranks the date.
    expect(pickBestRecord('971240001315', [dead, kaspi])?.statusru).toBe('Зарегистрирован')
  })

  it('takes the most recent registration when status does not decide', () => {
    const older = { ...kaspi, datereg: '1990-01-01', nameru: 'Старое название' }
    expect(pickBestRecord('971240001315', [older, kaspi])?.nameru).toBe(kaspi.nameru)
  })

  it('returns null when nothing matches', () => {
    expect(pickBestRecord('971240001315', [])).toBeNull()
    expect(pickBestRecord('971240001315', [{ ...kaspi, bin: '000000000000' }])).toBeNull()
  })
})

describe('toLookupResult', () => {
  it('maps a row to the fields the form needs', () => {
    const r = toLookupResult('971240001315', [kaspi])!
    expect(r.name).toBe('Акционерное общество "Kaspi Bank"')
    expect(r.address).toContain('НАУРЫЗБАЙ')
    expect(r.director).toBe('ЛОМТАДЗЕ МИХАИЛ')
    expect(r.status).toBe('Зарегистрирован')
    expect(r.registeredAt).toBe('1997-01-01')
  })

  it('falls back to the Kazakh columns when the Russian ones are empty', () => {
    const kkOnly = { ...kaspi, nameru: '', addressru: '   ', okedru: null }
    const r = toLookupResult('971240001315', [kkOnly])!
    expect(r.name).toBe(kaspi.namekz)
    expect(r.address).toBe(kaspi.addresskz)
  })

  it('returns null for a row with no name at all', () => {
    // Handing back a nameless result would blank a name the user may have
    // already typed correctly.
    expect(toLookupResult('971240001315', [{ ...kaspi, nameru: '', namekz: '' }])).toBeNull()
  })

  it('returns null when the company is absent — an ИП, for instance', () => {
    // gbd_ul holds legal entities only, so a sole proprietor is a miss and
    // must not be reported as a failure.
    expect(toLookupResult('890525350143', [])).toBeNull()
  })
})

describe('egovQuery', () => {
  it('builds the match query the API accepts', () => {
    expect(JSON.parse(egovQuery(' 971 240 001 315 '))).toEqual({
      size: 5, query: { match: { bin: '971240001315' } },
    })
  })
})
