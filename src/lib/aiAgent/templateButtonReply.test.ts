import { describe, it, expect, vi } from 'vitest'
import { sendTemplateReply } from './templateButtonReply'
import { parseTemplateReplyText } from '@/lib/instagramButtonTemplate'

const TEXT = 'Вот проверка по БИН 👇 https://invoices.kz/go/dm-kontragent'
const button = { title: 'Проверка', subtitle: 'КГД', buttonTitle: 'Открыть проверку', url: 'https://invoices.kz/go/dm-kontragent-btn' }

function deps(over: Partial<{ sendButton: any; sendText: any }> = {}) {
  return {
    sendButton: vi.fn(async () => {}),
    sendText: vi.fn(async () => {}),
    onButtonFailed: vi.fn(async () => {}),
    ...over,
  }
}

describe('sendTemplateReply', () => {
  it('успех карточки: текст НЕ отправляется (нет дублей), в журнал -- читаемый текст', async () => {
    const d = deps()
    const r = await sendTemplateReply({ reply_text: TEXT, button }, d, true)
    expect(d.sendButton).toHaveBeenCalledTimes(1)
    expect(d.sendText).not.toHaveBeenCalled()
    expect(d.onButtonFailed).not.toHaveBeenCalled()
    expect(r.via).toBe('button')
    expect(r.loggedText).toBe('Проверка\nКГД\nhttps://invoices.kz/go/dm-kontragent-btn')
    expect(r.loggedText).not.toContain('{')
  })

  it.each([
    ['отказ Meta (формат/права)', Object.assign(new Error('Invalid parameter'), { status: 400 })],
    ['не поддержан', Object.assign(new Error('(#3) Capability'), { status: 403 })],
    ['нет ответа (таймаут)', Object.assign(new Error('No response'), { status: 0 })],
  ])('карточка упала (%s): тот же ответ уходит обычным текстом, ровно один раз', async (_n, error) => {
    const d = deps({ sendButton: vi.fn(async () => { throw error }) })
    const r = await sendTemplateReply({ reply_text: TEXT, button }, d, true)
    expect(d.sendButton).toHaveBeenCalledTimes(1)
    expect(d.sendText).toHaveBeenCalledTimes(1)
    expect(d.sendText).toHaveBeenCalledWith(TEXT)
    expect(d.onButtonFailed).toHaveBeenCalledWith(error)
    expect(r).toEqual({ via: 'text', loggedText: TEXT })
  })

  it('упал и обычный текст: ошибка уходит вызывающему (как у прежнего sendDirectMessage)', async () => {
    const d = deps({ sendButton: vi.fn(async () => { throw new Error('x') }), sendText: vi.fn(async () => { throw new Error('boom') }) })
    await expect(sendTemplateReply({ reply_text: TEXT, button }, d, true)).rejects.toThrow('boom')
  })

  it('сбой журнала ошибок не мешает запасному тексту', async () => {
    const d = deps({ sendButton: vi.fn(async () => { throw new Error('x') }) })
    d.onButtonFailed = vi.fn(async () => { throw new Error('log failed') })
    await sendTemplateReply({ reply_text: TEXT, button }, d, true)
    expect(d.sendText).toHaveBeenCalledWith(TEXT)
  })

  it('строка без карточки: только текст, как раньше', async () => {
    const d = deps()
    const r = await sendTemplateReply({ reply_text: TEXT, button: null }, d)
    expect(d.sendButton).not.toHaveBeenCalled()
    expect(d.sendText).toHaveBeenCalledWith(TEXT)
    expect(r).toEqual({ via: 'text', loggedText: TEXT })
  })

  it('некорректный блок: разбор даёт button=null, значит уйдёт только чистый текст', async () => {
    const parsed = parseTemplateReplyText(`${TEXT}\n@@button\ntitle: x\nbutton: y\nurl: http://x.kz`)
    const d = deps()
    await sendTemplateReply({ reply_text: parsed.plainText, button: parsed.button }, d, true)
    expect(d.sendButton).not.toHaveBeenCalled()
    expect(d.sendText).toHaveBeenCalledWith(TEXT)
  })

  // Десктоп: Meta принимает карточку с HTTP 200, но клиент её не видит, а запасной
  // текст по ошибке API не сработает. Поэтому на набранное слово карточка по умолчанию не шлётся.
  it('набранное слово (не postback): карточка НЕ шлётся, уходит текст', async () => {
    const d = deps()
    const r = await sendTemplateReply({ reply_text: TEXT, button }, d, false)
    expect(d.sendButton).not.toHaveBeenCalled()
    expect(d.sendText).toHaveBeenCalledWith(TEXT)
    expect(r).toEqual({ via: 'text', loggedText: TEXT })
  })

  it('набранное слово с cardOnTyped (typed: yes): карточка шлётся', async () => {
    const d = deps()
    const r = await sendTemplateReply({ reply_text: TEXT, button, cardOnTyped: true }, d, false)
    expect(d.sendButton).toHaveBeenCalledTimes(1)
    expect(d.sendText).not.toHaveBeenCalled()
    expect(r.via).toBe('button')
  })
})
