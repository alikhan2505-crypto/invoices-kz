import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchUnreliableDetail, fetchTaxRegime, fetchEnforcement, resetEnforcementState, AISOIP_RETRY_DELAY_MS,
} from './binExtraChecks'
import { elicenseSearchUrl } from './binRiskText'
import { buildAisoipRequest, isIndividualId } from './aisoip'

// Все ответы подменены. Формы взяты из живых вызовов 25.10.2026; БИН и названия
// вымышленные (репозиторий публичный). Главное правило: любой сбой даёт null,
// а null никогда не становится «чисто».

const BIN = '123456789012'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const text = (body: string, status = 200) => new Response(body, { status })

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.KGD_PORTAL_TOKEN = 'test-kgd-token'
  process.env.EGOV_API_KEY = 'test-egov-key'
  delete process.env.AISOIP_CHECK_DISABLED
  delete process.env.AISOIP_RETRY_DELAY_MS
  resetEnforcementState()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const timeoutError = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })

// --- список неблагонадёжных с категориями ---------------------------------

describe('fetchUnreliableDetail', () => {
  const listed = (category: string) => [{
    iin: BIN, name: 'ТОО «Пример»',
    taxpayerDataList: [{ unreliableTaxpayerDataCategory: category, actType: 'X', actNumber: null, dataReportDate: null }],
  }]

  it('clean: an empty list is "not listed" with no categories', async () => {
    fetchMock.mockResolvedValue(json([]))
    expect(await fetchUnreliableDetail(BIN)).toEqual({ listed: false, categories: [] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('taxpayer-data/search')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ taxPayerCode: BIN, language: 'ru' })
    expect(init.headers['X-Portal-Token']).toBe('test-kgd-token')
  })

  it.each([
    ['INACTIVE_LIST', 'inactive'],
    ['BANKRUPT_LIST', 'bankrupt'],
    ['REGISTRATION_INVALID_LIST', 'registrationInvalid'],
    ['REREGISTRATION_INVALID_LIST', 'reregistrationInvalid'],
  ])('positive: %s is read as %s', async (raw, expected) => {
    fetchMock.mockResolvedValue(json(listed(raw)))
    expect(await fetchUnreliableDetail(BIN)).toEqual({ listed: true, categories: [expected] })
  })

  it('positive: an unknown category is kept as "other", not dropped', async () => {
    fetchMock.mockResolvedValue(json(listed('SOMETHING_NEW_LIST')))
    expect(await fetchUnreliableDetail(BIN)).toEqual({ listed: true, categories: ['other'] })
  })

  it('positive: a listing with no category data is still listed', async () => {
    fetchMock.mockResolvedValue(json([{ iin: BIN, name: 'ТОО «Пример»' }]))
    expect(await fetchUnreliableDetail(BIN)).toEqual({ listed: true, categories: [] })
  })

  it('non-200: null', async () => {
    fetchMock.mockResolvedValue(json({ message: 'forbidden' }, 403))
    expect(await fetchUnreliableDetail(BIN)).toBeNull()
  })

  it('malformed JSON: null', async () => {
    fetchMock.mockResolvedValue(text('<html>not json</html>'))
    expect(await fetchUnreliableDetail(BIN)).toBeNull()
  })

  it('wrong shape (object instead of array): null', async () => {
    fetchMock.mockResolvedValue(json({ error: 'oops' }))
    expect(await fetchUnreliableDetail(BIN)).toBeNull()
  })

  it('timeout: null', async () => {
    fetchMock.mockRejectedValue(timeoutError())
    expect(await fetchUnreliableDetail(BIN)).toBeNull()
  })

  it('token missing: null and no request is made', async () => {
    delete process.env.KGD_PORTAL_TOKEN
    expect(await fetchUnreliableDetail(BIN)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('malformed БИН: null and no request is made', async () => {
    expect(await fetchUnreliableDetail('12345')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- налоговый режим (СНР) --------------------------------------------------

describe('fetchTaxRegime', () => {
  const simplified = {
    status: 'SUCCESS', error: null,
    tpName: { nameRu: 'ПЕРСОНАЛЬНЫЕ ДАННЫЕ', nameKk: null, nameEn: null, nameQq: null },
    stmList: [{
      type: 'SNR_SIMPLIFIED_DECLARATION', beginDate: '2026-01-01', endDate: null,
      typeNameRu: 'Упрощенная декларация', typeNameKk: 'Оңайлатылған декларация', typeNameEn: 'Simplified declaration',
    }],
  }

  it('positive: regime with a begin date; the taxpayer name is never read', async () => {
    fetchMock.mockResolvedValue(json(simplified))
    const result = await fetchTaxRegime(BIN)
    expect(result).toEqual([{
      type: 'SNR_SIMPLIFIED_DECLARATION', nameRu: 'Упрощенная декларация', nameKk: 'Оңайлатылған декларация',
      nameEn: 'Simplified declaration', beginDate: '2026-01-01', endDate: null,
    }])
    expect(JSON.stringify(result)).not.toContain('ПЕРСОНАЛЬНЫЕ')
    // The parameter must be `uin`: iin, bin and taxpayerCode answer 500.
    expect(String(fetchMock.mock.calls[0][0])).toContain(`snr-search/search?uin=${BIN}`)
  })

  it('positive: general order with null dates is a normal answer', async () => {
    fetchMock.mockResolvedValue(json({
      status: 'SUCCESS', error: null,
      stmList: [{ type: 'SNR_GENERAL_ORDER', beginDate: null, endDate: null, typeNameRu: 'Общеустановленный порядок' }],
    }))
    const result = await fetchTaxRegime(BIN)
    expect(result?.[0]).toMatchObject({ type: 'SNR_GENERAL_ORDER', beginDate: null, endDate: null, nameEn: null })
  })

  it('positive: a regime type we have never seen is kept under its own name', async () => {
    fetchMock.mockResolvedValue(json({
      status: 'SUCCESS', stmList: [{ type: 'SNR_FUTURE_REGIME', typeNameRu: 'Новый режим', beginDate: '2027-01-01T00:00:00' }],
    }))
    expect(await fetchTaxRegime(BIN)).toEqual([expect.objectContaining({ type: 'SNR_FUTURE_REGIME', nameRu: 'Новый режим', beginDate: '2027-01-01' })])
  })

  it('unknown БИН (HTTP 200, status ERROR) is null, NOT "no regime"', async () => {
    fetchMock.mockResolvedValue(json({ status: 'ERROR', error: 'tax.payer.not.found', stmList: null }))
    expect(await fetchTaxRegime(BIN)).toBeNull()
  })

  it('SUCCESS with an empty list is null: nothing was learned', async () => {
    fetchMock.mockResolvedValue(json({ status: 'SUCCESS', error: null, stmList: [] }))
    expect(await fetchTaxRegime(BIN)).toBeNull()
  })

  it('non-200 (the 500 for a wrong parameter, 403 for a wrong token): null', async () => {
    fetchMock.mockResolvedValue(json({ message: 'Проверьте правильность ввода ИИН' }, 500))
    expect(await fetchTaxRegime(BIN)).toBeNull()
    fetchMock.mockResolvedValue(json({}, 403))
    expect(await fetchTaxRegime(BIN)).toBeNull()
  })

  it('malformed JSON: null', async () => {
    fetchMock.mockResolvedValue(text('{"status":'))
    expect(await fetchTaxRegime(BIN)).toBeNull()
  })

  it('timeout: null', async () => {
    fetchMock.mockRejectedValue(timeoutError())
    expect(await fetchTaxRegime(BIN)).toBeNull()
  })

  it('token missing: null and no request is made', async () => {
    delete process.env.KGD_PORTAL_TOKEN
    expect(await fetchTaxRegime(BIN)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- реестр должников Минюста (SOAP) ---------------------------------------

describe('fetchEnforcement', () => {
  const wrap = (code: string, message: string, rows = '') =>
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"/><soap:Body>' +
    '<ns1:requestResponse xmlns:ns1="http://soap.opendata.egov.nitec.kz/"><response><responseInfo><messageId>m</messageId>' +
    `<status><code>${code}</code><message>${message}</message></status></responseInfo>` +
    `<responseData><data xmlns:ns7="http://bip.bee.kz/SyncChannel/v10/Types">${rows}</data></responseData></response></ns1:requestResponse></soap:Body></soap:Envelope>`

  // Row shape follows the live answer; the signature block sits INSIDE <rows>.
  const row = (o: { bin?: string; start?: string; end?: string; amount?: string; category?: string } = {}) =>
    '<rows><execProc>1</execProc><execProcNum>1/17</execProcNum>' +
    `<ipStartDate>${o.start ?? '2017-12-07T00:00:00.000+05:00'}</ipStartDate>` +
    (o.end ? `<ipEndDate>${o.end}</ipEndDate>` : '<ipEndDate xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>') +
    `<debtorTitle>Товарищество &quot;Пример&quot;</debtorTitle><debtorBin>${o.bin ?? BIN}</debtorBin>` +
    `<categoryRu>${o.category ?? 'Другие'}</categoryRu><recoveryAmount>${o.amount ?? '0.000'}</recoveryAmount>` +
    '<officerSurname>СЕКРЕТНЫЙ</officerSurname><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignatureValue>abc</ds:SignatureValue></ds:Signature></rows>'

  const noRetryDelay = { retryDelayMs: 0 }

  it('builds the SOAP request the portal documents, with the БИН and the key inside the XML', async () => {
    fetchMock.mockResolvedValue(text(wrap('SCSS001', 'Данные не найдены')))
    await fetchEnforcement(BIN, noRetryDelay)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://data.egov.kz/egov-opendata-ws/ODWebServiceImpl')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toContain('text/xml')
    expect(init.body).toContain('<indexName>aisoip</indexName>')
    expect(init.body).toContain(`<iinOrBin>${BIN}</iinOrBin>`)
    expect(init.body).toContain('<apiKey>test-egov-key</apiKey>')
    // The key is never in the URL (where it would end up in logs).
    expect(String(url)).not.toContain('test-egov-key')
  })

  it('clean: SCSS001 and no rows means "no proceedings in the Minjust data"', async () => {
    fetchMock.mockResolvedValue(text(wrap('SCSS001', 'Данные не найдены')))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toEqual({
      found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null,
    })
  })

  it('positive: one row with a zero amount (the known positive shape)', async () => {
    fetchMock.mockResolvedValue(text(wrap('SCSS001', 'Сервис отработал штатно', row())))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toEqual({
      found: true, count: 1, activeCount: 1, totalAmount: 0, earliestStart: '2017-12-07',
    })
  })

  it('positive: several rows are aggregated; finished proceedings are counted but not active', async () => {
    const rows = row({ amount: '1000000.000', category: 'Взыскание суммы', start: '2026-03-01T00:00:00.000+05:00' })
      + row({ amount: '2033000.50', category: 'Взыскание суммы', start: '2026-02-26T00:00:00.000+05:00' })
      + row({ category: 'Другие', end: '2026-04-01T00:00:00.000+05:00', start: '2025-01-10T00:00:00.000+05:00' })
    fetchMock.mockResolvedValue(text(wrap('SCSS001', 'ok', rows)))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toEqual({
      found: true, count: 3, activeCount: 2, totalAmount: 3033000.5, earliestStart: '2025-01-10',
    })
  })

  it('never exposes debtor, officer or recoverer names, nor recovery categories', async () => {
    fetchMock.mockResolvedValue(text(wrap('SCSS001', 'ok', row({ category: 'Личный долг' }))))
    const result = await fetchEnforcement(BIN, noRetryDelay)
    const out = JSON.stringify(result)
    expect(out).not.toContain('СЕКРЕТНЫЙ')
    expect(out).not.toContain('Пример')
    expect(out).not.toContain('Личный долг')
    expect(Object.keys(result!).sort()).toEqual(['activeCount', 'count', 'earliestStart', 'found', 'totalAmount'])
  })

  it('rows that belong to a different БИН are not trusted: null', async () => {
    fetchMock.mockImplementation(async () => text(wrap('SCSS001', 'ok', row({ bin: '999999999999' }))))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
  })

  it('403 from nginx then success: retried, and the success is used', async () => {
    fetchMock
      .mockResolvedValueOnce(text('<html><head><title>403 Forbidden</title></head></html>', 403))
      .mockResolvedValueOnce(text(wrap('SCSS001', 'Данные не найдены')))
    const r = await fetchEnforcement(BIN, noRetryDelay)
    expect(r?.found).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('non-200 on every attempt: null after exactly 1 try + 2 retries (never "clean")', async () => {
    fetchMock.mockImplementation(async () => text('<html>403 Forbidden</html>', 403))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('HTTP 200 with an HTML body (malformed): null at once, no retry spent', async () => {
    fetchMock.mockImplementation(async () => text('<html><body>maintenance</body></html>'))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('429 (quota) is not retried: null after one request', async () => {
    fetchMock.mockImplementation(async () => text('quota', 429))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('401 is not retried either', async () => {
    fetchMock.mockImplementation(async () => text('no', 401))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('503 is retried like 403', async () => {
    fetchMock
      .mockResolvedValueOnce(text('busy', 503))
      .mockResolvedValueOnce(text(wrap('SCSS001', 'Данные не найдены')))
    expect((await fetchEnforcement(BIN, noRetryDelay))?.found).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('default pause is at least 1500 ms (700 ms was measured not to work: the retry hit the same 403)', async () => {
    expect(AISOIP_RETRY_DELAY_MS).toBeGreaterThanOrEqual(1500)
    // Real wait with a small explicit pause: the delay is actually slept.
    fetchMock
      .mockResolvedValueOnce(text('403', 403))
      .mockResolvedValueOnce(text(wrap('SCSS001', 'Данные не найдены')))
    const t0 = Date.now()
    await fetchEnforcement(BIN, { retryDelayMs: 120 })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(110)
  })

  it('the 9 s budget still fits attempt, 1.5 s, attempt, 1.5 s, attempt when 403s answer fast', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation(async () => text('403', 403))
      const p = fetchEnforcement(BIN)
      await vi.advanceTimersByTimeAsync(AISOIP_RETRY_DELAY_MS * 2 + 50)
      expect(await p).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('AISOIP_RETRY_DELAY_MS overrides the default pause', async () => {
    process.env.AISOIP_RETRY_DELAY_MS = '0'
    fetchMock.mockImplementation(async () => text('403', 403))
    const t0 = Date.now()
    expect(await fetchEnforcement(BIN)).toBeNull()
    expect(Date.now() - t0).toBeLessThan(500)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('circuit breaker: after two total failures the check is skipped for a while (null, no request)', async () => {
    fetchMock.mockImplementation(async () => text('403', 403))
    await fetchEnforcement(BIN, noRetryDelay)
    await fetchEnforcement(BIN, noRetryDelay)
    expect(fetchMock).toHaveBeenCalledTimes(6)
    fetchMock.mockClear()
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a success in between resets the failure count', async () => {
    fetchMock.mockImplementation(async () => text('403', 403))
    await fetchEnforcement(BIN, noRetryDelay)
    fetchMock.mockImplementation(async () => text(wrap('SCSS001', 'Данные не найдены')))
    await fetchEnforcement('210987654321', noRetryDelay)
    fetchMock.mockImplementation(async () => text('403', 403))
    await fetchEnforcement(BIN, noRetryDelay)
    fetchMock.mockClear()
    await fetchEnforcement(BIN, noRetryDelay)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('a successful answer is remembered for the same БИН: the second call makes no request', async () => {
    fetchMock.mockImplementation(async () => text(wrap('SCSS001', 'ok', row())))
    const first = await fetchEnforcement(BIN, noRetryDelay)
    const second = await fetchEnforcement(BIN, noRetryDelay)
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a failure is never remembered as an answer', async () => {
    fetchMock.mockImplementation(async () => text('403', 403))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    fetchMock.mockImplementation(async () => text(wrap('SCSS001', 'Данные не найдены')))
    expect((await fetchEnforcement(BIN, noRetryDelay))?.found).toBe(false)
  })

  it('SOAP code other than SCSS001: null', async () => {
    fetchMock.mockImplementation(async () => text(wrap('ERR001', 'Ошибка', row())))
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
  })

  it('timeout on every attempt: null', async () => {
    fetchMock.mockRejectedValue(timeoutError())
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('stops retrying when the time budget is spent', async () => {
    fetchMock.mockImplementation(async () => text('<html>403</html>', 403))
    expect(await fetchEnforcement(BIN, { retryDelayMs: 50, budgetMs: 10 })).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('key missing: null and no request is made', async () => {
    delete process.env.EGOV_API_KEY
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('kill switch AISOIP_CHECK_DISABLED=1: null and no request is made', async () => {
    process.env.AISOIP_CHECK_DISABLED = '1'
    expect(await fetchEnforcement(BIN, noRetryDelay)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('malformed БИН: null and no request is made (nothing can be injected into the XML)', async () => {
    expect(await fetchEnforcement('1</iinOrBin><x>', noRetryDelay)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('isIndividualId', () => {
  it('tells an IIN (YYMMDD, digit 5 is 0-3) from a BIN (digit 5 is the organisation type 4-6)', () => {
    expect(isIndividualId('890525350143')).toBe(true)
    expect(isIndividualId('580105350501')).toBe(true)
    expect(isIndividualId('971240001315')).toBe(false)
    expect(isIndividualId('12345')).toBe(false)
  })
})

describe('buildAisoipRequest', () => {
  it('escapes XML special characters in the key', () => {
    const xml = buildAisoipRequest(BIN, 'a<b&c', 'id-1', new Date('2026-10-25T10:00:00Z'))
    expect(xml).toContain('<apiKey>a&lt;b&amp;c</apiKey>')
    expect(xml).toContain('<messageDate>2026-10-25T10:00:00.000+00:00</messageDate>')
  })
})

// --- лицензии: только ссылка --------------------------------------------------

describe('elicenseSearchUrl', () => {
  it('prefills the БИН and leaves the captcha to the person', () => {
    expect(elicenseSearchUrl(BIN, 'ru')).toBe(
      `https://elicense.kz/LicensingContent/SimpleSearchLicense?lang=ru&IinBinStr=${BIN}&IinBinEquality=1`,
    )
    expect(elicenseSearchUrl(BIN, 'kk')).toBe(
      `https://elicense.kz/LicensingContent/SimpleSearchLicense?IinBinStr=${BIN}&IinBinEquality=1`,
    )
  })
})
