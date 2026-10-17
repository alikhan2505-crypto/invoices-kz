import { describe, it, expect, vi, afterEach } from 'vitest'
import { withTimeout, fetchWithTimeout, LoadTimeoutError } from './loadGuard'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('withTimeout', () => {
  it('отдаёт результат, если успел', async () => {
    await expect(withTimeout(Promise.resolve(42), 50)).resolves.toBe(42)
  })
  it('пробрасывает исключение исходного promise', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom')
  })
  it('отклоняет LoadTimeoutError, если promise завис', async () => {
    vi.useFakeTimers()
    const hung = new Promise<never>(() => {})
    const result = withTimeout(hung, 1000)
    const assertion = expect(result).rejects.toBeInstanceOf(LoadTimeoutError)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
  })
})

describe('fetchWithTimeout', () => {
  it('прерывает зависший запрос и сообщает LoadTimeoutError', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    }))
    const result = fetchWithTimeout('/x', {}, 500)
    const assertion = expect(result).rejects.toBeInstanceOf(LoadTimeoutError)
    await vi.advanceTimersByTimeAsync(501)
    await assertion
  })
  it('обычный сбой сети остаётся сбоем сети', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    await expect(fetchWithTimeout('/x')).rejects.toThrow('Failed to fetch')
  })
})
