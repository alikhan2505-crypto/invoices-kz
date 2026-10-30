import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { consumePendingBinWatch, peekPendingBinWatch, pickPendingBin, setPendingBinWatch, PENDING_BIN_WATCH_KEY, BIN_WATCH_PAGE_PATH } from './pendingIntent'
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

describe('БИН для добавления сразу после входа (30.10.2026)', () => {
  const T0 = 1_000_000_000_000

  it('peek читает намерение и НЕ удаляет его', () => {
    setPendingBinWatch('123456789012', T0)
    expect(peekPendingBinWatch(T0 + 1000)).toBe('123456789012')
    expect(peekPendingBinWatch(T0 + 2000)).toBe('123456789012')
    expect(store.has(PENDING_BIN_WATCH_KEY)).toBe(true)
    expect(peekPendingBinWatch(T0 + STORED_INTENT_TTL_MS + 1)).toBeNull()
  })

  it('локальный БИН главнее, метаданные письма только у нового аккаунта', () => {
    expect(pickPendingBin('123456789012', '999999999999', true)).toBe('123456789012')
    expect(pickPendingBin(null, '999999999999', true)).toBe('999999999999')
    expect(pickPendingBin(null, '999999999999', false)).toBeNull()
  })

  it('мусор вместо БИН отбрасывается', () => {
    expect(pickPendingBin('abc', '<script>', true)).toBeNull()
    expect(pickPendingBin(null, 123456789012, true)).toBeNull()
    expect(pickPendingBin(null, undefined, true)).toBeNull()
    expect(pickPendingBin('12345678901', '1234567890123', true)).toBeNull()
  })
})

