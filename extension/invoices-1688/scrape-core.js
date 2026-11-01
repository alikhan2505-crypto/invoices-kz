// Чтение страницы результатов 1688 (s.1688.com/selloffer/offer_search.htm, международная
// версия AliTrading с русским интерфейсом). Чистые функции от документа: их запускает
// scrape.js внутри вкладки 1688 и тесты на готовой разметке. Разметка проверена на живой
// странице 01.11.2026: карточка это <a class="search-offer-item"> с блоками .offer-img-wrapper,
// .offer-title-row .title-text, .offer-price-row (.price-item и .desc-text), .offer-shop-row.
// Сайт может поменять вёрстку: тогда extractOffers вернёт пустой список, и интерфейс скажет
// «не удалось прочитать страницу», а не «ничего не найдено».
(function (root) {
  'use strict'

  var MAX_OFFERS = 30

  function clean(s, max) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max)
  }

  /** Текст элемента с пробелом на границах узлов: подсвеченные <font> иначе слипаются со словами. */
  function spacedText(el) {
    if (!el) return ''
    var parts = []
    var walk = function (node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) parts.push(c.nodeValue)
        else if (c.nodeType === 1) walk(c)
      }
    }
    walk(el)
    return clean(parts.join(' '), 400)
  }

  function offerIdAndUrl(href, base) {
    var u
    try { u = new URL(href, base) } catch (e) { return null }
    if (!/(^|\.)1688\.com$/.test(u.hostname)) return null
    var m = /\/offer\/(\d{6,20})\.html/.exec(u.pathname)
    if (!m) return null
    return { id: m[1], url: 'https://detail.1688.com/offer/' + m[1] + '.html' }
  }

  function parsePrice(card) {
    var item = card.querySelector('.offer-price-row .price-item') || card.querySelector('.price-item')
    if (!item) return null
    var m = /(\d[\d,]*(?:\.\d+)?)/.exec(String(item.textContent || '').replace(/\s+/g, '').replace(/^¥|￥/, ''))
    if (!m) return null
    var n = Number(m[1].replace(/,/g, ''))
    return isFinite(n) && n > 0 && n < 10000000 ? n : null
  }

  function parseImage(card) {
    var img = card.querySelector('img.main-img') || card.querySelector('.offer-img-wrapper img')
    if (!img) return ''
    var src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (src.indexOf('//') === 0) src = 'https:' + src
    try {
      var u = new URL(src)
      if (u.protocol !== 'https:' || !/(^|\.)alicdn\.com$/.test(u.hostname)) return ''
    } catch (e) { return '' }
    return src.length <= 500 ? src : ''
  }

  /**
   * Предложения со страницы результатов. Карточки без ссылки на товар или без цены пропускаются
   * (это реклама и баннеры); повторы по id отбрасываются.
   */
  function extractOffers(doc, baseUrl) {
    var cards = doc.querySelectorAll('a.search-offer-item')
    var seen = {}
    var out = []
    for (var i = 0; i < cards.length && out.length < MAX_OFFERS; i++) {
      var card = cards[i]
      var ref = offerIdAndUrl(card.getAttribute('href') || '', baseUrl || 'https://s.1688.com/')
      if (!ref || seen[ref.id]) continue
      var price = parsePrice(card)
      var title = spacedText(card.querySelector('.offer-title-row .title-text') || card.querySelector('.title-text'))
      if (price === null || !title) continue
      seen[ref.id] = true
      var noteEl = card.querySelector('.offer-price-row .col-desc .offer-desc-item .desc-text')
      var salesEl = card.querySelector('.offer-price-row .col-desc_after .desc-text')
      var shopEl = card.querySelector('.offer-shop-row .col-left .desc-text') || card.querySelector('.offer-shop-row .desc-text')
      out.push({
        id: ref.id,
        url: ref.url,
        title: clean(title, 200),
        priceCny: price,
        priceNote: clean(noteEl && noteEl.textContent, 60),
        sales: clean(salesEl && salesEl.textContent, 60),
        shop: clean(shopEl && shopEl.textContent, 80),
        imageUrl: parseImage(card),
      })
    }
    return out
  }

  /**
   * Что сейчас на странице: results (есть карточки), captcha (проверка «ползунок»), empty (сайт
   * сам пишет, что ничего не нашёл), loading (ещё рисуется или страница незнакомая). Признаки проверки: адрес с punish/_____tmd_____ или известные контейнеры.
   */
  function detectState(doc, url) {
    if (doc.querySelectorAll('a.search-offer-item').length > 0) return 'results'
    var u = String(url || '')
    if (/punish|_____tmd_____/i.test(u)) return 'captcha'
    if (doc.querySelector('#nc_1_wrapper, .nc-container, #baxia-dialog-content, .J_MIDDLEWARE_FRAME_WIDGET, iframe[src*="punish"], #nocaptcha')) return 'captcha'
    var text = String((doc.body && doc.body.textContent) || '').slice(0, 30000)
    if (/slide to verify|Sorry, we have detected unusual traffic|请按住滑块|拖动下方滑块/i.test(text)) return 'captcha'
    // Явная фраза сайта «ничего не найдено» (русская, английская и китайская версии интерфейса).
    if (/ничего не найден|не найдено ни одного|по вашему запросу.{0,40}не найден|no results found|没有找到相关|未找到相关/i.test(text)) return 'empty'
    return 'loading'
  }

  var api = { extractOffers: extractOffers, detectState: detectState, MAX_OFFERS: MAX_OFFERS }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.IK1688Scrape = api
})(typeof self !== 'undefined' ? self : globalThis)
