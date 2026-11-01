// Работает во вкладке поиска 1688, которую открыло само расширение (остальные вкладки 1688
// не трогает: фоновый скрипт отвечает «не твоя вкладка»). Ждёт, пока страница нарисует карточки,
// при проверке «ползунок» просит показать вкладку человеку и ждёт, затем отдаёт результаты.
(function () {
  'use strict'
  if (window.top !== window || !self.IK1688Scrape) return

  var TOTAL_TIMEOUT_MS = 170000
  var TICK_MS = 700
  var STABLE_TICKS = 2
  var ENOUGH_CARDS = 12
  var ATTENTION_MS = 15000

  function send(type, data) {
    return chrome.runtime.sendMessage(Object.assign({ type: type }, data || {})).catch(function () { return null })
  }

  // Фоновый скрипт регистрирует вкладку сразу после её создания; на быстрой странице наш «привет» мог прийти раньше.
  // Поэтому несколько попыток, а чужие вкладки 1688 (открытые самим человеком) после них остаются нетронутыми.
  function hello(attempt) {
    return send('ik:scrape-hello').then(function (r) {
      if (r && r.ok) return r
      if (attempt >= 5) return null
      return new Promise(function (resolve) { setTimeout(resolve, 400) }).then(function () { return hello(attempt + 1) })
    })
  }

  hello(0).then(function (hello) {
    if (!hello || !hello.ok) return
    var startedAt = Date.now()
    var reportedCaptcha = false
    var reportedAttention = false
    var askedVisible = false
    var lastCount = -1
    var stable = 0

    function tick() {
      if (Date.now() - startedAt > TOTAL_TIMEOUT_MS) { send('ik:scrape-fail', { reason: 'timeout' }); return }
      var state = self.IK1688Scrape.detectState(document, location.href)
      if (state === 'captcha') {
        if (!reportedCaptcha) { reportedCaptcha = true; send('ik:scrape-state', { state: 'captcha' }) }
        lastCount = -1; stable = 0
      } else if (state === 'empty') {
        send('ik:scrape-results', { items: [] })
        return
      } else if (state === 'loading' && !reportedAttention && Date.now() - startedAt > ATTENTION_MS) {
        // Ни карточек, ни проверки за разумное время (вход, незнакомая страница, смена вёрстки): зовём человека.
        reportedAttention = true
        send('ik:scrape-attention')
      } else if (state === 'results') {
        var count = document.querySelectorAll('a.search-offer-item').length
        stable = count === lastCount ? stable + 1 : 0
        lastCount = count
        if (stable >= STABLE_TICKS) {
          if (count < ENOUGH_CARDS && !askedVisible) {
            // Мало карточек: фоновая вкладка не догружает список. Показываем её и листаем вниз.
            askedVisible = true; stable = 0
            send('ik:scrape-need-visible')
            window.scrollTo(0, document.body.scrollHeight)
          } else {
            var items = self.IK1688Scrape.extractOffers(document, location.href)
            if (items.length === 0) send('ik:scrape-fail', { reason: 'unreadable' })
            else send('ik:scrape-results', { items: items })
            return
          }
        }
      }
      setTimeout(tick, TICK_MS)
    }
    tick()
  })
})()
