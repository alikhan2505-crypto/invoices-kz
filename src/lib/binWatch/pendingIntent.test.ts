import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { consumePendingBinWatch, setPendingBinWatch, PENDING_BIN_WATCH_KEY, BIN_WATCH_PAGE_PATH } from './pendingIntent'
import { ALLOWED_POST_LOGIN_REDIRECTS, consumePostLoginRedirect, setPostLoginRedirect } from '@/lib/postLoginRedirect'
import { STORED_INTENT_TTL_MS } from '@/lib/storedIntent'

function stubStorage() {
  const m = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  })
  return m
}

let store: Map<string, string>
beforeEach(() => { store = stubStorage() })
afterEach(() => { vi.unstubAllGlobals() })

describe('намерение «добавить БИН после входа»', () => {
  const T0 = 1_000_000_000_000

  it('свежее намерение читается один раз и удаляется', () => {
    expect(setPendingBinWatch('123456789012', T0)).toBe(true)
    expect(consumePendingBinWatch(T0 + 60_000)).toBe('123456789012')
    expect(consumePendingBinWatch(T0 + 60_000)).toBeNull()
    expect(store.has(PENDING_BIN_WATCH_KEY)).toBe(false)
  })

  it('живёт 30 минут: позже - молча выбрасывается', () => {
    setPendingBinWatch('123456789012', T0)
    expect(consumePendingBinWatch(T0 + STORED_INTENT_TTL_MS + 1)).toBeNull()
    expect(store.has(PENDING_BIN_WATCH_KEY)).toBe(false)
  })

  it('не принимает не-БИН ни при записи, ни при чтении подделанного значения', () => {
    expect(setPendingBinWatch('12345', T0)).toBe(false)
    store.set(PENDING_BIN_WATCH_KEY, JSON.stringify({ bin: '<script>', at: T0 }))
    expect(consumePendingBinWatch(T0)).toBeNull()
    store.set(PENDING_BIN_WATCH_KEY, 'not json')
    expect(consumePendingBinWatch(T0)).toBeNull()
    store.set(PENDING_BIN_WATCH_KEY, JSON.stringify({ bin: '123456789012' })) // старый формат без времени
    expect(consumePendingBinWatch(T0)).toBeNull()
  })

  it('хранилище недоступно - тихий отказ, без исключения', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} })
    expect(setPendingBinWatch('123456789012')).toBe(false)
    expect(consumePendingBinWatch()).toBeNull()
  })
})

describe('возврат после входа', () => {
  it('страница слежения входит в список разрешённых возвратов и сохраняется', () => {
    expect((ALLOWED_POST_LOGIN_REDIRECTS as readonly string[]).includes(BIN_WATCH_PAGE_PATH)).toBe(true)
    setPostLoginRedirect(BIN_WATCH_PAGE_PATH)
    expect(consumePostLoginRedirect()).toBe('/profile/bin-watch')
  })
})
