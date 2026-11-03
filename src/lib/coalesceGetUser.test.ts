import { describe, it, expect, vi } from 'vitest'
import { coalesceGetUser, GET_USER_CACHE_MS } from './coalesceGetUser'

type Res = { data: { user: { id: string } | null }; error: Error | null }
const ok = (id = 'u1'): Res => ({ data: { user: { id } }, error: null })
const fail = (): Res => ({ data: { user: null }, error: new Error('no session') })

function setup(impl: (jwt?: string) => Promise<Res>, clock = { t: 0 }) {
  let listener: ((event: string, session: { user?: { id?: string } | null } | null) => void) | undefined
  const getUser = vi.fn(impl)
  const auth = {
    getUser,
    onAuthStateChange: (cb: NonNullable<typeof listener>) => { listener = cb },
  }
  coalesceGetUser(auth, { now: () => clock.t })
  return {
    auth, getUser, clock,
    emit: (event = 'SIGNED_OUT', session: { user?: { id?: string } | null } | null = null) => listener?.(event, session),
  }
}

describe('coalesceGetUser', () => {
  it('шесть одновременных вызовов - один запрос, у всех один и тот же ответ', async () => {
    const { auth, getUser } = setup(async () => ok())
    const all = await Promise.all(Array.from({ length: 6 }, () => auth.getUser()))
    expect(getUser).toHaveBeenCalledTimes(1)
    expect(new Set(all).size).toBe(1)
    expect(all[0].data.user).toEqual({ id: 'u1' })
  })

  it('следующий вызов в пределах срока берёт ответ из памяти, после срока - идёт в сеть', async () => {
    const { auth, getUser, clock } = setup(async () => ok())
    await auth.getUser()
    clock.t = GET_USER_CACHE_MS - 1
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(1)
    clock.t = GET_USER_CACHE_MS
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it.each(['SIGNED_OUT', 'USER_UPDATED', 'PASSWORD_RECOVERY'])('событие %s сбрасывает память', async event => {
    const { auth, getUser, emit } = setup(async () => ok())
    await auth.getUser()
    emit(event)
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('начальная сессия и обновление токена память не сбрасывают (иначе второй запрос сразу после первого)', async () => {
    const { auth, getUser, emit } = setup(async () => ok())
    await auth.getUser()
    emit('INITIAL_SESSION', { user: { id: 'u1' } })
    emit('TOKEN_REFRESHED', { user: { id: 'u1' } })
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('повторный вход того же пользователя (возврат на вкладку) не сбрасывает, вход другого - сбрасывает', async () => {
    const { auth, getUser, emit } = setup(async () => ok())
    await auth.getUser()
    emit('SIGNED_IN', { user: { id: 'u1' } })
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(1)
    emit('SIGNED_IN', { user: { id: 'u2' } })
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('SIGNED_IN при старте страницы во время первого запроса: второй запрос не нужен', async () => {
    let release: (r: Res) => void = () => {}
    const { auth, getUser, emit } = setup(() => new Promise<Res>(res => { release = res }))
    const first = auth.getUser()
    emit('INITIAL_SESSION', { user: { id: 'u1' } })
    emit('SIGNED_IN', { user: { id: 'u1' } })
    const second = auth.getUser()
    release(ok('u1'))
    await Promise.all([first, second])
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('вошёл другой человек, пока шёл запрос прежнего: ответ прежнего не запоминается и не раздаётся новым вызовам', async () => {
    const { auth, getUser, emit, clock } = setup(async () => ok('u1'))
    emit('SIGNED_IN', { user: { id: 'u1' } })
    await auth.getUser()
    clock.t = GET_USER_CACHE_MS + 1 // память прежнего пользователя устарела, значит запрос уйдёт в сеть
    let release: (r: Res) => void = () => {}
    getUser.mockImplementation(() => new Promise<Res>(res => { release = res }))
    const stale = auth.getUser()
    emit('SIGNED_IN', { user: { id: 'u2' } })
    getUser.mockImplementation(async () => ok('u2'))
    const fresh = await auth.getUser()
    release(ok('u1'))
    await stale
    expect(fresh.data.user).toEqual({ id: 'u2' })
    expect((await auth.getUser()).data.user).toEqual({ id: 'u2' })
    expect(getUser).toHaveBeenCalledTimes(3)
  })

  it('памяти нет, запрос идёт, и входит другой человек: новые вызовы не цепляются за прежний запрос', async () => {
    const { auth, getUser, emit } = setup(async () => fail())
    emit('SIGNED_IN', { user: { id: 'u1' } })
    let release: (r: Res) => void = () => {}
    getUser.mockImplementation(() => new Promise<Res>(res => { release = res }))
    const stale = auth.getUser()
    emit('SIGNED_IN', { user: { id: 'u2' } })
    getUser.mockImplementation(async () => ok('u2'))
    const fresh = await auth.getUser()
    release(ok('u1'))
    await stale
    expect(fresh.data.user).toEqual({ id: 'u2' })
  })

  it('ответ прежней сессии, пришедший после того как сессия сменилась без SIGNED_IN, не запоминается', async () => {
    const { auth, getUser, emit } = setup(async () => ok('u1'))
    emit('INITIAL_SESSION', { user: { id: 'u1' } })
    let release: (r: Res) => void = () => {}
    getUser.mockImplementation(() => new Promise<Res>(res => { release = res }))
    const pending = auth.getUser()
    emit('TOKEN_REFRESHED', { user: { id: 'u2' } })
    release(ok('u1'))
    await pending
    getUser.mockImplementation(async () => ok('u2'))
    expect((await auth.getUser()).data.user).toEqual({ id: 'u2' })
  })

  it('вход, когда в памяти пусто, просто идёт в сеть', async () => {
    const { auth, getUser, emit } = setup(async () => fail())
    await auth.getUser()
    getUser.mockImplementation(async () => ok())
    emit('SIGNED_IN', { user: { id: 'u1' } })
    expect((await auth.getUser()).data.user).toEqual({ id: 'u1' })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('событие во время запроса: его (уже устаревший) ответ не запоминается', async () => {
    let release: (r: Res) => void = () => {}
    const { auth, getUser, emit } = setup(() => new Promise<Res>(res => { release = res }))
    const pending = auth.getUser()
    emit('SIGNED_OUT')
    release(ok('old'))
    await pending
    getUser.mockImplementation(async () => ok('new'))
    const next = await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(2)
    expect(next.data.user).toEqual({ id: 'new' })
  })

  it('ошибка (нет сессии) не запоминается: после входа вызов снова идёт в сеть', async () => {
    const { auth, getUser } = setup(async () => fail())
    expect((await auth.getUser()).error).toBeTruthy()
    getUser.mockImplementation(async () => ok())
    expect((await auth.getUser()).data.user).toEqual({ id: 'u1' })
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('вызов с готовым токеном идёт как раньше, мимо памяти и слияния', async () => {
    const { auth, getUser } = setup(async () => ok())
    await auth.getUser()
    await auth.getUser('jwt-1')
    await auth.getUser('jwt-1')
    expect(getUser).toHaveBeenCalledTimes(3)
    expect(getUser).toHaveBeenNthCalledWith(2, 'jwt-1')
  })

  it('сбой запроса (исключение) не заклинивает: следующий вызов пробует заново', async () => {
    const { auth, getUser } = setup(async () => { throw new Error('network') })
    await expect(auth.getUser()).rejects.toThrow('network')
    getUser.mockImplementation(async () => ok())
    expect((await auth.getUser()).data.user).toEqual({ id: 'u1' })
  })

  it('исходный getUser вызывается как метод объекта auth (this сохраняется)', async () => {
    const seen: unknown[] = []
    const auth = {
      tag: 'auth',
      async getUser(this: { tag: string }) { seen.push(this.tag); return ok() },
      onAuthStateChange: () => undefined,
    }
    coalesceGetUser(auth as never)
    await (auth as { getUser: () => Promise<Res> }).getUser()
    expect(seen).toEqual(['auth'])
  })
})
