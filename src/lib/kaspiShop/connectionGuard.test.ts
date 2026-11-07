import { describe, it, expect } from 'vitest'
import { checkKaspiConnection, CONNECTION_NETWORK_ERROR } from './connectionGuard'

const reply = (status: number, body: unknown) => (async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch

describe('checkKaspiConnection', () => {
  it('подключён и сессия жива: ready', async () => {
    const r = await checkKaspiConnection('tok', reply(200, { connected: true, sessionStatus: 'active' }))
    expect(r.kind).toBe('ready')
  })

  it('не подключён: redirect not_connected; сессия Kaspi истекла: redirect session_expired', async () => {
    expect(await checkKaspiConnection('tok', reply(200, { connected: false }))).toMatchObject({ kind: 'redirect', reason: 'not_connected' })
    expect(await checkKaspiConnection('tok', reply(200, { connected: true, sessionStatus: 'session_expired' })))
      .toMatchObject({ kind: 'redirect', reason: 'session_expired' })
  })

  it('401 (протух вход): уход на страницу входа, а не сырой «Unauthorized» с кнопкой «Повторить»', async () => {
    const r = await checkKaspiConnection('tok', reply(401, { error: 'Unauthorized' }))
    expect(r.kind).toBe('redirect')
    expect(JSON.stringify(r)).not.toContain('Повторить')
    expect(r).toMatchObject({ kind: 'redirect', reason: 'not_connected', data: { unauthorized: true } })
  })

  it('401 без токена и с не-JSON телом ведёт себя так же', async () => {
    expect((await checkKaspiConnection(undefined, reply(401, { error: 'Unauthorized' }))).kind).toBe('redirect')
    expect((await checkKaspiConnection('tok', reply(401, '<html>login</html>'))).kind).toBe('redirect')
  })

  it('сбои, которые не 401, по-прежнему дают error с «Повторить»: 500, 403, обрыв сети, 200 без тела', async () => {
    expect(await checkKaspiConnection('tok', reply(500, { error: 'boom' }))).toEqual({ kind: 'error', message: 'boom' })
    expect((await checkKaspiConnection('tok', reply(403, {}))).kind).toBe('error')
    expect(await checkKaspiConnection('tok', (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch))
      .toEqual({ kind: 'error', message: CONNECTION_NETWORK_ERROR })
    expect((await checkKaspiConnection('tok', reply(200, 'null'))).kind).toBe('error')
  })
})
