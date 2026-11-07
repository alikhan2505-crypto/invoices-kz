import { describe, it, expect } from 'vitest'
import { connectErrorMessage } from './connectMessages'
import { isConnectionRefusal } from './connectSmsLimits'

const ctx = { step: 'phone', resumable: false } as const

describe('connectErrorMessage: коды нашего маршрута локализованы (ru, kk, en)', () => {
  it.each(['phone_required', 'phone_invalid', 'limit_unavailable', 'rate_limited'])('%s: есть текст на всех трёх языках, они разные', code => {
    const ru = connectErrorMessage('ru', code, ctx)
    const kk = connectErrorMessage('kk', code, ctx)
    const en = connectErrorMessage('en', code, ctx)
    for (const t of [ru, kk, en]) expect(typeof t === 'string' && t.length > 0).toBe(true)
    expect(new Set([ru, kk, en]).size).toBe(3)
  })

  it('en без кириллицы, kk написан по-казахски, а не русским текстом', () => {
    expect(connectErrorMessage('en', 'phone_invalid', ctx)).not.toMatch(/[А-Яа-я]/)
    expect(connectErrorMessage('kk', 'phone_required', ctx)).toMatch(/нөмір/)
    expect(connectErrorMessage('kk', 'limit_unavailable', ctx)).not.toContain('Не удалось')
  })

  it('ru-текст rate_limited сохраняет прежнюю формулировку сервера: минуты и «мин.»', () => {
    expect(connectErrorMessage('ru', 'rate_limited', { ...ctx, scope: 'user', retryAfterSec: 1500 }))
      .toBe('Слишком много SMS-запросов от вашего аккаунта. Повторите примерно через 25 мин.')
    expect(connectErrorMessage('ru', 'rate_limited', { ...ctx, scope: 'phone', retryAfterSec: 1 }))
      .toBe('Слишком много SMS-запросов на этот номер. Повторите примерно через 1 мин.')
    expect(connectErrorMessage('ru', 'rate_limited', { ...ctx, scope: 'ip', retryAfterSec: 3000 }))
      .toBe('Слишком много SMS-запросов с вашего адреса. Повторите примерно через 50 мин.')
  })

  it('rate_limited: на каждом языке разные фразы для аккаунта, номера и адреса, минуты подставлены', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = (scope: string) => connectErrorMessage(lang, 'rate_limited', { ...ctx, scope, retryAfterSec: 600 })!
      expect(new Set([t('user'), t('phone'), t('ip')]).size).toBe(3)
      expect(t('phone')).toContain('10')
    }
  })

  it('rate_limited без retryAfterSec (страница его не передала): честное «позже», без «NaN мин»', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = connectErrorMessage(lang, 'rate_limited', ctx)!
      expect(t).not.toMatch(/NaN|undefined/)
      expect(t).not.toMatch(/\d/)
    }
    expect(connectErrorMessage('ru', 'rate_limited', ctx)).toContain('Повторите позже')
  })

  it('прежние коды работают как раньше, чужой код даёт null (страница покажет текст сервера)', () => {
    expect(connectErrorMessage('ru', 'kaspi_unreachable', ctx)).toContain('Kaspi не ответил')
    expect(connectErrorMessage('en', 'session_not_issued', { step: 'otp', resumable: true })).toContain('Retry')
    expect(connectErrorMessage('ru', 'something_new', ctx)).toBeNull()
    expect(connectErrorMessage('kk', undefined, ctx)).toBeNull()
  })

  it('ответы Kaspi на номер и код: человеческая фраза на трёх языках, без «HTTP»', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      for (const code of ['otp_rejected', 'phone_rejected', 'invalid_token', 'code_required']) {
        const t = connectErrorMessage(lang, code, ctx)!
        expect(t).toBeTruthy()
        expect(t).not.toMatch(/HTTP/)
      }
    }
    expect(connectErrorMessage('ru', 'otp_rejected', ctx)).toContain('запросите новый код')
  })

  it('в новых текстах нет длинных тире', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      for (const code of ['phone_required', 'phone_invalid', 'limit_unavailable', 'rate_limited', 'otp_rejected', 'phone_rejected', 'invalid_token', 'code_required']) {
        const t = connectErrorMessage(lang, code, { ...ctx, scope: 'ip', retryAfterSec: 120 })!
        expect(t).not.toMatch(/[—–]/)
      }
    }
  })
})

describe('isConnectionRefusal: когда SMS заведомо не ушла', () => {
  it.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT'])('%s: да', code => {
    expect(isConnectionRefusal(code)).toBe(true)
  })
  it.each(['TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_SOCKET', '', undefined, null, 42])('%j: нет', v => {
    expect(isConnectionRefusal(v)).toBe(false)
  })
})
