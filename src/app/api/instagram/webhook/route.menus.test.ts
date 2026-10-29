import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

// Маршрут вебхука Instagram: нажатие «готового вопроса» (postback), вложения
// без текста и неизменность поведения агента без особой строки @attachment.

const h = vi.hoisted(() => ({
  incoming: [] as any[],
  directs: [] as { to: string; text: string }[],
  rule: { enabled: false, images: false, text: null as string | null },
  fetchCalls: 0,
  replyState: 'reply',
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/aiAgent/webhookHandler', () => ({
  loadTenantConnection: async () => ({ connectionId: 'c1', agentId: 'agent1', externalAccountId: 'ig1', accessToken: 'tok' }),
  handleTenantIncoming: async (_c: any, p: any) => { h.incoming.push(p) },
  handleInstagramFlowButtonClick: async (_c: any, p: any) => { h.incoming.push({ flowClick: p }) },
  loadAttachmentRule: async () => h.rule,
}))
vi.mock('@/lib/aiAgent/replyStateLoader', () => ({ createReplyStateLoader: () => async () => h.replyState }))
vi.mock('@/lib/instagram', () => ({
  replyToComment: async () => {},
  sendDirectMessage: async (to: string, text: string) => { h.directs.push({ to, text }) },
}))
vi.mock('@/lib/instagramAiReply', () => ({ generateAiReply: async () => ({ replyText: '', urgent: false }) }))
vi.mock('@/lib/openaiWhisper', () => ({ transcribeAudio: async () => 'расшифровка' }))

import { NextRequest } from 'next/server'
import { POST } from './route'

const SECRET = 'test-app-secret'

function post(messaging: any[]) {
  const body = JSON.stringify({ object: 'instagram', entry: [{ id: 'ig1', time: 1, messaging }] })
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
  return POST(new NextRequest('http://localhost/api/instagram/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig } }))
}

const base = { sender: { id: 'u1' }, recipient: { id: 'ig1' }, timestamp: 1 }

beforeEach(() => {
  process.env.INSTAGRAM_APP_SECRET = SECRET
  delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  h.incoming = []
  h.directs = []
  h.rule = { enabled: false, images: false, text: null }
  h.replyState = 'reply'
  h.fetchCalls = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    h.fetchCalls++
    // PNG-подобные байты
    return { ok: true, arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2]).buffer }
  }))
})

describe('подпись вебхука', () => {
  const sendSigned = (secret: string) => {
    const body = JSON.stringify({ object: 'instagram', entry: [{ id: 'ig1', time: 1, messaging: [{ ...base, postback: { mid: 'S1', title: 'x', payload: 'СЧЁТ' } }] }] })
    const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
    return POST(new NextRequest('http://localhost/api/instagram/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig } }))
  }
  it('секрет приложения Meta (WHATSAPP_APP_SECRET) тоже принимается', async () => {
    process.env.WHATSAPP_APP_SECRET = 'meta-app-secret'
    expect((await sendSigned('meta-app-secret')).status).toBe(200)
    expect(h.incoming).toHaveLength(1)
    delete process.env.WHATSAPP_APP_SECRET
  })
  it('чужой секрет отклоняется (401), событие не обрабатывается', async () => {
    process.env.WHATSAPP_APP_SECRET = 'meta-app-secret'
    expect((await sendSigned('someone-else')).status).toBe(401)
    expect(h.incoming).toHaveLength(0)
    delete process.env.WHATSAPP_APP_SECRET
  })
})

describe('postback (нажатие «готового вопроса»)', () => {
  it('payload идёт в конвейер DM как текст, с меткой pb: и подписью кнопки', async () => {
    await post([{ ...base, postback: { mid: 'M1', title: 'Проверить контрагента по БИН', payload: 'КОНТРАГЕНТ' } }])
    expect(h.incoming).toEqual([expect.objectContaining({
      source: 'dm', externalId: 'pb:M1', incomingText: 'КОНТРАГЕНТ', loggedText: 'Проверить контрагента по БИН',
      replyTarget: 'u1', fromPostback: true,
    })])
    expect(h.directs).toHaveLength(0)
  })
  it('пустой payload игнорируется', async () => {
    await post([{ ...base, postback: { mid: 'M1', title: 'x', payload: '' } }])
    expect(h.incoming).toHaveLength(0)
  })
  it('быстрый ответ с payload не btn: это нажатие ice breaker, пришедшее сообщением: идёт в конвейер DM как слово', async () => {
    await post([{ ...base, message: { mid: 'Q1', text: 'Налоги ИП на упрощёнке', quick_reply: { payload: 'НАЛОГИ' } } }])
    expect(h.incoming).toEqual([expect.objectContaining({
      source: 'dm', externalId: 'pb:Q1', incomingText: 'НАЛОГИ', loggedText: 'Налоги ИП на упрощёнке', replyTarget: 'u1', fromPostback: true,
    })])
  })
  it('postback в формате changes (field messaging_postbacks) тоже идёт в конвейер DM', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [{ id: 'ig1', time: 1, changes: [{ field: 'messaging_postbacks', value: { ...base, postback: { mid: 'C1', title: 'Счёт', payload: 'СЧЁТ' } } }] }] })
    const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
    await POST(new NextRequest('http://localhost/api/instagram/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': sig } }))
    expect(h.incoming).toEqual([expect.objectContaining({ externalId: 'pb:C1', incomingText: 'СЧЁТ', fromPostback: true })])
  })
  it('быстрый ответ сценария btn: идёт в сценарии, как раньше', async () => {
    await post([{ ...base, message: { mid: 'Q2', text: 'Да', quick_reply: { payload: 'btn:s1:0' } } }])
    expect(h.incoming).toEqual([{ flowClick: { externalId: 'Q2', replyTarget: 'u1', clickedPayload: 'btn:s1:0' } }])
  })
})

describe('вложения', () => {
  it('текст + вложение: обрабатывается текст, вложение игнорируется, «не умею» нет', async () => {
    await post([{ ...base, message: { mid: 'A1', text: 'Здравствуйте, как проверить БИН компании?', attachments: [{ type: 'ig_reel', payload: { url: 'https://x/reel' } }] } }])
    expect(h.incoming).toEqual([expect.objectContaining({ externalId: 'A1', incomingText: 'Здравствуйте, как проверить БИН компании?' })])
    expect(h.incoming[0].attachmentOnly).toBeUndefined()
    expect(h.directs).toHaveLength(0)
  })

  describe('агент БЕЗ строки @attachment (поведение прежнее)', () => {
    it('пересланный рилс без текста -- «Пока не умею…» как раньше', async () => {
      await post([{ ...base, message: { mid: 'A2', attachments: [{ type: 'ig_reel', payload: { url: 'https://x/reel' } }] } }])
      expect(h.incoming).toHaveLength(0)
      expect(h.directs).toHaveLength(1)
      expect(h.directs[0].text).toContain('Пока не умею')
    })
    it('вложение без url -- молчание как раньше', async () => {
      await post([{ ...base, message: { mid: 'A3', attachments: [{ type: 'share', payload: {} }] } }])
      expect(h.incoming).toHaveLength(0)
      expect(h.directs).toHaveLength(0)
    })
    it('фото уходит в ИИ-распознавание (media: image) как раньше', async () => {
      await post([{ ...base, message: { mid: 'A4', attachments: [{ type: 'image', payload: { url: 'https://x/p.png' } }] } }])
      expect(h.incoming).toHaveLength(1)
      expect(h.incoming[0].media?.kind).toBe('image')
      expect(h.incoming[0].attachmentOnly).toBeUndefined()
    })
  })

  describe('агент со строкой @attachment (без @attachment_image)', () => {
    beforeEach(() => { h.rule = { enabled: true, images: false, text: 'Меню' } })
    it('пересланный рилс -- меню вместо «не умею»', async () => {
      await post([{ ...base, message: { mid: 'B1', attachments: [{ type: 'ig_reel', payload: { url: 'https://x/reel' } }] } }])
      expect(h.incoming).toEqual([expect.objectContaining({ externalId: 'B1', attachmentOnly: true, source: 'dm' })])
      expect(h.directs).toHaveLength(0)
      expect(h.fetchCalls).toBe(0)
    })
    it('вложение без url тоже получает меню', async () => {
      await post([{ ...base, message: { mid: 'B2', attachments: [{ type: 'share', payload: {} }] } }])
      expect(h.incoming).toEqual([expect.objectContaining({ externalId: 'B2', attachmentOnly: true })])
    })
    it('обычное фото по-прежнему идёт в ИИ-распознавание', async () => {
      await post([{ ...base, message: { mid: 'B3', attachments: [{ type: 'image', payload: { url: 'https://x/p.png' } }] } }])
      expect(h.incoming[0].media?.kind).toBe('image')
      expect(h.incoming[0].attachmentOnly).toBeUndefined()
    })
    it('голосовое по-прежнему расшифровывается', async () => {
      await post([{ ...base, message: { mid: 'B4', attachments: [{ type: 'audio', payload: { url: 'https://x/a.mp4' } }] } }])
      expect(h.incoming[0].incomingText).toBe('расшифровка')
    })
  })

  describe('агент со строками @attachment + @attachment_image', () => {
    beforeEach(() => { h.rule = { enabled: true, images: true, text: 'Меню' } })
    it('фото без текста -- меню, скачивания нет', async () => {
      await post([{ ...base, message: { mid: 'C1', attachments: [{ type: 'image', payload: { url: 'https://x/p.png' } }] } }])
      expect(h.incoming).toEqual([expect.objectContaining({ externalId: 'C1', attachmentOnly: true })])
      expect(h.fetchCalls).toBe(0)
    })
  })

  it('агент на паузе/черновик: меню не отправляется', async () => {
    h.rule = { enabled: true, images: true, text: 'Меню' }
    h.replyState = 'paused'
    await post([{ ...base, message: { mid: 'D1', attachments: [{ type: 'share', payload: { url: 'https://x' } }] } }])
    expect(h.incoming).toHaveLength(0)
    expect(h.directs).toHaveLength(0)
  })
})
