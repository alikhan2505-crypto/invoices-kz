// Кодировка запроса для s.1688.com: 1688 принимает ключевые слова в процентной кодировке GBK.
// Та же логика, что в src/lib/kaspiShop/source1688.ts (encodeGbkQuery); совпадение двух
// реализаций проверяет тест extension/invoices-1688/ext.test.ts. Таблица строится один раз
// из декодера GBK самого браузера, отдельный пакет не нужен.
(function (root) {
  'use strict'
  var table = null
  var hex = function (n) { return '%' + n.toString(16).toUpperCase().padStart(2, '0') }

  function build() {
    if (table) return table
    var m = new Map()
    var dec = new TextDecoder('gbk')
    for (var hi = 0x81; hi <= 0xfe; hi++) {
      for (var lo = 0x40; lo <= 0xfe; lo++) {
        if (lo === 0x7f) continue
        var ch = dec.decode(new Uint8Array([hi, lo]))
        if (ch.length === 1 && ch !== '�' && !m.has(ch)) m.set(ch, hex(hi) + hex(lo))
      }
    }
    table = m
    return m
  }

  /** Строка в процентной кодировке GBK. null, если в ней есть символ, которого нет в GBK. */
  function encodeGbk(text) {
    var t = build()
    var out = ''
    for (var ch of text) {
      if (/^[A-Za-z0-9\-_.~]$/.test(ch)) out += ch
      else if (ch === ' ') out += '%20'
      else {
        var code = t.get(ch)
        if (code === undefined) return null
        out += code
      }
    }
    return out
  }

  var api = { encodeGbk: encodeGbk }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.IK1688Gbk = api
})(typeof self !== 'undefined' ? self : globalThis)
