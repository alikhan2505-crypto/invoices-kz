import { describe, it, expect, vi, beforeEach } from 'vitest'
import { serverError, GENERIC_SERVER_ERROR } from './apiError'

describe('serverError', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  it('отдаёт клиенту общий текст, а причину пишет в лог', async () => {
    const res = serverError('scope', { message: 'duplicate key value violates unique constraint "kaspi_x_pkey"' })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: GENERIC_SERVER_ERROR })
    expect(JSON.stringify(body)).not.toContain('kaspi_x_pkey')
    expect(console.error).toHaveBeenCalledWith('scope: duplicate key value violates unique constraint "kaspi_x_pkey"')
  })

  it('принимает Error, строку и произвольное значение; статус настраивается', async () => {
    expect((await serverError('s', new Error('boom'), 502).json()).error).toBe(GENERIC_SERVER_ERROR)
    expect(serverError('s', new Error('boom'), 502).status).toBe(502)
    serverError('s', 'plain')
    serverError('s', null)
    expect(console.error).toHaveBeenCalledWith('s: plain')
    expect(console.error).toHaveBeenCalledWith('s: null')
  })
})
