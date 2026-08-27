(function () {
  'use strict';

  var scriptTag = document.currentScript;
  var widgetKey = scriptTag && scriptTag.getAttribute('data-key');
  if (!widgetKey) {
    console.error('invoices.kz widget: data-key attribute missing on the script tag');
    return;
  }

  var API_BASE = 'https://www.invoices.kz/api/ai-agent/widget';
  var STORAGE_KEY = 'invoiceskz_widget_visitor_id';
  var POLL_INTERVAL_MS = 5000;

  function getVisitorId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  var visitorId = getVisitorId();
  var since = null;
  var pollTimer = null;
  var isOpen = false;

  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483000;';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    '.bubble{width:56px;height:56px;border-radius:50%;background:#4f46e5;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);font-size:26px;display:flex;align-items:center;justify-content:center;}',
    '.panel{display:none;flex-direction:column;width:320px;height:440px;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,0.25);position:absolute;bottom:70px;right:0;overflow:hidden;font-family:system-ui,sans-serif;}',
    '.panel.open{display:flex;}',
    '.header{background:#4f46e5;color:#fff;padding:12px 14px;font-size:14px;font-weight:600;}',
    '.messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;}',
    '.msg{max-width:80%;padding:8px 10px;border-radius:10px;font-size:13px;line-height:1.4;white-space:pre-wrap;}',
    '.msg.in{align-self:flex-end;background:#4f46e5;color:#fff;}',
    '.msg.out{align-self:flex-start;background:#f1f1f4;color:#111;}',
    '.buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}',
    '.btn{border:1px solid #4f46e5;color:#4f46e5;background:#fff;border-radius:8px;padding:5px 9px;font-size:12px;cursor:pointer;}',
    '.inputRow{display:flex;border-top:1px solid #eee;padding:8px;gap:6px;}',
    '.inputRow input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}',
    '.inputRow button{background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;}',
  ].join('\n');
  root.appendChild(style);

  var bubble = document.createElement('button');
  bubble.className = 'bubble';
  bubble.textContent = '💬';
  root.appendChild(bubble);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML =
    '<div class="header">Чат с нами</div>' +
    '<div class="messages"></div>' +
    '<div class="inputRow"><input type="text" placeholder="Напишите сообщение…" /><button>➤</button></div>';
  root.appendChild(panel);

  var messagesEl = panel.querySelector('.messages');
  var inputEl = panel.querySelector('input');
  var sendBtn = panel.querySelector('.inputRow button');

  function renderMessage(m) {
    var row = document.createElement('div');
    row.className = 'msg ' + (m.direction === 'inbound' ? 'in' : 'out');
    row.textContent = m.text;
    messagesEl.appendChild(row);

    if (m.buttons && m.buttons.length > 0) {
      var wrap = document.createElement('div');
      wrap.className = 'buttons';
      m.buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = b.label;
        btn.onclick = function () { send(b.payload, true); };
        wrap.appendChild(btn);
      });
      messagesEl.appendChild(wrap);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function poll() {
    var url = API_BASE + '/messages?widgetKey=' + encodeURIComponent(widgetKey) + '&visitorId=' + encodeURIComponent(visitorId) + (since ? '&since=' + encodeURIComponent(since) : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var messages = data.messages || [];
      messages.forEach(function (m) {
        if (m.direction === 'outbound') renderMessage(m);
        since = m.createdAt;
      });
    }).catch(function () { /* transient network hiccup -- next tick retries */ });
  }

  function startPolling() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function send(text, isButtonClick) {
    if (!text) return;
    if (!isButtonClick) {
      renderMessage({ direction: 'inbound', text: text, buttons: null });
    }
    fetch(API_BASE + '/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetKey: widgetKey, visitorId: visitorId, text: text, isButtonClick: !!isButtonClick }),
    }).then(function () { poll(); }).catch(function () { /* the next scheduled poll still runs */ });
  }

  sendBtn.onclick = function () {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    send(text, false);
  };
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendBtn.onclick();
  });

  bubble.onclick = function () {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    if (isOpen) startPolling(); else stopPolling();
  };
})();
