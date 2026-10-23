import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isCronAuthorized } from './cronAuth'

const SECRET = 'a-long-enough-cron-secret-123'
const req = (authorization?: string) =>
  new Request('https://invoices.kz/api/cron/x', authorization === undefined ? {} : { headers: { authorization } })

describe('isCronAuthorized', () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = SECRET })
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = original
  })

  it('пускает правильный Bearer-секрет', () => {
    expect(isCronAuthorized(req(`Bearer ${SECRET}`))).toBe(true)
  })

  it('отказывает при неверном секрете и без заголовка', () => {
    expect(isCronAuthorized(req('Bearer wrong-secret-of-same-len!!'))).toBe(false)
    expect(isCronAuthorized(req(`Bearer ${SECRET}x`))).toBe(false)
    expect(isCronAuthorized(req(SECRET))).toBe(false)
    expect(isCronAuthorized(req(''))).toBe(false)
    expect(isCronAuthorized(req())).toBe(false)
  })

  it('закрыто, если CRON_SECRET не задан: Bearer undefined не проходит', () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorized(req('Bearer undefined'))).toBe(false)
    expect(isCronAuthorized(req('Bearer '))).toBe(false)
  })

  it('закрыто, если CRON_SECRET пустой или короче 12 символов', () => {
    process.env.CRON_SECRET = ''
    expect(isCronAuthorized(req('Bearer '))).toBe(false)
    process.env.CRON_SECRET = 'short-sec'
    expect(isCronAuthorized(req('Bearer short-sec'))).toBe(false)
    process.env.CRON_SECRET = '12345678901'
    expect(isCronAuthorized(req('Bearer 12345678901'))).toBe(false)
    process.env.CRON_SECRET = '123456789012'
    expect(isCronAuthorized(req('Bearer 123456789012'))).toBe(true)
  })
})
