import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Фоновый скрипт запускается в песочнице с подставным chrome: проверяем порядок событий поиска
// (запуск, вкладка 1688, проверка «ползунок», результаты), отказы и защиту от чужих отправителей.

const dir = __dirname
type Listener = (msg: unknown, sender: unknown, send: (r: unknown) => void) => boolean | void

function makeEnv() {
  const store = new Map<string, unknown>()
  const events: { tabId: number; msg: Record<string, unknown> }[] = []
  const created: { id: number; url: string; active: boolean }[] = []
  const updated: { id: number; props: Record<string, unknown> }[] = []
  const removed: number[] = []
  const alarms: string[] = []
  let nextTab = 100
  let onMessage: Listener | null = null
  let onRemoved: ((id: number) => void) | null = null
  let onAlarm: ((a: { name: string }) => void) | null = null

  const chrome = {
    storage: { session: {
      // Как chrome.storage: ключ или список ключей.
      get: async (k: string | string[]) => Object.fromEntries((Array.isArray(k) ? k : [k]).map(key => [key, store.get(key)])),
      set: async (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o)) store.set(k, JSON.parse(JSON.stringify(v))) },
    } },
    tabs: {
      create: async (o: { url: string; active: boolean }) => { const id = nextTab++; created.push({ id, url: o.url, active: o.active }); return { id } },
      update: async (id: number, props: Record<string, unknown>) => { updated.push({ id, props }) },
      remove: async (id: number) => { removed.push(id); onRemoved?.(id) },
      sendMessage: async (tabId: number, msg: Record<string, unknown>) => { events.push({ tabId, msg }) },
      onRemoved: { addListener: (f: (id: number) => void) => { onRemoved = f } },
    },
    runtime: { onMessage: { addListener: (f: Listener) => { onMessage = f } } },
    alarms: { create: async (n: string) => { alarms.push(n) }, onAlarm: { addListener: (f: (a: { name: string }) => void) => { onAlarm = f } } },
  }

  const ctx: Record<string, unknown> = { chrome, TextDecoder, URL, console, Date, Promise, JSON, Map, Array, Object, Number, String, RegExp }
  ctx.self = ctx
  const context = vm.createContext(ctx)
  ctx.importScripts = (...files: string[]) => { for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), context, { filename: f }) }
  vm.runInContext(fs.readFileSync(path.join(dir, 'background.js'), 'utf8'), context, { filename: 'background.js' })

  const send = (msg: unknown, sender: unknown) => new Promise<unknown>(resolve => {
    const r = onMessage!(msg, sender, resolve)
    if (r !== true) resolve(undefined)
  })
  const flush = () => new Promise(r => setTimeout(r, 0))
  return { events, created, updated, removed, alarms, send, flush, store, closeTab: (id: number) => onRemoved?.(id), fireAlarm: () => onAlarm?.({ name: 'ik1688-timeout' }) }
}

const PAGE = { tab: { id: 7 }, url: 'https://invoices.kz/kaspi-shop/margin' }
const tab1688 = (id: number) => ({ tab: { id }, url: 'https://s.1688.com/selloffer/offer_search.htm' })
const search = (over: Record<string, unknown> = {}) => ({ type: 'ik:search', requestId: 'ik-1', queries: ['湿巾'], ...over })
const statuses = (env: ReturnType<typeof makeEnv>) => env.events.map(e => e.msg.status)
const item = { id: '123456789012', url: 'https://detail.1688.com/offer/123456789012.html', title: 'Товар', priceCny: 2.5, priceNote: '', sales: '', shop: '', imageUrl: '' }

describe('фоновый скрипт расширения', () => {
  let env: ReturnType<typeof makeEnv>
  beforeEach(() => { env = makeEnv() })

  it('поиск: вкладка 1688 на заднем плане по адресу от расширения, страница получает started, затем результаты, вкладка закрыта', async () => {
    await env.send(search(), PAGE)
    expect(env.created).toHaveLength(1)
    expect(env.created[0]).toMatchObject({ active: false })
    expect(env.created[0].url).toBe('https://s.1688.com/selloffer/offer_search.htm?keywords=%CA%AA%BD%ED')
    expect(statuses(env)).toEqual(['started'])
    expect(env.events[0]).toMatchObject({ tabId: 7, msg: { type: 'ik:event', requestId: 'ik-1' } })
    expect(env.alarms).toEqual(['ik1688-timeout'])

    expect(await env.send({ type: 'ik:scrape-hello' }, tab1688(100))).toEqual({ ok: true })
    await env.send({ type: 'ik:scrape-results', items: [item, { id: 'x' }, null] }, tab1688(100))
    expect(statuses(env)).toEqual(['started', 'results'])
    expect((env.events[1].msg.items as unknown[]).length).toBe(1)
    expect(env.removed).toEqual([100])
    // Вкладку 1688 не показывали: человека на странице не дёргаем.
    expect(env.updated.some(u => u.id === 7)).toBe(false)
  })

  it('проверка «ползунок»: вкладку 1688 показываем человеку, странице сообщаем captcha, дальше результаты', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-state', state: 'captcha' }, tab1688(100))
    expect(statuses(env)).toEqual(['started', 'captcha'])
    expect(env.updated.some(u => u.id === 100 && u.props.active === true)).toBe(true)
    await env.send({ type: 'ik:scrape-results', items: [item] }, tab1688(100))
    expect(statuses(env)).toEqual(['started', 'captcha', 'results'])
    // Вкладку 1688 показывали человеку: после результатов возвращаем его на страницу.
    expect(env.updated.some(u => u.id === 7 && u.props.active === true)).toBe(true)
  })

  it('страница 1688 долго ничего не показывает: вкладку показываем, странице статус attention', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-attention' }, tab1688(100))
    expect(statuses(env)).toEqual(['started', 'attention'])
    expect(env.updated.some(u => u.id === 100 && u.props.active === true)).toBe(true)
  })

  it('сайт сам пишет «ничего не найдено»: results с пустым списком', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-results', items: [] }, tab1688(100))
    expect(env.events[1].msg).toMatchObject({ status: 'results', items: [] })
  })

  it('гонка: пять одновременных запросов открывают одну вкладку, остальные получают busy', async () => {
    await Promise.all([1, 2, 3, 4, 5].map(n => env.send(search({ requestId: `ik-${n}` }), PAGE)))
    expect(env.created).toHaveLength(1)
    const busy = env.events.filter(e => e.msg.reason === 'busy' || e.msg.reason === 'too_fast')
    expect(busy).toHaveLength(4)
    expect((env.store.get('ik1688_pending') as Record<string, unknown>)['100']).toBeTruthy()
  })

  it('отмена со страницы: вкладка закрыта, регистрация снята, новый поиск после паузы возможен', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:cancel', requestId: 'ik-1' }, PAGE)
    expect(env.removed).toEqual([100])
    expect(env.store.get('ik1688_pending')).toEqual({})
    expect(await env.send({ type: 'ik:scrape-hello' }, tab1688(100))).toEqual({ ok: false })
  })

  it('отмену чужим запросом или чужой страницей не принимаем', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:cancel', requestId: 'ik-other' }, PAGE)
    await env.send({ type: 'ik:cancel', requestId: 'ik-1' }, { tab: { id: 8 }, url: 'https://invoices.kz/kaspi-shop/margin' })
    await env.send({ type: 'ik:cancel', requestId: 'ik-1' }, { tab: { id: 7 }, url: 'https://evil.example/' })
    expect(env.removed).toEqual([])
  })

  it('забытая старая запись не блокирует поиск и её вкладка закрывается', async () => {
    await env.send(search(), PAGE)
    const pending = env.store.get('ik1688_pending') as Record<string, { startedAt: number }>
    pending['100'].startedAt -= 200_000
    env.store.set('ik1688_pending', pending)
    env.store.set('ik1688_last_start', 0)
    await env.send(search({ requestId: 'ik-2' }), PAGE)
    expect(env.removed).toEqual([100])
    expect(env.created).toHaveLength(2)
  })

  it('не больше 20 поисков в час', async () => {
    env.store.set('ik1688_history', Array.from({ length: 20 }, () => Date.now() - 1000))
    await env.send(search(), PAGE)
    expect(env.created).toHaveLength(0)
    expect(env.events[0].msg).toMatchObject({ status: 'error', reason: 'hourly_limit' })
  })

  it('мало карточек: вкладку делаем активной, чтобы список догрузился', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-need-visible' }, tab1688(100))
    expect(env.updated.some(u => u.id === 100 && u.props.active === true)).toBe(true)
    expect(statuses(env)).toEqual(['started'])
  })

  it('не удалось прочитать: error unreadable; неизвестная причина становится timeout', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-fail', reason: 'unreadable' }, tab1688(100))
    expect(env.events[1].msg).toMatchObject({ status: 'error', reason: 'unreadable' })
    const env2 = makeEnv()
    await env2.send(search(), PAGE)
    await env2.send({ type: 'ik:scrape-fail', reason: '<script>' }, tab1688(100))
    expect(env2.events[1].msg).toMatchObject({ status: 'error', reason: 'timeout' })
  })

  it('вкладку 1688 закрыли руками: страница узнаёт об этом, повторного закрытия нет', async () => {
    await env.send(search(), PAGE)
    env.closeTab(100)
    await env.flush()
    expect(env.events[1].msg).toMatchObject({ status: 'error', reason: 'tab_closed' })
    expect(env.removed).toEqual([])
  })

  it('второй поиск при идущем первом: busy, вторая вкладка не открывается', async () => {
    await env.send(search(), PAGE)
    await env.send(search({ requestId: 'ik-2' }), PAGE)
    expect(env.created).toHaveLength(1)
    expect(env.events[1].msg).toMatchObject({ requestId: 'ik-2', status: 'error', reason: 'busy' })
  })

  it('слишком частые поиски: too_fast', async () => {
    await env.send(search(), PAGE)
    await env.send({ type: 'ik:scrape-results', items: [item] }, tab1688(100))
    await env.send(search({ requestId: 'ik-2' }), PAGE)
    expect(env.events.at(-1)!.msg).toMatchObject({ requestId: 'ik-2', status: 'error', reason: 'too_fast' })
    expect(env.created).toHaveLength(1)
  })

  it.each([
    ['не наши страницы', search(), { tab: { id: 7 }, url: 'https://evil.example/' }],
    ['чужой http', search(), { tab: { id: 7 }, url: 'http://invoices.kz/' }],
    ['нет вкладки отправителя', search(), { url: 'https://invoices.kz/' }],
    ['плохой id запроса', search({ requestId: 'a b' }), PAGE],
  ])('отказ без вкладки и без события: %s', async (_n, msg, sender) => {
    await env.send(msg, sender)
    expect(env.created).toHaveLength(0)
    expect(env.alarms).toHaveLength(0)
  })

  it.each([
    [{ queries: [] }], [{ queries: ['wet wipes'] }], [{ queries: ['https://evil.example'] }], [{ queries: '湿巾' }],
    [{ queries: ['湿巾', '湿巾', '湿巾', '湿巾'] }], [{ queries: ['湿'.repeat(41)] }], [{ queries: ['湿\n巾'] }],
  ])('плохие слова %#: страница получает bad_request, вкладка не открывается', async over => {
    await env.send(search(over), PAGE)
    expect(env.created).toHaveLength(0)
    expect(env.events[0].msg).toMatchObject({ status: 'error', reason: 'bad_request' })
  })

  it('слово вне GBK: bad_request', async () => {
    await env.send(search({ queries: ['湿巾😀'] }), PAGE)
    expect(env.created).toHaveLength(0)
    expect(env.events[0].msg).toMatchObject({ reason: 'bad_request' })
  })

  it('сообщения скрипта 1688 от чужой вкладки, чужого адреса и без регистрации игнорируются', async () => {
    await env.send(search(), PAGE)
    expect(await env.send({ type: 'ik:scrape-hello' }, tab1688(999))).toEqual({ ok: false })
    expect(await env.send({ type: 'ik:scrape-hello' }, { tab: { id: 100 }, url: 'https://evil.example/' })).toBeUndefined()
    await env.send({ type: 'ik:scrape-results', items: [item] }, tab1688(999))
    await env.send({ type: 'ik:scrape-results', items: [item] }, { tab: { id: 100 }, url: 'https://s.1688.com.evil.example/x' })
    expect(statuses(env)).toEqual(['started'])
    expect(env.removed).toEqual([])
  })

  it('таймер: зависший поиск сбрасывается ошибкой timeout и закрывает вкладку', async () => {
    await env.send(search(), PAGE)
    const pending = env.store.get('ik1688_pending') as Record<string, { startedAt: number }>
    pending['100'].startedAt -= 200_000
    env.store.set('ik1688_pending', pending)
    env.fireAlarm()
    await env.flush(); await env.flush()
    expect(env.events.at(-1)!.msg).toMatchObject({ status: 'error', reason: 'timeout' })
    expect(env.removed).toEqual([100])
  })

  it('неизвестные сообщения не ломают обработчик', async () => {
    expect(await env.send({ type: 'something' }, tab1688(100))).toEqual({ ok: false }) // вкладка не зарегистрирована
    expect(await env.send(null, PAGE)).toBeUndefined()
    expect(await env.send({ type: 5 }, PAGE)).toBeUndefined()
  })
})
