// Фоновый скрипт расширения. Принимает от моста запрос на поиск, открывает вкладку поиска 1688,
// следит за ней и возвращает результаты. Состояние хранится в storage.session: сервис-воркер
// Chrome засыпает через 30 секунд без событий, а поиск с проверкой «ползунок» идёт дольше.
importScripts('gbk.js', 'core.js')

var Core = self.IK1688Core
var Gbk = self.IK1688Gbk

var PENDING_KEY = 'ik1688_pending'
var LAST_KEY = 'ik1688_last_start'
var HISTORY_KEY = 'ik1688_history'
var MIN_GAP_MS = 3000
var TIMEOUT_MS = 180000
var ALARM = 'ik1688-timeout'
var HOUR_MS = 3600000
var MAX_PER_HOUR = 20

async function getPending() {
  var r = await chrome.storage.session.get(PENDING_KEY)
  return r[PENDING_KEY] || {}
}
async function setPending(p) { await chrome.storage.session.set({ [PENDING_KEY]: p }) }

function emit(bridgeTabId, requestId, payload) {
  return chrome.tabs.sendMessage(bridgeTabId, Object.assign({ type: 'ik:event', requestId: requestId }, payload)).catch(function () {})
}

/** Закончить поиск. Вкладку страницы активируем только если мы сами показывали вкладку 1688. */
async function finish(tabId, payload, closeTab) {
  var pending = await getPending()
  var p = pending[tabId]
  if (!p) return
  delete pending[tabId]
  await setPending(pending)
  await emit(p.bridgeTabId, p.requestId, payload)
  if (closeTab) await chrome.tabs.remove(Number(tabId)).catch(function () {})
  if (p.shown) await chrome.tabs.update(p.bridgeTabId, { active: true }).catch(function () {})
}

/** Показать вкладку 1688 человеку (проверка, догрузка списка, непонятная страница). */
async function show(tabId) {
  var pending = await getPending()
  if (pending[tabId]) { pending[tabId].shown = true; await setPending(pending) }
  await chrome.tabs.update(Number(tabId), { active: true }).catch(function () {})
}

// Проверки «не занято» и «не чаще» и открытие вкладки идут строго по одному: иначе два сообщения
// подряд оба увидят пустое состояние и откроют по вкладке.
var chain = Promise.resolve()
function serial(fn) {
  var run = chain.then(fn, fn)
  chain = run.catch(function () {})
  return run
}

async function startSearch(msg, sender) {
  var tab = sender.tab
  if (!tab || !Core.isAllowedPage(sender.url || tab.url)) return
  var requestId = msg.requestId
  if (!Core.isRequestId(requestId)) return
  var fail = function (reason) { return emit(tab.id, requestId, { status: 'error', reason: reason }) }

  var queries = Core.validateQueries(msg.queries)
  if (!queries) return fail('bad_request')

  var pending = await getPending()
  var now = Date.now()
  for (var id in pending) {
    if (now - pending[id].startedAt < TIMEOUT_MS) return fail('busy')
    // Забытая запись (поиск давно умер): закрываем её вкладку, чтобы она не висела.
    await chrome.tabs.remove(Number(id)).catch(function () {})
    delete pending[id]
  }
  var stored = await chrome.storage.session.get([LAST_KEY, HISTORY_KEY])
  if (now - (stored[LAST_KEY] || 0) < MIN_GAP_MS) return fail('too_fast')
  var history = (stored[HISTORY_KEY] || []).filter(function (t) { return now - t < HOUR_MS })
  if (history.length >= MAX_PER_HOUR) return fail('hourly_limit')

  var url = Core.buildSearchUrl(queries[0], Gbk.encodeGbk)
  if (!url) return fail('bad_request')

  var created = await chrome.tabs.create({ url: url, active: false }).catch(function () { return null })
  if (!created || created.id === undefined) return fail('cannot_open')
  history.push(now)
  pending[created.id] = { requestId: requestId, bridgeTabId: tab.id, startedAt: now, shown: false }
  await setPending(pending)
  await chrome.storage.session.set({ [LAST_KEY]: now, [HISTORY_KEY]: history })
  await chrome.alarms.create(ALARM, { delayInMinutes: TIMEOUT_MS / 60000 })
  await emit(tab.id, requestId, { status: 'started' })
}

/** Страница отменила поиск (ушла, закрыла блок): закрываем вкладку и снимаем регистрацию. */
async function cancelSearch(msg, sender) {
  var tab = sender.tab
  if (!tab || !Core.isAllowedPage(sender.url || tab.url) || !Core.isRequestId(msg.requestId)) return
  var pending = await getPending()
  for (var id in pending) {
    if (pending[id].requestId === msg.requestId && pending[id].bridgeTabId === tab.id) {
      delete pending[id]
      await setPending(pending)
      await chrome.tabs.remove(Number(id)).catch(function () {})
    }
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== 'string') return false
  var tabId = sender.tab && sender.tab.id

  if (msg.type === 'ik:search') {
    serial(function () { return startSearch(msg, sender) }).then(function () { sendResponse({ ok: true }) }, function () { sendResponse({ ok: false }) })
    return true
  }
  if (msg.type === 'ik:cancel') {
    serial(function () { return cancelSearch(msg, sender) }).then(function () { sendResponse({ ok: true }) }, function () { sendResponse({ ok: false }) })
    return true
  }

  // Остальные сообщения идут от скрипта во вкладке 1688, которую открыли мы.
  if (tabId === undefined || !/^https:\/\/s\.1688\.com\//.test(sender.url || '')) return false
  getPending().then(async function (pending) {
    var p = pending[tabId]
    if (!p) { sendResponse({ ok: false }); return }
    if (msg.type === 'ik:scrape-hello') {
      sendResponse({ ok: true })
    } else if (msg.type === 'ik:scrape-state' && msg.state === 'captcha') {
      // Проверку проходит человек: показываем вкладку 1688 и говорим странице.
      await show(tabId)
      await emit(p.bridgeTabId, p.requestId, { status: 'captcha' })
      sendResponse({ ok: true })
    } else if (msg.type === 'ik:scrape-attention') {
      // Страница не показала ни карточек, ни проверки (вход, другая страница, смена вёрстки): зовём человека.
      await show(tabId)
      await emit(p.bridgeTabId, p.requestId, { status: 'attention' })
      sendResponse({ ok: true })
    } else if (msg.type === 'ik:scrape-need-visible') {
      await show(tabId)
      sendResponse({ ok: true })
    } else if (msg.type === 'ik:scrape-results') {
      await finish(tabId, { status: 'results', items: Core.sanitizeItems(msg.items) }, true)
      sendResponse({ ok: true })
    } else if (msg.type === 'ik:scrape-fail') {
      var reason = msg.reason === 'unreadable' ? 'unreadable' : 'timeout'
      await finish(tabId, { status: 'error', reason: reason }, true)
      sendResponse({ ok: true })
    } else {
      sendResponse({ ok: false })
    }
  })
  return true
})

// Вкладку 1688 закрыли руками: сообщаем странице, чтобы она не ждала зря.
chrome.tabs.onRemoved.addListener(function (tabId) {
  getPending().then(function (pending) {
    if (pending[tabId]) return finish(tabId, { status: 'error', reason: 'tab_closed' }, false)
  })
})

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name !== ALARM) return
  getPending().then(async function (pending) {
    var now = Date.now()
    for (var id in pending) {
      if (now - pending[id].startedAt >= TIMEOUT_MS) await finish(id, { status: 'error', reason: 'timeout' }, true)
    }
  })
})
