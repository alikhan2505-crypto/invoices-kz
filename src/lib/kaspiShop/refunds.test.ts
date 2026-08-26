import { describe, it, expect, vi } from 'vitest'
import { getRefundCounts, listRefunds, getRefundDetails, REFUND_TABS } from './refunds'

function jsonResponse(body: any, status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('getRefundCounts', () => {
  it('maps the captured count-array shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse([
      { tab: 'WAITING_DECISION', tabTitle: 'Ожидают решения', total: 0 },
      { tab: 'ON_DELIVERY', tabTitle: 'На доставке', total: 0 },
      { tab: 'CLOSED', tabTitle: 'Закрытые заявки', total: 322 },
      { tab: 'DISPUTE', tabTitle: 'Споры', total: 0 },
      { tab: 'NEW', tabTitle: 'Новые', total: 1 },
    ]))
    const result = await getRefundCounts('cookie=1', '425002', fetchFn as any)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refunds-count?merchantId=425002')
    expect(init.headers.cookie).toBe('cookie=1')
    expect(result.sessionExpired).toBe(false)
    expect(result.counts).toEqual([
      { tab: 'WAITING_DECISION', tabTitle: 'Ожидают решения', total: 0 },
      { tab: 'ON_DELIVERY', tabTitle: 'На доставке', total: 0 },
      { tab: 'CLOSED', tabTitle: 'Закрытые заявки', total: 322 },
      { tab: 'DISPUTE', tabTitle: 'Споры', total: 0 },
      { tab: 'NEW', tabTitle: 'Новые', total: 1 },
    ])
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await getRefundCounts('cookie=1', '425002', fetchFn as any)
    expect(result).toEqual({ counts: [], sessionExpired: true })
  })
})

describe('REFUND_TABS', () => {
  it('is exactly the 5 real API tab values, not the frontend hash-style names', () => {
    // The cabinet's own URL hash uses REFUND_NEW while the API takes NEW --
    // guard against ever conflating the two (see findings doc's explicit warning).
    expect(REFUND_TABS).toEqual(['NEW', 'ON_DELIVERY', 'WAITING_DECISION', 'DISPUTE', 'CLOSED'])
  })
})

describe('listRefunds', () => {
  it('rejects a tab value outside the confirmed API set', async () => {
    const fetchFn = vi.fn()
    await expect(listRefunds('c', '425002', 'REFUND_NEW' as any, 0, fetchFn as any)).rejects.toThrow(/tab/i)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps the captured list-item shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      data: [{
        refundId: '69f5e8cbeb0b53711e7af9ec',
        applicationNumber: '906725811-1',
        tab: 'CLOSED',
        reason: 'SIZE_MISMATCH',
        refundReason: { reason: 'SIZE_MISMATCH', reasonDescription: 'Не подошел размер' },
        plannedDate: '2026-05-15T20:00:00',
        order: '906725811',
        productSku: '162495789',
        customer: 'Акбота О.',
        sum: 4100.0,
        quantity: 1,
        unit: 'PIECES',
        weight: 1.0,
        description: 'Возврат оформляется',
      }],
      total: 322,
    }))
    const result = await listRefunds('cookie=1', '425002', 'CLOSED', 0, fetchFn as any)
    const [url] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refunds-by-tab?merchantId=425002&tab=CLOSED&p=0&s=10')
    expect(result.total).toBe(322)
    expect(result.refunds).toEqual([{
      refundId: '69f5e8cbeb0b53711e7af9ec',
      applicationNumber: '906725811-1',
      order: '906725811',
      productSku: '162495789',
      customer: 'Акбота О.',
      sum: 4100.0,
      quantity: 1,
      reasonDescription: 'Не подошел размер',
      statusText: 'Возврат оформляется',
    }])
  })

  it('reports sessionExpired on 403', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 403))
    const result = await listRefunds('c', '425002', 'NEW', 0, fetchFn as any)
    expect(result).toEqual({ refunds: [], total: 0, sessionExpired: true })
  })
})

describe('getRefundDetails', () => {
  it('maps the captured detail shape, tolerating an empty actions array', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      refundId: '69f5e8cbeb0b53711e7af9ec',
      applicationNumber: '906725811-1',
      order: '906725811',
      customerName: 'Акбота О.',
      refundReason: { reason: 'SIZE_MISMATCH', reasonDescription: 'Не подошел размер' },
      productSku: '162495789',
      quantity: 1,
      total: 4100.0,
      totalWithdraw: 3587.0,
      comment: null,
      stepDescription: 'Возврат оформляется',
      actions: [],
      stateSteps: [
        { title: 'Заявка принята', stepStatus: 'SUCCESS', stage: 'PASSED', result: 'POSITIVE', stepType: 'MERCHANT_APPROVAL', expirationTime: '2026-05-02T18:23:10.595' },
        { title: 'Возврат оформляется', stepStatus: 'IN_PROGRESS', stage: 'CURRENT', result: null, stepType: 'WAITING_PAYMENT', expirationTime: '2026-05-15T20:00:00' },
      ],
      klTrackUrl: 'https://ksint.kaspi.kz/ksl/tracking/order/906725811-1-R',
      imageUrls: ['https://resources.cdn-kaspi.kz/a', 'https://resources.cdn-kaspi.kz/b'],
      createdDate: '2026-05-02T17:06:35.489',
    }))
    const result = await getRefundDetails('cookie=1', '425002', '69f5e8cbeb0b53711e7af9ec', '906725811-1', fetchFn as any)
    const [url] = fetchFn.mock.calls[0]
    expect(url).toBe('https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refund-details?merchantId=425002&refundId=69f5e8cbeb0b53711e7af9ec&code=906725811-1')
    expect(result.detail).toEqual({
      refundId: '69f5e8cbeb0b53711e7af9ec',
      applicationNumber: '906725811-1',
      order: '906725811',
      customerName: 'Акбота О.',
      reasonDescription: 'Не подошел размер',
      quantity: 1,
      total: 4100.0,
      totalWithdraw: 3587.0,
      comment: null,
      statusText: 'Возврат оформляется',
      actions: [],
      stateSteps: [
        { title: 'Заявка принята', stepStatus: 'SUCCESS', stage: 'PASSED', result: 'POSITIVE', stepType: 'MERCHANT_APPROVAL', expirationTime: '2026-05-02T18:23:10.595' },
        { title: 'Возврат оформляется', stepStatus: 'IN_PROGRESS', stage: 'CURRENT', result: null, stepType: 'WAITING_PAYMENT', expirationTime: '2026-05-15T20:00:00' },
      ],
      klTrackUrl: 'https://ksint.kaspi.kz/ksl/tracking/order/906725811-1-R',
      imageUrls: ['https://resources.cdn-kaspi.kz/a', 'https://resources.cdn-kaspi.kz/b'],
    })
    expect(result.sessionExpired).toBe(false)
  })

  it('tolerates a missing actions field and missing stateSteps without throwing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({
      refundId: 'x', applicationNumber: 'y-1', order: 'y', customerName: 'Тест Т.',
      refundReason: { reasonDescription: 'Причина' }, quantity: 1, total: 100, totalWithdraw: 90,
      comment: null, stepDescription: 'Статус', klTrackUrl: null, imageUrls: [], createdDate: '2026-01-01',
    }))
    const result = await getRefundDetails('c', '425002', 'x', 'y-1', fetchFn as any)
    expect(result.detail?.actions).toEqual([])
    expect(result.detail?.stateSteps).toEqual([])
  })

  it('reports sessionExpired on 401', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 401))
    const result = await getRefundDetails('c', '425002', 'x', 'y-1', fetchFn as any)
    expect(result).toEqual({ detail: null, sessionExpired: true })
  })
})
