// Чистые проверки фонового скрипта: что можно искать и что можно отдавать странице.
// Вынесены отдельно, чтобы их проверяли тесты (extension/invoices-1688/ext.test.ts).
(function (root) {
  'use strict'

  var SEARCH_BASE = 'https://s.1688.com/selloffer/offer_search.htm?keywords='
  var PAGE_HOSTS = ['invoices.kz', 'kaspi.invoices.kz']
  var HAN = /[一-鿿]/

  /** Страница вправе просить поиск, только если она на одном из наших адресов по https. */
  function isAllowedPage(url) {
    try {
      var u = new URL(url)
      return u.protocol === 'https:' && PAGE_HOSTS.indexOf(u.hostname) >= 0
    } catch (e) { return false }
  }

  /** Идентификатор запроса: короткая безопасная строка. */
  function isRequestId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
  }

  /**
   * Запросы на китайском: от 1 до 3 строк по 1-40 знаков, в каждой есть иероглиф, без управляющих
   * символов. Возвращает очищенный список или null. Расширение никогда не открывает адрес,
   * присланный страницей: адрес строится только из этих слов.
   */
  function validateQueries(list) {
    if (!Array.isArray(list) || list.length < 1 || list.length > 3) return null
    var out = []
    for (var i = 0; i < list.length; i++) {
      var q = list[i]
      if (typeof q !== 'string') return null
      var t = q.trim()
      if (t.length < 1 || t.length > 40 || !HAN.test(t) || /[\u0000-\u001f\u007f]/.test(t)) return null
      out.push(t)
    }
    return out
  }

  /** Адрес поиска 1688 по слову; null, если слово нельзя закодировать в GBK. */
  function buildSearchUrl(query, encodeGbk) {
    var enc = encodeGbk(query)
    return enc === null ? null : SEARCH_BASE + enc
  }

  var str = function (v, max) { return typeof v === 'string' ? v.slice(0, max) : '' }

  /** Предложения от вкладки 1688 перед отправкой странице: только ожидаемые поля и типы. */
  function sanitizeItems(items) {
    if (!Array.isArray(items)) return []
    var out = []
    for (var i = 0; i < items.length && out.length < 30; i++) {
      var o = items[i]
      if (!o || typeof o !== 'object') continue
      var price = Number(o.priceCny)
      if (!/^\d{6,20}$/.test(String(o.id)) || !isFinite(price) || price <= 0) continue
      out.push({
        id: String(o.id),
        url: str(o.url, 200),
        title: str(o.title, 200),
        priceCny: price,
        priceNote: str(o.priceNote, 60),
        sales: str(o.sales, 60),
        shop: str(o.shop, 80),
        imageUrl: str(o.imageUrl, 500),
      })
    }
    return out
  }

  var api = {
    SEARCH_BASE: SEARCH_BASE,
    isAllowedPage: isAllowedPage,
    isRequestId: isRequestId,
    validateQueries: validateQueries,
    buildSearchUrl: buildSearchUrl,
    sanitizeItems: sanitizeItems,
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.IK1688Core = api
})(typeof self !== 'undefined' ? self : globalThis)
