// Связь страницы с расширением Chrome «invoices.kz: помощник поиска на 1688» (папка
// extension/invoices-1688, 01.11.2026). 1688 и Alibaba отдают серверу капчу, поэтому поиск идёт в
// браузере самого пользователя: расширение открывает вкладку 1688, человек при необходимости
// проходит проверку, расширение читает карточки и отдаёт их странице через window.postMessage.
// Результаты остаются в браузере и на наш сервер не отправляются.
//
// Всё, что пришло от расширения, считается недоверенным (сообщение может прислать любой скрипт на
// странице): sanitizeExtOffers пропускает только ожидаемые поля, адреса товара только
// detail.1688.com/offer/<id>.html, фото только с https://*.alicdn.com.

export const EXT_PAGE_SOURCE = 'invoices-kz-page'
export const EXT_SOURCE = 'invoices-kz-ext'

export interface ExtOffer {
  id: string
  url: string
  title: string
  /** Цена в юанях за единицу (при заказе от минимальной партии, её в карточке поиска нет). */
  priceCny: number
  priceNote: string
  sales: string
  shop: string
  imageUrl: string
}

export type ExtStatus = 'started' | 'captcha' | 'attention' | 'results' | 'error'

export type ExtErrorReason =
  | 'busy' | 'too_fast' | 'bad_request' | 'cannot_open' | 'timeout' | 'unreadable'
  | 'tab_closed' | 'extension_unavailable' | 'page_timeout' | 'no_gesture' | 'hourly_limit' | 'unknown'

export interface ExtEvent {
  id: string
  status: ExtStatus
  reason?: ExtErrorReason
  items?: ExtOffer[]
}

const REASONS: ExtErrorReason[] = [
  'busy', 'too_fast', 'bad_request', 'cannot_open', 'timeout', 'unreadable', 'tab_closed', 'extension_unavailable',
  'no_gesture', 'hourly_limit',
]

export const MAX_EXT_OFFERS = 12

const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Предложения от расширения: только ожидаемые поля, безопасные адреса, не больше MAX_EXT_OFFERS. */
export function sanitizeExtOffers(raw: unknown): ExtOffer[] {
  if (!Array.isArray(raw)) return []
  const out: ExtOffer[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : String(o.id ?? '')
    const price = Number(o.priceCny)
    const title = s(o.title, 200)
    if (!/^\d{6,20}$/.test(id) || seen.has(id) || !title || !Number.isFinite(price) || price <= 0 || price >= 10_000_000) continue
    let imageUrl = ''
    try {
      const u = new URL(typeof o.imageUrl === 'string' ? o.imageUrl : '')
      if (u.protocol === 'https:' && /(^|\.)alicdn\.com$/.test(u.hostname) && u.href.length <= 500) imageUrl = u.href
    } catch { /* нет фото */ }
    seen.add(id)
    out.push({
      id,
      // Адрес строим сами из id: присланному расширением не доверяем.
      url: `https://detail.1688.com/offer/${id}.html`,
      title,
      priceCny: price,
      priceNote: s(o.priceNote, 60),
      sales: s(o.sales, 60),
      shop: s(o.shop, 80),
      imageUrl,
    })
    if (out.length >= MAX_EXT_OFFERS) break
  }
  return out
}

/** Сообщение расширения -> событие для страницы или null (чужое, битое или с другим id). */
export function parseExtEvent(data: unknown, expectId: string): ExtEvent | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.source !== EXT_SOURCE || d.type !== 'ik1688:event' || d.id !== expectId) return null
  const status = d.status
  if (status !== 'started' && status !== 'captcha' && status !== 'attention' && status !== 'results' && status !== 'error') return null
  if (status === 'results') return { id: expectId, status, items: sanitizeExtOffers(d.items) }
  if (status === 'error') {
    const reason = REASONS.includes(d.reason as ExtErrorReason) ? (d.reason as ExtErrorReason) : 'unknown'
    return { id: expectId, status, reason }
  }
  return { id: expectId, status }
}

/** Цена в тенге по курсу; null, если курса нет. */
export function cnyToKzt(cny: number, rate: number | null | undefined): number | null {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) return null
  return Math.round(cny * rate)
}

/** Текст для человека по причине отказа. */
export function extErrorText(reason: ExtErrorReason | undefined): string {
  switch (reason) {
    case 'busy': return 'Предыдущий поиск ещё идёт. Дождитесь его или закройте вкладку 1688.'
    case 'too_fast': return 'Слишком часто. Подождите пару секунд и нажмите снова.'
    case 'hourly_limit': return 'Достигнут лимит расширения: не больше 20 поисков в час. Это защита вашего аккаунта 1688 от блокировки.'
    case 'no_gesture': return 'Расширение принимает поиск только по нажатию кнопки. Нажмите кнопку ещё раз.'
    case 'cannot_open': return 'Не получилось открыть вкладку 1688. Убедитесь, что окно Chrome открыто, и попробуйте ещё раз.'
    case 'timeout': return 'Не дождался результатов за 3 минуты. Возможно, проверка «ползунок» на 1688 не была пройдена. Нажмите поиск ещё раз и передвиньте ползунок во вкладке 1688.'
    case 'page_timeout': return 'Расширение не ответило вовремя. Обновите страницу и попробуйте ещё раз.'
    case 'unreadable': return 'Страницу 1688 открыть удалось, но прочитать результаты не получилось: возможно, сайт поменял вёрстку. Откройте поиск вручную по ссылке выше.'
    case 'tab_closed': return 'Вкладка 1688 была закрыта до окончания поиска.'
    case 'extension_unavailable': return 'Расширение не отвечает. Если вы только что обновили или включили его, перезагрузите эту страницу (F5); иначе проверьте, что оно включено в chrome://extensions.'
    case 'bad_request': return 'Расширение не приняло запрос. Обновите страницу.'
    default: return 'Поиск через расширение не удался. Попробуйте ещё раз.'
  }
}
