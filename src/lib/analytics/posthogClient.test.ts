import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Поддельный posthog-js: запоминает вызовы, init сразу зовёт loaded, как настоящий.
const h = vi.hoisted(() => {
  const state = {
    stored: false,
    userState: 'anonymous',
    distinctId: 'anon-1',
  }
  const fake = {
    init: vi.fn((_key: string, config: { loaded?: () => void }) => config.loaded?.()),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    get_property: vi.fn(() => state.userState),
    get_distinct_id: vi.fn(() => state.distinctId),
  }
  return { state, fake }
})

vi.mock('posthog-js', () => ({ default: h.fake }))
vi.mock('posthog-js/dist/exception-autocapture', () => ({}))
vi.mock('posthog-js/dist/lazy-recorder', () => ({}))
vi.mock('@/lib/hasStoredSession', () => ({ mightHaveStoredSession: () => h.state.stored }))

// Рекордер «грузится», пока тест не вызовет возвращённую функцию.
function slowRecorder(): () => void {
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  vi.doUnmock('posthog-js/dist/lazy-recorder')
  vi.doMock('posthog-js/dist/lazy-recorder', async () => {
    await gate
    return {}
  })
  return release
}

type Client = typeof import('./posthogClient')

const loc = { hostname: 'invoices.kz', pathname: '/', href: 'https://invoices.kz/', origin: 'https://invoices.kz' }

function goTo(path: string): void {
  loc.pathname = path
  loc.href = `${loc.origin}${path}`
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

async function load(path: string, host = 'invoices.kz'): Promise<Client> {
  loc.hostname = host
  loc.origin = `https://${host}`
  goTo(path)
  vi.resetModules()
  return import('./posthogClient')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.doUnmock('posthog-js/dist/lazy-recorder')
  vi.doMock('posthog-js/dist/lazy-recorder', () => ({}))
  h.state.stored = false
  h.state.userState = 'anonymous'
  h.state.distinctId = 'anon-1'
  vi.stubGlobal('window', { location: loc, addEventListener: vi.fn() })
  vi.stubGlobal('navigator', { doNotTrack: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('запись сессий', () => {
  it('гость на публичной странице: запись включается после загрузки рекордера', async () => {
    const c = await load('/tools/schet')
    c.startPosthog()
    await flush()
    expect(h.fake.init).toHaveBeenCalledTimes(1)
    expect(h.fake.startSessionRecording).toHaveBeenCalledTimes(1)
  })

  it('с сохранённым входом не пишем, пока Supabase не скажет, и не пишем вошедшего', async () => {
    h.state.stored = true
    const c = await load('/guides/kak-vystavit-schet-ip')
    c.startPosthog()
    await flush()
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
    c.setAnalyticsUser('user-1', 'INITIAL_SESSION')
    await flush()
    expect(h.fake.identify).toHaveBeenCalledWith('user-1')
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
  })

  it('«Выйти» из кабинета: запись включается только когда /login уже на экране', async () => {
    h.state.stored = true
    const c = await load('/dashboard')
    c.startPosthog()
    c.setAnalyticsUser('user-1', 'INITIAL_SESSION')
    await flush()
    h.state.stored = false
    c.setAnalyticsUser(null, 'SIGNED_OUT')
    c.trackNavigation('/login')
    await flush()
    expect(h.fake.reset).toHaveBeenCalledWith(true)
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
    goTo('/login')
    c.routeCommitted('/login')
    await flush()
    expect(h.fake.startSessionRecording).toHaveBeenCalledTimes(1)
  })

  it('выключение во время загрузки рекордера не теряется', async () => {
    const release = slowRecorder()
    const c = await load('/')
    c.startPosthog()
    await flush()
    c.trackNavigation('/dashboard')
    expect(h.fake.stopSessionRecording).toHaveBeenCalledTimes(1)
    release()
    await flush()
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
  })

  it('вход паролем-ключом во время загрузки рекордера: запись не начинается', async () => {
    const release = slowRecorder()
    const c = await load('/login')
    c.startPosthog()
    await flush()
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
    h.state.stored = true
    c.setAnalyticsUser('user-2', 'SIGNED_IN')
    release()
    await flush()
    expect(h.fake.stopSessionRecording).toHaveBeenCalled()
    expect(h.fake.startSessionRecording).not.toHaveBeenCalled()
  })

  it('переход в кабинет выключает запись сразу, в начале перехода', async () => {
    const c = await load('/tools/zarplata')
    c.startPosthog()
    await flush()
    expect(h.fake.startSessionRecording).toHaveBeenCalledTimes(1)
    c.trackNavigation('https://invoices.kz/create?from=tools')
    expect(h.fake.stopSessionRecording).toHaveBeenCalledTimes(1)
  })

  it('сервер перенаправил с /create на /login: запись снова включается на /login', async () => {
    const c = await load('/tools/schet')
    c.startPosthog()
    await flush()
    c.trackNavigation('/create')
    goTo('/login')
    c.routeCommitted('/login')
    await flush()
    expect(h.fake.stopSessionRecording).toHaveBeenCalledTimes(1)
    expect(h.fake.startSessionRecording).toHaveBeenCalledTimes(2)
  })

  it('пока идёт более новый переход в кабинет, запись не включается', async () => {
    const c = await load('/')
    c.startPosthog()
    await flush()
    c.trackNavigation('/tools')
    c.trackNavigation('/dashboard')
    goTo('/tools')
    c.routeCommitted('/tools')
    await flush()
    expect(h.fake.startSessionRecording).toHaveBeenCalledTimes(1)
    expect(h.fake.stopSessionRecording).toHaveBeenCalledTimes(1)
  })

  it('переход на другой хост выключает запись', async () => {
    const c = await load('/')
    c.startPosthog()
    await flush()
    c.trackNavigation('https://kaspi.invoices.kz/')
    expect(h.fake.stopSessionRecording).toHaveBeenCalledTimes(1)
  })
})

describe('строка о записи (RecordingNotice)', () => {
  it('видна гостю на публичной странице, пропадает при уходе в кабинет и сообщает подписчику', async () => {
    const c = await load('/tools/schet')
    const seen = vi.fn()
    const off = c.subscribeReplayRequested(seen)
    expect(c.isReplayRequested()).toBe(false)
    c.startPosthog()
    await flush()
    expect(c.isReplayRequested()).toBe(true)
    expect(seen).toHaveBeenCalledTimes(1)
    c.trackNavigation('/dashboard')
    expect(c.isReplayRequested()).toBe(false)
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    goTo('/guides/kak-vystavit-schet-ip')
    c.trackNavigation('/guides/kak-vystavit-schet-ip')
    c.routeCommitted('/guides/kak-vystavit-schet-ip')
    expect(c.isReplayRequested()).toBe(true)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('не видна вошедшему и при «Не отслеживать»', async () => {
    h.state.stored = true
    const c = await load('/guides/kak-vystavit-schet-ip')
    c.startPosthog()
    c.setAnalyticsUser('user-1', 'INITIAL_SESSION')
    await flush()
    expect(c.isReplayRequested()).toBe(false)
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    h.state.stored = false
    const d = await load('/tools/schet')
    d.startPosthog()
    await flush()
    expect(d.isReplayRequested()).toBe(false)
  })
})

describe('запуск', () => {
  it('на странице с секретом в адресе не запускается, а на следующей запускается', async () => {
    const c = await load('/view/abc')
    c.startPosthog()
    await flush()
    expect(h.fake.init).not.toHaveBeenCalled()
    goTo('/')
    c.routeCommitted('/')
    await flush()
    expect(h.fake.init).toHaveBeenCalledTimes(1)
  })

  it('при «Не отслеживать» не загружается', async () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    const c = await load('/')
    c.startPosthog()
    await flush()
    expect(h.fake.init).not.toHaveBeenCalled()
  })

  it('на чужих хостах (превью, сайты салонов) не загружается', async () => {
    const c = await load('/', 'invoices-kz.vercel.app')
    c.startPosthog()
    await flush()
    expect(h.fake.init).not.toHaveBeenCalled()
  })

  it('до вызова startPosthog ничего не грузит', async () => {
    const c = await load('/')
    c.routeCommitted('/')
    c.setAnalyticsUser(null, 'INITIAL_SESSION')
    await flush()
    expect(h.fake.init).not.toHaveBeenCalled()
  })
})

describe('кто вошёл', () => {
  it('другой аккаунт в том же браузере: сначала сброс, потом новый идентификатор', async () => {
    h.state.userState = 'identified'
    h.state.distinctId = 'user-a'
    h.state.stored = true
    const c = await load('/dashboard')
    c.startPosthog()
    c.setAnalyticsUser('user-b', 'SIGNED_IN')
    await flush()
    expect(h.fake.reset).toHaveBeenCalledWith(true)
    expect(h.fake.identify).toHaveBeenCalledWith('user-b')
    expect(h.fake.reset.mock.invocationCallOrder[0]).toBeLessThan(h.fake.identify.mock.invocationCallOrder[0])
  })

  it('сессия пропала без «Выйти»: сброс только если PostHog помнил человека', async () => {
    h.state.userState = 'identified'
    let c = await load('/tools')
    c.startPosthog()
    c.setAnalyticsUser(null, 'INITIAL_SESSION')
    await flush()
    expect(h.fake.reset).toHaveBeenCalledWith(true)

    vi.clearAllMocks()
    h.state.userState = 'anonymous'
    c = await load('/tools')
    c.startPosthog()
    c.setAnalyticsUser(null, 'INITIAL_SESSION')
    await flush()
    expect(h.fake.reset).not.toHaveBeenCalled()
  })
})
