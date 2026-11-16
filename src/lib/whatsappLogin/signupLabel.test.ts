import { describe, it, expect, vi } from 'vitest'
import { signupLabel } from './signupLabel'
import { makeLoginDb } from './fakeLoginDb.testkit'

describe('signupLabel', () => {
  it('настоящая почта: показываем её, в базу не ходим', async () => {
    const { client } = makeLoginDb()
    const spy = vi.spyOn(client, 'from')
    expect(await signupLabel(client, 'u1', 'a@b.kz')).toBe('a@b.kz')
    expect(spy).not.toHaveBeenCalled()
  })

  it('служебный адрес или пустая почта и номер привязан: «через WhatsApp +7•••0406»', async () => {
    const { client, tables } = makeLoginDb()
    ;(tables.whatsapp_identities ||= []).push({ wa_id: '77776970406', user_id: 'u1' })
    expect(await signupLabel(client, 'u1', null)).toBe('через WhatsApp +7•••0406')
    expect(await signupLabel(client, 'u1', 'wa77776970406@wa.invalid')).toBe('через WhatsApp +7•••0406')
  })

  it('привязка появилась не сразу: перечитывает и находит', async () => {
    const { client, tables } = makeLoginDb()
    const sleep = vi.fn(async () => { (tables.whatsapp_identities ||= []).push({ wa_id: '77776970406', user_id: 'u1' }) })
    expect(await signupLabel(client, 'u1', null, { sleep })).toBe('через WhatsApp +7•••0406')
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('ни почты, ни номера: «без email» после повторов', async () => {
    const { client } = makeLoginDb()
    const sleep = vi.fn(async () => {})
    expect(await signupLabel(client, 'u1', null, { sleep, retries: 2 })).toBe('без email')
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
