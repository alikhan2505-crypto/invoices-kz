// Мост между страницей invoices.kz и расширением. Страница шлёт window.postMessage, мост
// передаёт запрос фоновому скрипту и возвращает события обратно. Мост ничего не выполняет по
// просьбе страницы, кроме поиска по списку китайских слов: сам адрес 1688 строит фоновый скрипт.
(function () {
  'use strict'
  var HOSTS = ['invoices.kz', 'kaspi.invoices.kz']
  if (HOSTS.indexOf(location.hostname) < 0 || window.top !== window) return
  var VERSION = chrome.runtime.getManifest().version

  // После обновления расширения в уже открытой вкладке остаётся «осиротевший» мост: его window-слушатель
  // жив, а chrome.runtime мёртв. Такой мост не отвечает на проверку, а запросы заканчивает ошибкой.
  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id) } catch (e) { return false }
  }

  function post(payload) {
    window.postMessage(Object.assign({ source: 'invoices-kz-ext' }, payload), location.origin)
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin) return
    var d = e.data
    if (!d || typeof d !== 'object' || d.source !== 'invoices-kz-page') return
    var id = typeof d.id === 'string' ? d.id : ''
    if (d.type === 'ik1688:ping') {
      if (alive()) post({ type: 'ik1688:pong', version: VERSION })
    } else if (d.type === 'ik1688:search') {
      // Поиск открывает вкладку 1688: только по настоящему клику человека, не по скрипту страницы.
      var act = navigator.userActivation
      if (act && !act.isActive) { post({ type: 'ik1688:event', id: id, status: 'error', reason: 'no_gesture' }); return }
      var queries = Array.isArray(d.queries) ? d.queries.slice(0, 3) : []
      try {
        chrome.runtime.sendMessage({ type: 'ik:search', requestId: id, queries: queries }).catch(function () {
          post({ type: 'ik1688:event', id: id, status: 'error', reason: 'extension_unavailable' })
        })
      } catch (err) {
        post({ type: 'ik1688:event', id: id, status: 'error', reason: 'extension_unavailable' })
      }
    } else if (d.type === 'ik1688:cancel') {
      try { chrome.runtime.sendMessage({ type: 'ik:cancel', requestId: id }).catch(function () {}) } catch (err) { /* расширение обновили */ }
    }
  })

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'ik:event') return
    post({ type: 'ik1688:event', id: msg.requestId, status: msg.status, reason: msg.reason, items: msg.items })
  })

  if (alive()) post({ type: 'ik1688:pong', version: VERSION })
})()
