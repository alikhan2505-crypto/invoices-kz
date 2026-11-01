// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { encodeGbkQuery, build1688SearchUrl } from '../../src/lib/kaspiShop/source1688'

// Расширение написано обычными скриптами (без сборки), поэтому подключаем их как CommonJS.
// В живой странице магазин лежит во вложенной ссылке <a>, но её строит скрипт сайта; разбор HTML-строки
// вложенные <a> разрывает, поэтому в фикстуре там <div> (селекторы от тега не зависят).
// Разметка карточек повторяет живую страницу s.1688.com 01.11.2026; названия и магазины вымышленные.
const req = createRequire(import.meta.url)
const core = req('./core.js') as {
  isAllowedPage: (u: string) => boolean
  isRequestId: (id: unknown) => boolean
  validateQueries: (q: unknown) => string[] | null
  buildSearchUrl: (q: string, enc: (t: string) => string | null) => string | null
  sanitizeItems: (items: unknown) => { id: string; url: string; title: string; priceCny: number; imageUrl: string }[]
}
const gbk = req('./gbk.js') as { encodeGbk: (t: string) => string | null }
const scrape = req('./scrape-core.js') as {
  extractOffers: (doc: Document, base?: string) => Record<string, unknown>[]
  detectState: (doc: Document, url: string) => string
}

const card = (o: { id?: string; href?: string; main?: string; dec?: string; note?: string; sales?: string; shop?: string; title?: string; img?: string; noPrice?: boolean }) => `
<a target="_blank" class="search-offer-wrapper cardui-normal search-offer-item major-offer" href="${o.href ?? `https://detail.1688.com/offer/${o.id ?? '1070470662204'}.html?spm=a26352.13672862&cosite=x`}">
  <div class="offer-img-wrapper"><div class="offer-img-inner"><img class="main-img" src="${o.img ?? 'https://cbu01.alicdn.com/img/ibank/O1CN014pqtiW1lQPNmPkL3H_!!2200786054813-0-cib.jpg_460x460q100.jpg_.webp'}"></div></div>
  <div class="offer-title-row"><div class="title-text"><div>${o.title ?? 'для детей<font color="red">влажные салфетки</font>Специальные салфетки для рук 80 штук'}</div></div></div>
  ${o.noPrice ? '' : `<div class="offer-price-row"><div class="col-desc"><div class="price-item"><div class="price-units">¥</div><div class="text-main">${o.main ?? '1'}</div><div>${o.dec ?? '.18'}</div></div>${o.note ? `<div class="offer-desc-item"><div class="desc-text">${o.note}</div></div>` : ''}</div><div class="col-desc_after"><div class="offer-desc-item"><div class="desc-text">${o.sales ?? '10 000+ товаров'}</div></div></div></div>`}
  <div class="offer-shop-row"><div class="col-left"><div class="offer-desc-item"><img class="desc-icon" src="https://img.alicdn.com/icon.png"><div class="desc-text">${o.shop ?? 'Иу Цзяян Ежедневные Товары Лтд.'}</div></div></div></div>
</a>`

const doc = (html: string) => { document.body.innerHTML = html; return document }

describe('extractOffers', () => {
  it('карточка: id и чистый адрес товара, название с пробелами вокруг подсветки, цена из частей, продажи, магазин, фото', () => {
    const r = scrape.extractOffers(doc(card({})), 'https://s.1688.com/selloffer/offer_search.htm')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      id: '1070470662204',
      url: 'https://detail.1688.com/offer/1070470662204.html',
      title: 'для детей влажные салфетки Специальные салфетки для рук 80 штук',
      priceCny: 1.18,
      priceNote: '',
      sales: '10 000+ товаров',
      shop: 'Иу Цзяян Ежедневные Товары Лтд.',
    })
    expect(String(r[0].imageUrl)).toMatch(/^https:\/\/cbu01\.alicdn\.com\//)
  })
  it('цена целая и с примечанием «за упаковку»', () => {
    const r = scrape.extractOffers(doc(card({ main: '5', dec: '.01', note: '¥1.26 за упаковку' })))
    expect(r[0]).toMatchObject({ priceCny: 5.01, priceNote: '¥1.26 за упаковку' })
    const big = scrape.extractOffers(doc(card({ main: '1 234', dec: '.50' })))
    expect(big[0].priceCny).toBe(1234.5)
  })
  it('без цены (реклама), без ссылки на товар и чужой адрес пропускаются, повторы по id отбрасываются', () => {
    const html = card({ id: '111111111111', noPrice: true })
      + card({ href: 'https://evil.example/offer/222222222222.html' })
      + card({ href: 'https://detail.1688.com/shop/view.html' })
      + card({ id: '333333333333' }) + card({ id: '333333333333' }) + card({ id: '444444444444' })
    const r = scrape.extractOffers(doc(html))
    expect(r.map(o => o.id)).toEqual(['333333333333', '444444444444'])
  })
  it('фото только https с alicdn.com, иначе пусто (карточка остаётся)', () => {
    const r = scrape.extractOffers(doc(
      card({ id: '555555555555', img: 'http://cbu01.alicdn.com/a.jpg' }) + card({ id: '666666666666', img: 'https://evil.example/a.jpg' })
      + card({ id: '777777777777', img: 'javascript:alert(1)' })))
    expect(r.map(o => o.imageUrl)).toEqual(['', '', ''])
  })
  it('не больше 30 предложений', () => {
    const many = Array.from({ length: 45 }, (_, i) => card({ id: String(100000000000 + i) })).join('')
    expect(scrape.extractOffers(doc(many))).toHaveLength(30)
  })
  it('вёрстка поменялась (нет карточек): пустой список, а не исключение', () => {
    expect(scrape.extractOffers(doc('<div class="new-card">...</div>'))).toEqual([])
  })
})

describe('detectState', () => {
  it('карточки есть: results, даже если рядом остался блок проверки', () => {
    expect(scrape.detectState(doc(card({}) + '<div id="nc_1_wrapper"></div>'), 'https://s.1688.com/selloffer/offer_search.htm')).toBe('results')
  })
  it.each([
    ['<div id="nc_1_wrapper"></div>', 'https://s.1688.com/selloffer/offer_search.htm'],
    ['<div id="baxia-dialog-content"></div>', 'https://s.1688.com/selloffer/offer_search.htm'],
    ['<p>ok</p>', 'https://s.1688.com/_____tmd_____/punish'],
    ['<p>Sorry, we have detected unusual traffic from your network</p>', 'https://s.1688.com/selloffer/offer_search.htm'],
  ])('проверка «ползунок» %#', (html, url) => {
    expect(scrape.detectState(doc(html), url)).toBe('captcha')
  })
  it.each([
    'По вашему запросу ничего не найдено',
    'Nothing here. No results found for your query',
    '没有找到相关商品',
  ])('сайт сам пишет, что ничего нет: empty (%s)', text => {
    expect(scrape.detectState(doc(`<div>${text}</div>`), 'https://s.1688.com/selloffer/offer_search.htm')).toBe('empty')
  })
  it('пока ничего нет: loading', () => {
    expect(scrape.detectState(doc('<div id="root"></div>'), 'https://s.1688.com/selloffer/offer_search.htm')).toBe('loading')
  })
})

describe('запрос и кодировка', () => {
  it.each([['湿巾'], ['婴儿湿巾 80抽'], ['abc-123'], ['中']])('GBK совпадает с серверной реализацией: %s', t => {
    expect(gbk.encodeGbk(t)).toBe(encodeGbkQuery(t))
  })
  it('символ вне GBK: null, как на сервере', () => {
    expect(gbk.encodeGbk('湿巾😀')).toBeNull()
  })
  it('адрес поиска совпадает с серверным build1688SearchUrl', () => {
    expect(core.buildSearchUrl('湿巾', gbk.encodeGbk)).toBe(build1688SearchUrl('湿巾'))
  })
  it('адрес не строится из присланного страницей: слова без иероглифов и с управляющими символами отклоняются', () => {
    expect(core.validateQueries(['湿巾'])).toEqual(['湿巾'])
    expect(core.validateQueries([' 湿巾 ', '婴儿湿巾'])).toEqual(['湿巾', '婴儿湿巾'])
    for (const bad of [
      [], 'x', null, undefined, ['wet wipes'], ['https://evil.example'], ['湿\n巾'], ['湿巾\u0000'], ['湿\u0001巾'], [123], ['湿'.repeat(41)], [''],
      ['湿巾', '湿巾', '湿巾', '湿巾'],
    ]) expect(core.validateQueries(bad)).toBeNull()
  })
  it('какие страницы вправе просить поиск', () => {
    expect(core.isAllowedPage('https://invoices.kz/kaspi-shop/margin')).toBe(true)
    expect(core.isAllowedPage('https://kaspi.invoices.kz/x')).toBe(true)
    for (const u of ['http://invoices.kz/', 'https://evil.example/', 'https://invoices.kz.evil.example/', 'https://www.invoices.kz/', 'about:blank', '']) {
      expect(core.isAllowedPage(u)).toBe(false)
    }
  })
  it('идентификатор запроса', () => {
    expect(core.isRequestId('ik-abc_123')).toBe(true)
    for (const id of ['', 'a b', 'a/b', 'x'.repeat(65), 5, null, undefined]) expect(core.isRequestId(id)).toBe(false)
  })
})

describe('sanitizeItems (то, что уходит странице)', () => {
  it('оставляет ожидаемые поля и типы, отбрасывает мусор и ограничивает 30', () => {
    const good = { id: '123456789012', url: 'https://detail.1688.com/offer/123456789012.html', title: 'Товар', priceCny: 2.5, priceNote: '', sales: '', shop: '', imageUrl: '' }
    const r = core.sanitizeItems([good, null, 5, { ...good, id: 'abc' }, { ...good, priceCny: -1 }, { ...good, priceCny: 'x' }, { ...good, extra: 'x'.repeat(10), title: 5 }])
    expect(r.map(o => o.id)).toEqual(['123456789012', '123456789012'])
    expect(r[1].title).toBe('')
    expect(Object.keys(r[0]).sort()).toEqual(['id', 'imageUrl', 'priceCny', 'priceNote', 'sales', 'shop', 'title', 'url'])
    expect(core.sanitizeItems('x')).toEqual([])
    expect(core.sanitizeItems(Array.from({ length: 50 }, () => good))).toHaveLength(30)
  })
})
