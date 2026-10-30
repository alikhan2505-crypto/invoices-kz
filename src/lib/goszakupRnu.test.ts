import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRnu, parseRnuSearch, resetRnuState, rnuSourceUrl } from './goszakupRnu'

// Формы страниц взяты из живых запросов 30.10.2026; БИН и названия вымышленные
// (репозиторий публичный). Главное правило: любой сбой или незнакомая форма даёт null,
// а null никогда не становится «чисто».

const ID = '123456789012'

const page = (shown: string, rows: string) => `
<small><strong>${shown}</strong></small>
<table id="search-result" class="table"><thead><tr><th>№</th><th>Наименование недобросовестного участника</th><th>БИН/ИИН</th><th>ИНН/УНП</th></tr></thead>
<tbody>${rows}</tbody></table>`

const row = (n: string, name: string, id: string) =>
  `<tr><td nowrap="nowrap">${n}</td><td><a href="https://old.goszakup.gov.kz/ru/registry/rnu/1/${id}"> ${name} </a></td><td class="text-center">${id}</td><td></td></tr>`

const LISTED = page('Показано c 1 по 1 из 1 записей', row('1-290107', 'ИП Пример', ID))
const CLEAN = page('Показано c 1 по 0 из 0 записей', '')

describe('parseRnuSearch', () => {
  it('в реестре: одна запись', () => {
    expect(parseRnuSearch(LISTED, ID)).toEqual({ found: true, count: 1 })
  })
  it('нет в реестре: «из 0 записей» это found:false', () => {
    expect(parseRnuSearch(CLEAN, ID)).toEqual({ found: false, count: 0 })
  })
  it('несколько записей: число берётся из счётчика, не из строк на странице', () => {
    const html = page('Показано c 1 по 2 из 3 записей', row('1-1', 'ТОО А', ID) + row('1-2', 'ТОО Б', ID))
    expect(parseRnuSearch(html, ID)).toEqual({ found: true, count: 3 })
  })
  it('латинская «c» в счётчике, как на реальной странице', () => {
    expect(parseRnuSearch(page('Показано c 1 по 1 из 1 записей', row('1-1', 'X', ID)), ID)?.found).toBe(true)
    expect(parseRnuSearch(page('Показано с 1 по 1 из 1 записей', row('1-1', 'X', ID)), ID)?.found).toBe(true)
  })
  it('поиск по учредителю: БИН в строках другой, это допустимо', () => {
    const html = page('Показано c 1 по 1 из 1 записей', row('1-5', 'ТОО Чужое', '999999999999'))
    expect(parseRnuSearch(html, ID, 'head_biin')).toEqual({ found: true, count: 1 })
  })

  it.each([
    ['не строка', undefined],
    ['нет счётчика (капча, редирект, смена вёрстки)', '<html><body>Подтвердите, что вы не робот</body></html>'],
    ['фильтр проигнорирован: общий счётчик', page('Показано c 1 по 50 из 10000 записей', row('1-1', 'Кто-то', '999999999999'))],
    ['записи есть, а таблицы нет', '<strong>Показано c 1 по 1 из 1 записей</strong>'],
    ['записи есть, но в строках не наш БИН (форма не та)', page('Показано c 1 по 1 из 1 записей', row('1-1', 'Чужой', '999999999999'))],
    ['записи есть, но строк нет', page('Показано c 1 по 1 из 1 записей', '')],
  ])('незнакомая форма: %s даёт null, а не «чисто»', (_name, html) => {
    expect(parseRnuSearch(html, ID)).toBeNull()
  })
})

describe('rnuSourceUrl', () => {
  it('ссылка включает параметр smb=, без него портал игнорирует фильтр', () => {
    const u = rnuSourceUrl(ID)
    expect(u).toContain('smb=')
    expect(decodeURIComponent(u)).toContain(`filter[biin]=${ID}`)
    expect(decodeURIComponent(rnuSourceUrl(ID, 'head_biin'))).toContain(`filter[head_biin]=${ID}`)
  })
})

describe('fetchRnu', () => {
  const fetchMock = vi.fn()
  const html = (body: string, status = 200) => new Response(body, { status })

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.RNU_CHECK_DISABLED
    process.env.RNU_MIN_INTERVAL_MS = '0'
    resetRnuState()
  })
  afterEach(() => { delete process.env.RNU_MIN_INTERVAL_MS; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('в реестре и не в реестре', async () => {
    fetchMock.mockResolvedValueOnce(html(LISTED))
    expect(await fetchRnu(ID)).toEqual({ found: true, count: 1 })
    fetchMock.mockResolvedValueOnce(html(CLEAN))
    expect(await fetchRnu('210987654321')).toEqual({ found: false, count: 0 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(decodeURIComponent(String(url))).toContain(`filter[biin]=${ID}`)
    expect(String(url)).toContain('smb=')
    expect(init.headers['User-Agent']).toContain('invoices.kz')
  })

  it('режим по учредителю идёт в параметр head_biin', async () => {
    fetchMock.mockResolvedValueOnce(html(CLEAN))
    await fetchRnu(ID, 'head_biin')
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain(`filter[head_biin]=${ID}`)
  })

  it('сбои дают null: не 200, сеть, таймаут, незнакомая форма', async () => {
    fetchMock.mockResolvedValueOnce(html('err', 503))
    expect(await fetchRnu('111111111111')).toBeNull()
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
    expect(await fetchRnu('222222222222')).toBeNull()
    fetchMock.mockResolvedValueOnce(html('<html>капча</html>'))
    expect(await fetchRnu('333333333333')).toBeNull()
  })

  it('чужой формат ввода и выключатель: без запроса', async () => {
    expect(await fetchRnu('123')).toBeNull()
    process.env.RNU_CHECK_DISABLED = '1'
    expect(await fetchRnu(ID)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('удачный ответ живёт в памяти: второй показ без запроса', async () => {
    fetchMock.mockResolvedValue(html(LISTED))
    await fetchRnu(ID)
    await fetchRnu(ID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Crawl-delay 5 из robots.txt: второй запрос с экземпляра идёт не раньше чем через 5 секунд', async () => {
    process.env.RNU_MIN_INTERVAL_MS = '5000'
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => html(CLEAN)) // свежий Response на каждый вызов: тело читается один раз
    const a = fetchRnu('111111111111')
    const b = fetchRnu('222222222222')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4_900)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await a).toEqual({ found: false, count: 0 })
    expect(await b).toEqual({ found: false, count: 0 })
  })

  it('очередь длиннее допустимой: «не проверили» (null), а не бесконечное ожидание', async () => {
    process.env.RNU_MIN_INTERVAL_MS = '5000'
    vi.useFakeTimers()
    fetchMock.mockImplementation(async () => html(CLEAN)) // свежий Response на каждый вызов: тело читается один раз
    const ids = ['100000000001', '100000000002', '100000000003', '100000000004']
    const results = ids.map(id => fetchRnu(id))
    await vi.advanceTimersByTimeAsync(20_000)
    const out = await Promise.all(results)
    expect(out.slice(0, 2).every(r => r !== null)).toBe(true) // слоты 0 и 5 с
    expect(out[3]).toBeNull() // слот 15 с: ждать дольше 6 с не стали
    expect(fetchMock.mock.calls.length).toBeLessThan(4)
  })

  it('после серии сбоев автомат на минуту не ходит в портал', async () => {
    fetchMock.mockResolvedValue(html('x', 500))
    for (const id of ['100000000001', '100000000002', '100000000003']) expect(await fetchRnu(id)).toBeNull()
    fetchMock.mockClear()
    expect(await fetchRnu('100000000004')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
