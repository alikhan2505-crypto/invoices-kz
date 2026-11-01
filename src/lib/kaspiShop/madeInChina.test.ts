import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchMic, micSearchUrl, parseMicSearch, presentSuppliers, resetMicState, MIC_MAX_ITEMS } from './madeInChina'

// Форма страницы взята из живого запроса 31.10.2026 (JSON-LD ItemList + ссылки на карточки);
// названия, поставщики и цены вымышленные.

const URL_ = 'https://www.made-in-china.com/products-search/hot-china-products/Wet_Wipes.html'
const IMG = (n: number) => `https://image.made-in-china.com/43f34j00abc${n}/Wet-Wipe-${n}.jpg`

interface P { name: string; supplier?: string; low?: unknown; high?: unknown; fixed?: unknown; image?: string; category?: string }

const product = (p: P, i: number) => ({
  '@type': 'ListItem',
  position: i + 1,
  item: {
    '@type': 'Product',
    category: p.category ?? 'Baby Wipes',
    image: p.image ?? IMG(i),
    name: p.name,
    url: `${URL_}#product-${i + 1}`,
    offers: 'fixed' in p
      ? { '@type': 'Offer', priceCurrency: 'USD', seller: { '@type': 'Organization', name: p.supplier ?? `Supplier ${i}` }, price: p.fixed }
      : { '@type': 'AggregateOffer', priceCurrency: 'USD', seller: { '@type': 'Organization', name: p.supplier ?? `Supplier ${i}` }, lowPrice: 'low' in p ? p.low : '0.1', highPrice: 'high' in p ? p.high : '0.5' },
  },
})

const linkFor = (name: string, id = 'AbC123') =>
  `<a class="prod-name" href="https://sup.en.made-in-china.com/product/${id}/China-${name.replace(/[^A-Za-z0-9]+/g, '-')}.html">x</a>`

/** Карточка выдачи как на странице: id="product-divN", cz-id товара, цена и минимальная партия. */
const card = (n: number, pid: string, prices: string[], moq?: [string, string]) =>
  `<div class="item" id="product-div${n}" data-x="1" cz-id="${pid}"><a href="https://sup.en.made-in-china.com/product/${pid}/China-Whatever-Title.html">t</a>`
  + `<strong class="price">US$${prices.map(x => `<span>${x}</span>`).join('-')}</strong>`
  + (moq ? `<div><span\n class="attribute"><span> ${moq[0]} ${moq[1]}</span> </span> <span class="moq-text">(MOQ)</span></div>` : '')
  + `</div>`

const page = (ps: P[], opts: { links?: string; extra?: string } = {}) => `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify([{ '@type': 'VideoObject', name: 'v' }, { '@type': 'ItemList', name: 'Wet Wipes', itemListElement: ps.map(product) }])}</script>
</head><body>${opts.links ?? ''}${opts.extra ?? ''}<!--${'x'.repeat(1200)}--></body></html>`

describe('micSearchUrl', () => {
  it('слова с заглавной буквы через подчёркивание', () => {
    expect(micSearchUrl('wet wipes')).toBe('https://www.made-in-china.com/products-search/hot-china-products/Wet_Wipes.html')
    expect(micSearchUrl('  Baby-WIPES 80pcs ')).toBe('https://www.made-in-china.com/products-search/hot-china-products/Baby_Wipes_80pcs.html')
  })
  it('не больше пяти слов, без символов пути и запроса', () => {
    expect(micSearchUrl('a b c d e f g')).toBe('https://www.made-in-china.com/products-search/hot-china-products/A_B_C_D_E.html')
    const u = micSearchUrl('../../etc/passwd?x=1#y')
    expect(u).toBe('https://www.made-in-china.com/products-search/hot-china-products/Etc_Passwd_X_1_Y.html')
  })
  it.each([[''], ['   '], ['湿巾'], ['---'], ['a'.repeat(61)]])('непригодный запрос %j даёт null', q => {
    expect(micSearchUrl(q)).toBeNull()
  })
})

describe('parseMicSearch', () => {
  it('товар: имя, фото, поставщик, диапазон цены и партия из карточки, ссылка по id товара', () => {
    const name = 'Best Quality Baby Wet Wipes'
    const r = parseMicSearch(page([{ name, supplier: 'Hangzhou Co., Ltd.', low: '0.3', high: '0.29' }], { links: card(1, 'Zz9', ['0.18', '0.3'], ['10,000', 'Bags']) }), URL_)
    expect(r).toHaveLength(1)
    expect(r![0]).toMatchObject({
      name, supplier: 'Hangzhou Co., Ltd.', category: 'Baby Wipes', lowUsd: 0.18, highUsd: 0.3, rangeVerified: true,
      moqQty: 10000, moqUnit: 'Bags', exact: true,
      url: 'https://sup.en.made-in-china.com/product/Zz9/China-Whatever-Title.html',
    })
    expect(r![0].imageUrl.startsWith('https://image.made-in-china.com/')).toBe(true)
  })
  it('верхняя цена карточки расходится с JSON-LD больше чем на 1%: карточку не принимаем, ссылка по названию', () => {
    const name = 'Mismatch Wipes'
    const r = parseMicSearch(page([{ name, low: '0.1', high: '0.5' }], { links: card(1, 'Qq1', ['0.2', '0.9'], ['500', 'Pieces']) + linkFor(name, 'Nn2') }), URL_)!
    expect(r[0]).toMatchObject({ lowUsd: 0.5, highUsd: 0.5, rangeVerified: false, moqQty: null, moqUnit: null, exact: true })
    expect(r[0].url).toContain('/product/Nn2/')
  })
  it('нижняя граница JSON-LD неверна, карточка права: берём нижнюю из карточки', () => {
    const html = page([{ name: 'Phone Holder Pro', low: '1.8', high: '1.85' }]).replace('<!--', card(1, 'Pp7', ['0.55', '1.85'], ['500', 'Pieces']) + '<!--')
    expect(parseMicSearch(html, URL_)![0]).toMatchObject({ lowUsd: 0.55, highUsd: 1.85, rangeVerified: true, moqQty: 500, moqUnit: 'Pieces' })
  })
  it('фиксированная цена (Offer с price) не теряется', () => {
    const r = parseMicSearch(page([{ name: 'Fixed Price Holder', fixed: '2.85' }]), URL_)!
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ lowUsd: 2.85, highUsd: 2.85, rangeVerified: true })
  })
  it('список есть, а ни один товар не разобран: null (не знаем), а не «ничего не нашлось»', () => {
    expect(parseMicSearch(page([{ name: 'No Price', low: null, high: null }]), URL_)).toBeNull()
    expect(parseMicSearch(page([{ name: 'Bad Image', image: 'https://evil.example/a.jpg' }]), URL_)).toBeNull()
  })
  it('нет ссылки на карточку: ссылка на выдачу и exact:false, адрес не выдумывается', () => {
    const r = parseMicSearch(page([{ name: 'Orphan Wipes' }]), URL_)
    expect(r![0]).toMatchObject({ url: URL_, exact: false })
    const byName = parseMicSearch(page([{ name: 'Orphan Wipes' }], { links: linkFor('Orphan Wipes', 'Oo3') }), URL_)
    expect(byName![0]).toMatchObject({ exact: true })
  })
  it('ссылка с чужим названием не подставляется', () => {
    const r = parseMicSearch(page([{ name: 'Orphan Wipes' }], { links: linkFor('Something Else Entirely') }), URL_)
    expect(r![0].exact).toBe(false)
  })
  it('без карточки надёжна только верхняя цена: low и high равны ей, rangeVerified false; нулевая и мусорная отбрасывают товар', () => {
    const r = parseMicSearch(page([
      { name: 'Swapped Wipes', low: '0.56', high: '0.16' },
      { name: 'Only High Wipes', low: undefined, high: '2' },
      { name: 'Zero Wipes', low: '0', high: '0' },
      { name: 'Junk Wipes', low: 'abc', high: null },
    ]), URL_)!
    expect(r.map(i => i.name)).toEqual(['Swapped Wipes', 'Only High Wipes'])
    expect([r[0].lowUsd, r[0].highUsd, r[0].rangeVerified]).toEqual([0.56, 0.56, false])
    expect([r[1].lowUsd, r[1].highUsd, r[1].rangeVerified]).toEqual([2, 2, false])
  })
  it('фото только с image.made-in-china.com по https, без пробелов', () => {
    const r = parseMicSearch(page([
      { name: 'Good Wipes' },
      { name: 'Http Wipes', image: 'http://image.made-in-china.com/a.jpg' },
      { name: 'Foreign Wipes', image: 'https://evil.example/a.jpg' },
      { name: 'Space Wipes', image: 'https://image.made-in-china.com/a b.jpg' },
      { name: 'Js Wipes', image: 'javascript:alert(1)' },
    ]), URL_)!
    expect(r.map(i => i.name)).toEqual(['Good Wipes'])
  })
  it('не больше трёх товаров одного поставщика и не больше лимита всего, дубли названий отбрасываются', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Wipe Model ${i}`, supplier: `Sup ${Math.floor(i / 2)}` }))
    const r = parseMicSearch(page(many), URL_)!
    expect(r).toHaveLength(MIC_MAX_ITEMS)
    const same = parseMicSearch(page([
      { name: 'A Wipe', supplier: 'S1' }, { name: 'B Wipe', supplier: 'S1' }, { name: 'C Wipe', supplier: 'S1' },
      { name: 'D Wipe', supplier: 'S1' }, { name: 'A Wipe', supplier: 'S2' },
    ]), URL_)!
    expect(same.map(i => i.name)).toEqual(['A Wipe', 'B Wipe', 'C Wipe'])
  })
  it('html-сущности в названии и поставщике', () => {
    const r = parseMicSearch(page([{ name: 'Baby&apos;s Soft &amp; Safe Wipes', supplier: 'A &amp; B Co.' }]), URL_)!
    expect(r[0].name).toBe("Baby's Soft & Safe Wipes")
    expect(r[0].supplier).toBe('A & B Co.')
  })
  it('явная фраза сайта «ничего не найдено»: пусто, а не «не знаем»', () => {
    const html = `<html><body>Sorry! No matches were found for "Xyz"<!--${'x'.repeat(1200)}--></body></html>`
    expect(parseMicSearch(html, URL_)).toEqual([])
  })
  it.each([[undefined], [null], [''], ['<html></html>'], [`<html>${'x'.repeat(2000)}</html>`]])(
    'незнакомая форма %j даёт null, а не «пусто»', v => { expect(parseMicSearch(v, URL_)).toBeNull() })
  it('битый JSON-LD пропускается, следующий блок читается', () => {
    const good = page([{ name: 'Fine Wipes' }])
    const html = good.replace('<head>', '<head><script type="application/ld+json">{broken</script>')
    expect(parseMicSearch(html, URL_)![0].name).toBe('Fine Wipes')
  })
})

describe('presentSuppliers', () => {
  const mic = { status: 'ok' as const, searchUrl: URL_, items: [{ name: 'X Wipes', imageUrl: IMG(1), supplier: 'S', category: '', lowUsd: 0.1, highUsd: 0.5, rangeVerified: true, moqQty: 500, moqUnit: 'Pieces', url: URL_, exact: false }] }
  it('считает тенге по курсу и округляет', () => {
    const p = presentSuppliers(mic, 'wet wipes', 500)
    expect(p.items[0]).toMatchObject({ lowKzt: 50, highKzt: 250 })
    expect(p.usdKzt).toBe(500)
    expect(p.status).toBe('ok')
  })
  it('нет курса: тенге null, а не выдуманные', () => {
    for (const rate of [null, 0, -1, NaN]) {
      const p = presentSuppliers(mic, 'wet wipes', rate)
      expect(p.items[0].lowKzt).toBeNull()
      expect(p.items[0].highKzt).toBeNull()
      expect(p.usdKzt).toBeNull()
    }
  })
  it('недоступно: пустой список и статус', () => {
    const p = presentSuppliers({ status: 'unavailable', searchUrl: URL_ }, 'wet wipes', 500)
    expect(p).toMatchObject({ status: 'unavailable', items: [], searchUrl: URL_ })
  })
})

// ---- сеть ----

const html = (ps: P[] = [{ name: 'Net Wipes' }]) => page(ps)
const ok = async (b = html()) => new Response(b, { status: 200 })

describe('fetchMic', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetMicState()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('MIC_MIN_INTERVAL_MS', '0')
    vi.stubEnv('MIC_SEARCH_DISABLED', '')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('успех: товары, честный User-Agent, адрес только на made-in-china.com', async () => {
    fetchMock.mockImplementation(async () => ok())
    const r = await fetchMic('wet wipes')
    expect(r).toMatchObject({ status: 'ok', searchUrl: URL_ })
    expect(r!.status === 'ok' && r!.items).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(URL_)
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/invoices\.kz/)
  })
  it('второй такой же запрос берётся из кэша', async () => {
    fetchMock.mockImplementation(async () => ok())
    await fetchMic('wet wipes')
    await fetchMic('Wet  Wipes')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('непригодный запрос и выключатель: null, сети нет', async () => {
    expect(await fetchMic('湿巾')).toBeNull()
    vi.stubEnv('MIC_SEARCH_DISABLED', '1')
    expect(await fetchMic('wet wipes')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('не 200 и исключение: unavailable и не кэшируется (две неудачи ещё не пауза)', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 503 }))
    expect((await fetchMic('wet wipes'))!.status).toBe('unavailable')
    fetchMock.mockImplementationOnce(async () => { throw new Error('boom') })
    expect((await fetchMic('wet wipes'))!.status).toBe('unavailable')
    fetchMock.mockImplementation(async () => ok())
    expect((await fetchMic('wet wipes'))!.status).toBe('ok')
  })
  it('незнакомая форма страницы: unavailable, а не «ничего не нашлось»', async () => {
    fetchMock.mockImplementation(async () => ok(`<html>${'x'.repeat(2000)}</html>`))
    expect((await fetchMic('wet wipes'))!.status).toBe('unavailable')
  })
  it('редирект на чужой сайт: unavailable', async () => {
    fetchMock.mockImplementation(async () => {
      const res = new Response(html(), { status: 200 })
      Object.defineProperty(res, 'url', { value: 'https://evil.example/x' })
      return res
    })
    expect((await fetchMic('wet wipes'))!.status).toBe('unavailable')
  })
  it('слишком большой ответ: unavailable', async () => {
    fetchMock.mockImplementation(async () => new Response('x'.repeat(3_000_001), { status: 200 }))
    expect((await fetchMic('wet wipes'))!.status).toBe('unavailable')
  })
  it('после трёх сбоев подряд пауза: сеть не трогаем', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
    for (const q of ['a one', 'b two', 'c three']) await fetchMic(q)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect((await fetchMic('d four'))!.status).toBe('unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
