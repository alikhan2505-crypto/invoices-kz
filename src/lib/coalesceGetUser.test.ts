import { describe, it, expect, vi } from 'vitest'
import { coalesceGetUser, GET_USER_CACHE_MS } from './coalesceGetUser'

type Res = { data: { user: { id: string } | null }; error: Error | null }
const ok = (id = 'u1'): Res => ({ data: { user: { id } }, error: null })
const fail = (): Res => ({ data: { user: null }, error: new Error('no session') })

function setup(impl: (jwt?: string) => Promise<Res>, clock = { t: 0 }) {
  let listener: (() => void) | undefined
  const getUser = vi.fn(impl)
  const auth = {
    getUser,
    onAuthStateChange: (cb: () => void) => { listener = cb },
  }
  coalesceGetUser(auth, { now: () => clock.t })
  return { auth, getUser, clock, emit: () => listener?.() }
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

  it('любое событие входа/выхода/обновления сбрасывает память', async () => {
    const { auth, getUser, emit } = setup(async () => ok())
    await auth.getUser()
    emit()
    await auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(2)
  })

  it('событие во время запроса: его (уже устаревший) ответ не запоминается', async () => {
    let release: (r: Res) => void = () => {}
    const { auth, getUser, emit } = setup(() => new Promise<Res>(res => { release = res }))
    const pending = auth.getUser()
    emit()
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
