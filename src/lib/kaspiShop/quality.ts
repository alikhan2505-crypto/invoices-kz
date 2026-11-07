// Показатели качества (Quality/Rating dashboard) -- one shared GraphQL
// query gives all 4 metrics, captured live 2026-08-26; the metricType enum
// values used by the per-category breakdown query were verified live
// 2026-08-27 (2 of the 4 guessed values in the original findings doc were
// wrong -- RETURN/CANCEL are singular, not RETURNS/CANCELS). See
// docs/superpowers/specs/2026-08-27-kaspi-quality-metrics-design.md.

const COMMON_HEADERS = {
  'x-auth-version': '3',
  'content-type': 'application/json',
  'referer': 'https://kaspi.kz/',
  'origin': 'https://kaspi.kz',
}

// Our own stable tab keys -- mapped internally to Kaspi's real
// enum/boolean-flag combination so a future Kaspi rename never ripples
// into route params, UI state, or anything else outside this module.
export const QUALITY_TABS = {
  rating: { metricType: 'RATING', isRating: true, isReturned: false, isLateKaspiDelivery: false, isCancelled: false },
  returns: { metricType: 'RETURN', isRating: false, isReturned: true, isLateKaspiDelivery: false, isCancelled: false },
  lateDelivery: { metricType: 'LATE_KASPI_DELIVERY', isRating: false, isReturned: false, isLateKaspiDelivery: true, isCancelled: false },
  cancellations: { metricType: 'CANCEL', isRating: false, isReturned: false, isLateKaspiDelivery: false, isCancelled: true },
} as const

export type QualityTab = keyof typeof QUALITY_TABS

export type MetricSummary = {
  goodValue: number
  violationValue: number
  zonePercentage: number
  percentage: number
  daysPerPeriod: number
  from: string
  to: string
  notEnoughData: boolean
  numerator: number
  denominator: number
}

function mapDetails(details: any): MetricSummary {
  return {
    goodValue: details.goodValue,
    violationValue: details.violationValue,
    zonePercentage: details.zonePercentage,
    percentage: details.percentage,
    daysPerPeriod: details.daysPerPeriod,
    from: details.from,
    to: details.to,
    notEnoughData: details.notEnoughData,
    numerator: details.formulaElements?.numerator,
    denominator: details.formulaElements?.denominator,
  }
}

// Любой вызов Kaspi: таймаут и перехват сетевой ошибки, чтобы сбой был явным
// failed, а не исключением на всю страницу и не пустым «ничего нет» (аудит K35).
const QUALITY_TIMEOUT_MS = 15_000

function qualityFailure(err: unknown): string {
  const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
  return timedOut ? 'Kaspi не ответил вовремя' : (err instanceof Error ? err.message : 'Неизвестная ошибка')
}

export type QualityOverview = {
  rating: MetricSummary & { statistics: { oneCount: number; twoCount: number; threeCount: number; fourCount: number; fiveCount: number } }
  returns: MetricSummary
  lateDelivery: MetricSummary
  cancellations: MetricSummary
  ordersCount: number
  // Populated shape never observed live (always null on both captured
  // accounts) -- kept untyped/defensive, never assumed to have a specific
  // signal structure. See design doc.
  warning: unknown | null
}

const GET_SINGLE_METRIC_DETAILS_QUERY = `query getSingleMetricDetails($id: String!, $version: QcVersion!) {
  merchant(id: $id) {
    qualityControl(version: $version) {
      ratingWithStatistics { details { goodValue percentage violationValue zonePercentage from to daysPerPeriod formulaElements { numerator denominator } notEnoughData } statistics { oneCount twoCount threeCount fourCount fiveCount } }
      returned { details { goodValue percentage violationValue zonePercentage from to daysPerPeriod formulaElements { numerator denominator } notEnoughData } }
      lateKaspiDelivery { details { goodValue percentage violationValue zonePercentage from to daysPerPeriod formulaElements { numerator denominator } notEnoughData } }
      cancelled { details { goodValue percentage violationValue zonePercentage from to daysPerPeriod formulaElements { numerator denominator } notEnoughData } }
      bannerGroup { warning { generalLevel signals { level metric } } }
      ordersCount
    }
  }
}`

export async function getQualityOverview(
  sessionCookies: string,
  merchantId: string,
  fetchFn: typeof fetch = fetch
): Promise<{ overview: QualityOverview | null; sessionExpired: boolean; failed?: boolean; error?: string }> {
  let res: Response
  try {
    res = await fetchFn('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getSingleMetricDetails', {
      method: 'POST',
      headers: { ...COMMON_HEADERS, cookie: sessionCookies },
      body: JSON.stringify({
        operationName: 'getSingleMetricDetails',
        variables: { id: merchantId, version: 'V2' },
        query: GET_SINGLE_METRIC_DETAILS_QUERY,
      }),
      signal: AbortSignal.timeout(QUALITY_TIMEOUT_MS),
    })
  } catch (err) {
    return { overview: null, sessionExpired: false, failed: true, error: qualityFailure(err) }
  }
  if (res.status === 401 || res.status === 403) return { overview: null, sessionExpired: true }
  if (!res.ok) return { overview: null, sessionExpired: false, failed: true, error: `Kaspi ответил HTTP ${res.status}` }
  const json = await res.json().catch(() => null)
  const qc = json?.data?.merchant?.qualityControl
  if (!qc || !qc.ratingWithStatistics?.details || !qc.returned?.details || !qc.lateKaspiDelivery?.details || !qc.cancelled?.details) {
    return { overview: null, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
  }
  return {
    overview: {
      rating: { ...mapDetails(qc.ratingWithStatistics.details), statistics: qc.ratingWithStatistics.statistics },
      returns: mapDetails(qc.returned.details),
      lateDelivery: mapDetails(qc.lateKaspiDelivery.details),
      cancellations: mapDetails(qc.cancelled.details),
      ordersCount: qc.ordersCount,
      warning: qc.bannerGroup?.warning ?? null,
    },
    sessionExpired: false,
  }
}

export type CategoryRow = {
  categoryCode: string
  categoryDisplayName: string
  performanceStatus: string | null
  metric: {
    percentage: number
    performanceStatus: string | null
    totalCount: number
    warningLevel: string | null
    violatedCount: number
    daysPerPeriod: number
    from: string
    to: string
    notEnoughData: boolean
  }
}

const GET_QC_BY_CATEGORIES_QUERY = `query getQCByCategories($merchantUid: String!, $page: Int!, $size: Int!, $metricType: QcMetricType!, $isCancelled: Boolean!, $isReturned: Boolean!, $isLateKaspiDelivery: Boolean!, $isRating: Boolean!) {
  merchant(id: $merchantUid) {
    qualityControl(version: V2) {
      categories(page: $page, size: $size, metric: $metricType) {
        totalCount
        items {
          categoryCode categoryDisplayName
          qualityMetrics {
            performanceStatus
            cancels @include(if: $isCancelled) { percentage performanceStatus totalCount warningLevel violatedCount daysPerPeriod from to notEnoughData }
            returns @include(if: $isReturned) { percentage performanceStatus totalCount warningLevel violatedCount daysPerPeriod from to notEnoughData }
            delivery @include(if: $isLateKaspiDelivery) { percentage performanceStatus totalCount warningLevel violatedCount daysPerPeriod from to notEnoughData }
            rating @include(if: $isRating) { percentage performanceStatus totalCount warningLevel violatedCount daysPerPeriod from to notEnoughData }
          }
        }
      }
    }
  }
}`

export const QUALITY_CATEGORIES_PAGE_SIZE = 10

const METRIC_FIELD_BY_TAB: Record<QualityTab, 'rating' | 'returns' | 'delivery' | 'cancels'> = {
  rating: 'rating',
  returns: 'returns',
  lateDelivery: 'delivery',
  cancellations: 'cancels',
}

export async function getQualityCategories(
  sessionCookies: string,
  merchantId: string,
  tab: QualityTab,
  page: number,
  fetchFn: typeof fetch = fetch
): Promise<{ categories: CategoryRow[]; total: number; sessionExpired: boolean; failed?: boolean; error?: string }> {
  const tabConfig = QUALITY_TABS[tab]
  if (!tabConfig) {
    throw new Error(`Invalid quality tab "${tab}" -- must be one of ${Object.keys(QUALITY_TABS).join(', ')}`)
  }
  let res: Response
  try {
    res = await fetchFn('https://mc.shop.kaspi.kz/mc/facade/graphql?opName=getQCByCategories', {
      method: 'POST',
      headers: { ...COMMON_HEADERS, cookie: sessionCookies },
      body: JSON.stringify({
        operationName: 'getQCByCategories',
        variables: {
          merchantUid: merchantId,
          page,
          size: QUALITY_CATEGORIES_PAGE_SIZE,
          metricType: tabConfig.metricType,
          isCancelled: tabConfig.isCancelled,
          isReturned: tabConfig.isReturned,
          isLateKaspiDelivery: tabConfig.isLateKaspiDelivery,
          isRating: tabConfig.isRating,
        },
        query: GET_QC_BY_CATEGORIES_QUERY,
      }),
      signal: AbortSignal.timeout(QUALITY_TIMEOUT_MS),
    })
  } catch (err) {
    return { categories: [], total: 0, sessionExpired: false, failed: true, error: qualityFailure(err) }
  }
  if (res.status === 401 || res.status === 403) return { categories: [], total: 0, sessionExpired: true }
  if (!res.ok) return { categories: [], total: 0, sessionExpired: false, failed: true, error: `Kaspi ответил HTTP ${res.status}` }
  const json = await res.json().catch(() => null)
  const categories = json?.data?.merchant?.qualityControl?.categories
  const items = categories?.items
  if (!Array.isArray(items)) return { categories: [], total: 0, sessionExpired: false, failed: true, error: 'Kaspi вернул неожиданный ответ' }
  const metricField = METRIC_FIELD_BY_TAB[tab]
  return {
    categories: items.map((item: any) => ({
      categoryCode: item.categoryCode,
      categoryDisplayName: item.categoryDisplayName,
      performanceStatus: item.qualityMetrics?.performanceStatus ?? null,
      metric: item.qualityMetrics?.[metricField],
    })),
    total: Number(categories?.totalCount) || 0,
    sessionExpired: false,
  }
}
