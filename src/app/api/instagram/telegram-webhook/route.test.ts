import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const db = vi.hoisted(() => ({
  queries: [] as any[],
  handler: (_q: any, _mode: string): any => ({ data: null, error: null }),
  pendingAfter: [] as (() => unknown)[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const q: any = { table, op: 'select', payload: null, filters: [] as any[] }
      const run = (mode: string) => {
        db.queries.push({ ...q, mode, filters: [...q.filters] })
        return Promise.resolve(db.handler(q, mode))
      }
      const b: any = {
        insert(p: any) { q.op = 'insert'; q.payload = p; return b },
        update(p: any) { q.op = 'update'; q.payload = p; return b },
        select() { return b },
        in() { return b },
        order() { return b },
        limit() { return b },
        eq(c: string, v: any) { q.filters.push([c, v]); return b },
        single: () => run('single'),
        maybeSingle: () => run('maybeSingle'),
        then: (res: any, rej: any) => run('await').then(res, rej),
      }
      return b
    },
  }),
}))

// after() вне запроса Next не работает: ловим колбэк, чтобы проверить, что
// ответ уходит ДО долгой работы, и запустить её явно.
vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => unknown) => { db.pendingAfter.push(fn) } }
})

const lib = vi.hoisted(() => ({
  publishReel: vi.fn(),
  publishToInstagram: vi.fn(),
}))
vi.mock('@/lib/instagram', async () => {
  const actual = await vi.importActual<typeof import('@/lib/instagram')>('@/lib/instagram')
  return { ...actual, publishReel: lib.publishReel, publishToInstagram: lib.publishToInstagram, replyToComment: vi.fn(), sendDirectMessage: vi.fn() }
})
vi.mock('@/lib/instagramAiReply', () => ({ extractTriggerWords: vi.fn(async () => []) }))
vi.mock('@/lib/kaspiPay/crypto', () => ({ decryptAtRest: vi.fn() }))
vi.mock('@/lib/aiAgent/connection', () => ({ getKey: vi.fn() }))

import { NextRequest } from 'next/server'
import { POST } from './route'
import { InstagramPublishError } from '@/lib/instagramReel'

let tgCalls: { method: string; body: any }[]

function callback(data: string) {
  return {
    callback_query: {
      id: 'cb1',
      data,
      message: { message_id: 55, text: '🎬 Новый Reels для Instagram\n\nПодпись <b>', chat: { id: 42 } },
    },
  }
}

function req(update: unknown) {
  return new NextRequest('http://localhost/api/instagram/telegram-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'test-secret' },
    body: JSON.stringify(update),
  })
}

const reelDraft = {
  id: 'd1',
  status: 'pending',
  caption: 'Подпись',
  image_url: 'https://abc.supabase.co/storage/v1/object/public/instagram-drafts/reels/1.jpg',
  image_urls: ['https://abc.supabase.co/storage/v1/object/public/instagram-drafts/reels/1.jpg'],
  media_kind: 'reel',
  video_url: 'https://abc.supabase.co/storage/v1/object/public/instagram-drafts/reels/1.mp4',
  cover_url: 'https://abc.supabase.co/storage/v1/object/public/instagram-drafts/reels/1.jpg',
  share_to_feed: true,
}

function setDraft(draft: any, claim: { id: string } | null = { id: 'd1' }) {
  db.handler = (q, mode) => {
    if (q.table === 'instagram_drafts' && q.op === 'select' && mode === 'single') return { data: draft, error: null }
    if (q.table === 'instagram_drafts' && q.op === 'update' && mode === 'maybeSingle') return { data: claim, error: null }
    if (q.table === 'profiles') return { data: [], error: null }
    return { data: null, error: null }
  }
}

const draftUpdates = () => db.queries.filter(q => q.table === 'instagram_drafts' && q.op === 'update' && q.mode === 'await')
const tg = (m: string) => tgCalls.filter(c => c.method === m)

async function flushAfter() {
  while (db.pendingAfter.length) await db.pendingAfter.shift()!()
}

beforeEach(() => {
  db.queries = []
  db.pendingAfter = []
  tgCalls = []
  lib.publishReel.mockReset()
  lib.publishToInstagram.mockReset()
  vi.stubEnv('IG_AUTOMATION_SECRET', 'test-secret')
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg-token')
  vi.stubEnv('TELEGRAM_CHAT_ID', '42')
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input)
    if (!url.includes('api.telegram.org')) throw new Error(`unexpected real fetch: ${url}`)
    tgCalls.push({ method: url.split('/').pop()!, body: JSON.parse(String(init!.body)) })
    return new Response(JSON.stringify({ ok: true }))
  }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('telegram-webhook: publish a reel', () => {
  it('claims the row, answers immediately, publishes in after() and reports success', async () => {
    setDraft(reelDraft)
    lib.publishReel.mockResolvedValue({ mediaId: 'm1', containerId: 'c1', permalink: 'https://www.instagram.com/reel/x/' })

    const res = await POST(req(callback('ig_publish:d1')))
    expect(res.status).toBe(200)

    // ответ ушёл, а публикация ещё не начиналась
    expect(lib.publishReel).not.toHaveBeenCalled()
    expect(db.pendingAfter).toHaveLength(1)
    expect(tg('answerCallbackQuery')[0].body.text).toContain('Публикую')
    const progress = tg('editMessageText')[0].body
    expect(progress.reply_markup).toEqual({ inline_keyboard: [] })
    // текст исходного сообщения экранирован для HTML
    expect(progress.text).toContain('Подпись &lt;b&gt;')

    // захват: условный update pending -> approved
    const claim = db.queries.find(q => q.op === 'update' && q.mode === 'maybeSingle')!
    expect(claim.payload).toEqual({ status: 'approved' })
    expect(claim.filters).toEqual([['id', 'd1'], ['status', 'pending']])

    await flushAfter()
    expect(lib.publishReel).toHaveBeenCalledTimes(1)
    expect(lib.publishReel.mock.calls[0][0]).toBe(reelDraft.video_url)
    expect(lib.publishReel.mock.calls[0][1]).toBe('Подпись')
    expect(lib.publishReel.mock.calls[0][2]).toMatchObject({ coverUrl: reelDraft.cover_url, shareToFeed: true })

    const final = draftUpdates().at(-1)!
    expect(final.payload).toMatchObject({ status: 'published', ig_media_id: 'm1' })
    expect(final.payload.published_at).toBeTruthy()

    expect(tg('editMessageText').at(-1)!.body.text).toContain('✅ Reel опубликован')
    expect(tg('editMessageText').at(-1)!.body.reply_markup).toEqual({ inline_keyboard: [] })
    const notice = tg('sendMessage').at(-1)!.body
    expect(notice.text).toContain('https://www.instagram.com/reel/x/')
  })

  it('records a human-readable failure and tells why', async () => {
    setDraft(reelDraft)
    lib.publishReel.mockRejectedValue(new InstagramPublishError('x', 'processing', 'c1', 'code 2207026'))

    await POST(req(callback('ig_publish:d1')))
    await flushAfter()

    const final = draftUpdates().at(-1)!
    expect(final.payload.status).toBe('failed')
    expect(final.payload.error).toContain('отклонил видео')
    expect(final.payload.error).toContain('2207026')
    const why = tg('sendMessage').at(-1)!.body.text
    expect(why).toContain('не опубликован')
    expect(why).toContain('Причина')
    expect(JSON.stringify(tgCalls)).not.toContain('tg-token')
  })

  it('still publishes when the Telegram acknowledgement fails (no stuck approved row)', async () => {
    setDraft(reelDraft)
    lib.publishReel.mockResolvedValue({ mediaId: 'm2', containerId: 'c2', permalink: null })
    // сбой сети именно на ответе на кнопку и правке сообщения, до публикации
    let acks = 0
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const method = String(input).split('/').pop()!
      if ((method === 'answerCallbackQuery' || method === 'editMessageText') && acks++ < 1) {
        throw new Error('network down')
      }
      tgCalls.push({ method, body: JSON.parse(String(init!.body)) })
      return new Response(JSON.stringify({ ok: true }))
    }))

    const res = await POST(req(callback('ig_publish:d1')))
    expect(res.status).toBe(200)
    // after() запланирован, несмотря на упавший Telegram
    expect(db.pendingAfter).toHaveLength(1)
    await flushAfter()
    expect(lib.publishReel).toHaveBeenCalledTimes(1)
    expect(draftUpdates().at(-1)!.payload).toMatchObject({ status: 'published', ig_media_id: 'm2' })
  })

  it('marks failed (not stuck) when the draft has no video_url', async () => {
    setDraft({ ...reelDraft, video_url: null })
    await POST(req(callback('ig_publish:d1')))
    await flushAfter()
    expect(lib.publishReel).not.toHaveBeenCalled()
    expect(draftUpdates().at(-1)!.payload.status).toBe('failed')
  })

  it('ignores a double press that loses the claim', async () => {
    setDraft(reelDraft, null)
    const res = await POST(req(callback('ig_publish:d1')))
    expect(res.status).toBe(200)
    expect(tg('answerCallbackQuery')[0].body.text).toBe('Уже обработано')
    expect(db.pendingAfter).toHaveLength(0)
    expect(lib.publishReel).not.toHaveBeenCalled()
  })

  it('ignores a late press on an already published draft', async () => {
    setDraft({ ...reelDraft, status: 'published' })
    await POST(req(callback('ig_publish:d1')))
    expect(tg('answerCallbackQuery')[0].body.text).toBe('Уже обработано')
    expect(db.queries.some(q => q.op === 'update')).toBe(false)
    expect(lib.publishReel).not.toHaveBeenCalled()
  })

  it('ignores a press while the draft is being published (status approved)', async () => {
    setDraft({ ...reelDraft, status: 'approved' })
    await POST(req(callback('ig_publish:d1')))
    expect(tg('answerCallbackQuery')[0].body.text).toBe('Уже обработано')
    expect(lib.publishReel).not.toHaveBeenCalled()
  })

  it('reject works for a reel draft', async () => {
    setDraft(reelDraft)
    await POST(req(callback('ig_reject:d1')))
    expect(draftUpdates().at(-1)!.payload).toEqual({ status: 'rejected' })
    expect(lib.publishReel).not.toHaveBeenCalled()
  })
})

describe('telegram-webhook: image drafts unchanged', () => {
  const imageDraft = {
    id: 'i1',
    status: 'pending',
    caption: 'cap',
    image_url: 'https://x/a.png',
    image_urls: ['https://x/a.png', 'https://x/b.png'],
  }

  it('claims the row (pending -> approved) before publishing, without after()', async () => {
    setDraft(imageDraft)
    lib.publishToInstagram.mockResolvedValue('post-1')
    await POST(req(callback('ig_publish:i1')))

    expect(lib.publishToInstagram).toHaveBeenCalledWith(['https://x/a.png', 'https://x/b.png'], 'cap', undefined)
    expect(lib.publishReel).not.toHaveBeenCalled()
    expect(db.pendingAfter).toHaveLength(0)
    const claim = db.queries.find(q => q.mode === 'maybeSingle' && q.op === 'update')!
    expect(claim.payload).toEqual({ status: 'approved' })
    expect(claim.filters).toContainEqual(['status', 'pending'])
    expect(draftUpdates().at(-1)!.payload).toMatchObject({ status: 'published', ig_media_id: 'post-1' })
    expect(tg('editMessageText').at(-1)!.body.text).toContain('Опубликовано в Instagram')
  })

  it('ignores a double press that loses the claim: no second publish', async () => {
    setDraft(imageDraft, null)
    await POST(req(callback('ig_publish:i1')))
    expect(tg('answerCallbackQuery')[0].body.text).toBe('Уже обработано')
    expect(lib.publishToInstagram).not.toHaveBeenCalled()
  })

  it('escapes the original message text when editing it', async () => {
    setDraft(imageDraft)
    lib.publishToInstagram.mockResolvedValue('post-1')
    await POST(req(callback('ig_publish:i1')))
    const text = tg('editMessageText').at(-1)!.body.text as string
    expect(text).toContain('Подпись &lt;b&gt;')
    expect(text).not.toContain('<b>')
  })

  it('records a failure like before', async () => {
    setDraft(imageDraft)
    lib.publishToInstagram.mockRejectedValue(new Error('Application does not have permission for this action'))
    await POST(req(callback('ig_publish:i1')))
    expect(draftUpdates().at(-1)!.payload).toEqual({ status: 'failed', error: 'Application does not have permission for this action' })
  })
})
