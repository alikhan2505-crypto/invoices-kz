// Возвраты (Refunds & Disputes) -- every endpoint and field here was
// captured live 2026-08-26 against a real seller account with 322 historical
// refunds (merchant 425002, ABIL-SISTERS) -- see
// docs/superpowers/specs/2026-08-26-kaspi-refunds-quality-api-findings.md.
//
// IMPORTANT: the cabinet's own URL hash uses "REFUND_NEW" for the Новые tab,
// but the actual API's `tab` query param takes "NEW" -- these are NOT the
// same string. REFUND_TABS below is the API's real vocabulary; never accept
// a hash-style value here.

const COMMON_HEADERS = {
  'x-auth-version': '3',
  'referer': 'https://kaspi.kz/',
  'origin': 'https://kaspi.kz',
}

export const REFUND_TABS = ['NEW', 'ON_DELIVERY', 'WAITING_DECISION', 'DISPUTE', 'CLOSED'] as const
export type RefundTab = typeof REFUND_TABS[number]

export type RefundCount = { tab: string; tabTitle: string; total: number }

export async function getRefundCounts(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ counts: RefundCount[]; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refunds-count?merchantId=${encodeURIComponent(merchantId)}`, {
    headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
  })
  if (!res.ok) return { counts: [], sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  return { counts: Array.isArray(json) ? json : [], sessionExpired: false }
}

export type RefundListItem = {
  refundId: string
  applicationNumber: string
  order: string
  productSku: string
  customer: string
  sum: number
  quantity: number
  reasonDescription: string
  // Kaspi's own field is confusingly named "description" but is actually
  // the human status string ("Возврат оформляется"/"Возврат оформлен"/
  // "Возврат отменён"), not free text -- renamed here for clarity.
  statusText: string
}

export async function listRefunds(
  sessionCookies: string,
  merchantId: string,
  tab: RefundTab,
  page: number,
  fetchFn: typeof fetch = fetch
): Promise<{ refunds: RefundListItem[]; total: number; sessionExpired: boolean }> {
  if (!REFUND_TABS.includes(tab)) {
    throw new Error(`Invalid tab "${tab}" -- must be one of ${REFUND_TABS.join(', ')}`)
  }
  const res = await fetchFn(`https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refunds-by-tab?merchantId=${encodeURIComponent(merchantId)}&tab=${tab}&p=${page}&s=10`, {
    headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
  })
  if (!res.ok) return { refunds: [], total: 0, sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  const items = Array.isArray(json?.data) ? json.data : []
  return {
    refunds: items.map((r: any) => ({
      refundId: r.refundId,
      applicationNumber: r.applicationNumber,
      order: r.order,
      productSku: r.productSku,
      customer: r.customer,
      sum: r.sum,
      quantity: r.quantity,
      reasonDescription: r.refundReason?.reasonDescription ?? '',
      statusText: r.description ?? '',
    })),
    total: Number(json?.total) || 0,
    sessionExpired: false,
  }
}

export type RefundStateStep = {
  title: string
  stepStatus: string | null
  stage: string | null
  result: string | null
  stepType: string | null
  expirationTime: string | null
}

export type RefundDetail = {
  refundId: string
  applicationNumber: string
  order: string
  customerName: string
  reasonDescription: string
  quantity: number
  total: number
  totalWithdraw: number
  comment: string | null
  statusText: string
  // Phase 1b: the populated shape of this array (buttons/payloads for an
  // active pending decision) has never been observed live -- kept as
  // unknown[] and rendered defensively, never assumed to be a fixed
  // accept/reject pair. See the design doc's Phase 1b note.
  actions: unknown[]
  stateSteps: RefundStateStep[]
  klTrackUrl: string | null
  imageUrls: string[]
}

export async function getRefundDetails(
  sessionCookies: string,
  merchantId: string,
  refundId: string,
  applicationNumber: string,
  fetchFn: typeof fetch = fetch
): Promise<{ detail: RefundDetail | null; sessionExpired: boolean }> {
  const res = await fetchFn(`https://mc.shop.kaspi.kz/refund/api/v1/merchant-cabinet/load-refund-details?merchantId=${encodeURIComponent(merchantId)}&refundId=${encodeURIComponent(refundId)}&code=${encodeURIComponent(applicationNumber)}`, {
    headers: { ...COMMON_HEADERS, 'cookie': sessionCookies },
  })
  if (!res.ok) return { detail: null, sessionExpired: res.status === 401 || res.status === 403 }
  const json = await res.json().catch(() => null)
  if (!json) return { detail: null, sessionExpired: false }
  return {
    detail: {
      refundId: json.refundId,
      applicationNumber: json.applicationNumber,
      order: json.order,
      customerName: json.customerName,
      reasonDescription: json.refundReason?.reasonDescription ?? '',
      quantity: json.quantity,
      total: json.total,
      totalWithdraw: json.totalWithdraw,
      comment: json.comment ?? null,
      statusText: json.stepDescription ?? '',
      actions: Array.isArray(json.actions) ? json.actions : [],
      stateSteps: Array.isArray(json.stateSteps) ? json.stateSteps.map((s: any) => ({
        title: s.title ?? '',
        stepStatus: s.stepStatus ?? null,
        stage: s.stage ?? null,
        result: s.result ?? null,
        stepType: s.stepType ?? null,
        expirationTime: s.expirationTime ?? null,
      })) : [],
      klTrackUrl: json.klTrackUrl ?? null,
      imageUrls: Array.isArray(json.imageUrls) ? json.imageUrls : [],
    },
    sessionExpired: false,
  }
}
