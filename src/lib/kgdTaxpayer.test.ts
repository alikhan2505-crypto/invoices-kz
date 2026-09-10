import { describe, it, expect } from 'vitest'
import { parseTaxpayer, parseVatStatus, parseUnreliable, parseLiquidation, KGD_TAXPAYER_TYPES } from './kgdTaxpayer'

// Both fixtures are verbatim from live calls on 2026-09-10.
const ipResponse = {
  taxpayerPortalSearchResponses: [{
    responseMessageUid: 'b0951f42-7f93-464a-b994-ecaede1ee52d',
    messageResult: 'SUCCESS',
    code: '890525350143',
    taxpayerType: 'IP',
    name: 'First Project',
    beginDate: '2016-03-15',
  }],
}

const kaspiVat = {
  iinBin: '971240001315',
  nameRu: 'Акционерное общество "Kaspi Bank"',
  nameEn: null,
  nameKz: null,
  ndsRegistrationDate: '2002-01-01',
  ndsDeregistrationDate: null,
  ndsDeregistrationReason: null,
}

describe('parseTaxpayer', () => {
  it('reads a sole proprietor', () => {
    const t = parseTaxpayer(ipResponse)!
    expect(t.name).toBe('First Project')
    expect(t.registeredAt).toBe('2016-03-15')
    expect(t.taxpayerType).toBe('IP')
  })

  it('treats an empty result array as not found', () => {
    // The service answers 200 with an empty array rather than a 404.
    expect(parseTaxpayer({ taxpayerPortalSearchResponses: [] })).toBeNull()
    expect(parseTaxpayer({})).toBeNull()
    expect(parseTaxpayer(null)).toBeNull()
  })

  it('rejects a row that did not succeed on their side', () => {
    const failed = { taxpayerPortalSearchResponses: [{ messageResult: 'ERROR', name: 'Что-то', errorMessage: 'oops' }] }
    expect(parseTaxpayer(failed)).toBeNull()
  })

  it('skips nameless rows rather than returning a blank company', () => {
    const mixed = {
      taxpayerPortalSearchResponses: [
        { messageResult: 'SUCCESS', name: '   ' },
        { messageResult: 'SUCCESS', name: 'ТОО «Настоящее»', beginDate: '2020-01-01' },
      ],
    }
    expect(parseTaxpayer(mixed)?.name).toBe('ТОО «Настоящее»')
  })
})

describe('parseVatStatus', () => {
  it('reads an active VAT registration', () => {
    const v = parseVatStatus(kaspiVat)!
    expect(v.isVatPayer).toBe(true)
    expect(v.registeredAt).toBe('2002-01-01')
  })

  it('reads an empty body as "not a VAT payer"', () => {
    // A live sole proprietor returns literally nothing — verified against
    // БИН 890525350143, which is not registered for VAT.
    expect(parseVatStatus('')).toEqual({ isVatPayer: false, registeredAt: null, deregisteredAt: null })
    expect(parseVatStatus(null)?.isVatPayer).toBe(false)
  })

  it('counts someone who was deregistered as not a payer today', () => {
    const past = { ...kaspiVat, ndsDeregistrationDate: '2024-06-30' }
    const v = parseVatStatus(past)!
    expect(v.isVatPayer).toBe(false)
    expect(v.deregisteredAt).toBe('2024-06-30')
  })

  it('returns null for a body that carries no VAT information at all', () => {
    // Distinct from "not a payer": nothing was learned, and the caller must
    // be able to leave the field unset rather than assert a negative.
    expect(parseVatStatus({ something: 'else' })).toBeNull()
  })
})

describe('KGD_TAXPAYER_TYPES', () => {
  it('asks about sole proprietors first', () => {
    // Legal entities are already covered by the register, so anything that
    // reaches КГД is most likely an ИП.
    expect(KGD_TAXPAYER_TYPES[0]).toBe('IP')
  })
})

describe('parseUnreliable', () => {
  it('reads an empty array as "not listed"', () => {
    // Confirmed live on 2026-09-10 for both БИН 971240001315 and 890525350143.
    expect(parseUnreliable([])).toBe(false)
  })
  it('reads a populated array as listed', () => {
    expect(parseUnreliable([{ iin: '000000000000', name: 'ТОО «Пример»' }])).toBe(true)
  })
  it('returns null when the answer is not a list at all', () => {
    // Unknown must stay distinct from clean: a failed request shown as
    // "counterparty is fine" is worse than showing nothing.
    expect(parseUnreliable({ error: 'oops' })).toBeNull()
    expect(parseUnreliable(null)).toBeNull()
    expect(parseUnreliable('')).toBeNull()
  })
})

describe('parseLiquidation', () => {
  const empty = {
    taxpayers: { content: [], pageNumber: 0, pageSize: 0, numberOfElements: 0, empty: true },
    status: 2,
    message: { nameRu: 'Данные не найдены' },
  }

  it('reads the live empty answer as "not in liquidation"', () => {
    expect(parseLiquidation(empty)).toBe(false)
  })

  it('reads a populated content list as "in liquidation"', () => {
    expect(parseLiquidation({ taxpayers: { content: [{ ru: 'ТОО «Пример»' }] } })).toBe(true)
  })

  it('returns null for a shape it does not recognise', () => {
    expect(parseLiquidation({ taxpayers: {} })).toBeNull()
    expect(parseLiquidation({})).toBeNull()
    expect(parseLiquidation(null)).toBeNull()
  })
})
