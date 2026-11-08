import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withNetworkRetry, isNetworkFailure, describeNetworkError } from './client'

// 08.11.2026: создание QR повисло ~12 с и упало «fetch failed»; повтор прошёл за 1 с.
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

const fetchFailed = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' } })

describe('withNetworkRetry', () => {
  it('сетевой сбой: один повтор, второй успешный ответ отдаётся', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(fetchFailed()).mockResolvedValueOnce('ok')
    await expect(withNetworkRetry(attempt)).resolves.toBe('ok')
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('наш таймаут тоже считается сетевым сбоем и повторяется', async () => {
    const attempt = vi.fn((signal: AbortSignal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason))
    }))
    await expect(withNetworkRetry(attempt, 20)).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('ошибка не сетевая (ответ Kaspi с ошибкой): без повтора', async () => {
    const attempt = vi.fn().mockRejectedValue(new Error('Kaspi qr-token/create failed: {}'))
    await expect(withNetworkRetry(attempt)).rejects.toThrow(/create failed/)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('два сетевых сбоя подряд: ошибка уходит наверх, третьей попытки нет', async () => {
    const attempt = vi.fn().mockRejectedValue(fetchFailed())
    await expect(withNetworkRetry(attempt)).rejects.toThrow(/fetch failed/)
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it('каждая попытка получает свой сигнал таймаута', async () => {
    const signals: AbortSignal[] = []
    const attempt = vi.fn(async (s: AbortSignal) => { signals.push(s); if (signals.length === 1) throw fetchFailed(); return 1 })
    await withNetworkRetry(attempt)
    expect(signals[0]).not.toBe(signals[1])
  })
})

describe('isNetworkFailure / describeNetworkError', () => {
  it('различает сетевой сбой и прочие ошибки', () => {
    expect(isNetworkFailure(fetchFailed())).toBe(true)
    expect(isNetworkFailure(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isNetworkFailure(new Error('x'))).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })

  it('показывает причину из e.cause', () => {
    expect(describeNetworkError(fetchFailed())).toBe('TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT Connect Timeout Error)')
    expect(describeNetworkError(new Error('plain'))).toBe('Error: plain')
  })
})
