import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Подмена Supabase: цепочка запросов записывается, ответ задаёт тест.
const db = vi.hoisted(() => ({
  queries: [] as any[],
  handler: (_q: any, _mode: string): any => ({ data: null, error: null }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      const q: any = { table, op: 'select', payload: null, filters: [] as any[] }
      const run = (mode: string) => {
        db.queries.push({ ...q, mode })
        return Promise.resolve(db.handler(q, mode))
      }
      const b: any = {
        insert(p: any) { q.op = 'insert'; q.payload = p; return b },
        update(p: any) { q.op = 'update'; q.payload = p; return b },
        select() { return b },
        eq(c: string, v: any) { q.filters.push([c, v]); return b },
        single: () => run('single'),
        maybeSingle: () => run('maybeSingle'),
        then: (res: any, rej: any) => run('await').then(res, rej),
      }
      return b
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/instagram-drafts/${p}` } }) }) },
  }),
}))

import { NextRequest } from 'next/server'
import { POST } from './route'

const SB = 'https://abc.supabase.co'
const VIDEO = `${SB}/storage/v1/object/public/instagram-drafts/reels/1.mp4`
const COVER = `${SB}/storage/v1/object/public/instagram-drafts/reels/1.jpg`

let fetchCalls: { url: string; init?: RequestInit; body?: any }[]
let headBytes: number | null
let headStatus: number
let sendVideoOk: boolean

function stubFetch() {
  fetchCalls = []
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    fetchCalls.push({ url, init, body })
    if (init?.method === 'HEAD') {
      return new Response(null, {
        status: headStatus,
        headers: headBytes === null ? { 'content-type': 'video/mp4' } : { 'content-type': 'video/mp4', 'content-length': String(headBytes) },
      })
    }
    if (url.includes('api.telegram.org')) {
      if (url.endsWith('/sendVideo') && !sendVideoOk) return new Response(JSON.stringify({ ok: false }), { status: 400 })
      return new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }))
    }
    throw new Error(`unexpected real fetch: ${url}`)
  }))
}

function req(body: unknown, secret: string | null = 'test-secret') {
  return new NextRequest('http://localhost/api/instagram/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
    body: JSON.stringify(body),
  })
}

const telegramCalls = () => fetchCalls.filter(c => c.url.includes('api.telegram.org'))
const method = (c: { url: string }) => c.url.split('/').pop()

beforeEach(() => {
  db.queries = []
  db.handler = (q, mode) => (q.op === 'insert' ? { data: { id: 'draft-1' }, error: null } : { data: null, error: null })
  headBytes = 2_000_000
  headStatus = 200
  sendVideoOk = true
  vi.stubEnv('IG_AUTOMATION_SECRET', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SB)
  vi.stubEnv('TELEGRAM_BOT_TOKEN', 'tg-token')
  vi.stubEnv('TELEGRAM_CHAT_ID', '42')
  stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('POST /api/instagram/draft (reel)', () => {
  const body = { videoUrl: VIDEO, coverUrl: COVER, caption: 'Подпись', mediaKind: 'reel' }

  it('rejects a wrong secret', async () => {
    const res = await POST(req(body, 'nope'))
    expect(res.status).toBe(401)
    expect(db.queries).toHaveLength(0)
  })

  it('rejects a video on a foreign host without any outbound request', async () => {
    const res = await POST(req({ ...body, videoUrl: 'https://evil.example.com/a.mp4' }))
    expect(res.status).toBe(400)
    expect(fetchCalls).toHaveLength(0)
  })

  it('rejects caption > 2200', async () => {
    const res = await POST(req({ ...body, caption: 'x'.repeat(2201) }))
    expect(res.status).toBe(400)
  })

  it('rejects a missing file in storage', async () => {
    headStatus = 404
    const res = await POST(req(body))
    expect(res.status).toBe(400)
    expect(db.queries.some(q => q.op === 'insert')).toBe(false)
  })

  it('rejects a file over 300 MB', async () => {
    headBytes = 301 * 1024 * 1024
    const res = await POST(req(body))
    expect(res.status).toBe(400)
  })

  it('creates the draft, sends the video and the buttons message', async () => {
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, id: 'draft-1', mediaKind: 'reel', telegram: true })

    const insert = db.queries.find(q => q.op === 'insert')!
    expect(insert.payload).toMatchObject({
      media_kind: 'reel',
      video_url: VIDEO,
      cover_url: COVER,
      share_to_feed: true,
      caption: 'Подпись',
      image_url: COVER,
    })

    expect(telegramCalls().map(method)).toEqual(['sendVideo', 'sendMessage'])
    expect(telegramCalls()[0].body).toMatchObject({ chat_id: '42', video: VIDEO })
    const msg = telegramCalls()[1].body
    expect(msg.text).toContain('Reels')
    expect(msg.reply_markup.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual(['ig_publish:draft-1', 'ig_reject:draft-1'])

    const link = db.queries.find(q => q.op === 'update')!
    expect(link.payload).toMatchObject({ telegram_chat_id: '42', telegram_message_id: 777 })
  })

  it('falls back to a link message when the file is over 20 MB (no sendVideo)', async () => {
    headBytes = 25 * 1024 * 1024
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(telegramCalls().map(method)).toEqual(['sendMessage', 'sendMessage'])
    expect(telegramCalls()[0].body.text).toContain('больше 20 МБ')
    expect(telegramCalls()[0].body.text).toContain(VIDEO)
  })

  it('falls back to a link message when sendVideo fails', async () => {
    sendVideoOk = false
    const res = await POST(req(body))
    expect(res.status).toBe(200)
    expect(telegramCalls().map(method)).toEqual(['sendVideo', 'sendMessage', 'sendMessage'])
    expect(telegramCalls()[1].body.text).toContain(VIDEO)
  })

  it('answers 409 with a clear message when the migration is not applied', async () => {
    db.handler = q =>
      q.op === 'insert'
        ? { data: null, error: { code: 'PGRST204', message: "Could not find the 'media_kind' column of 'instagram_drafts' in the schema cache" } }
        : { data: null, error: null }
    const res = await POST(req(body))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('instagram_drafts_video.sql')
    // Telegram не трогаем, пока черновик не создан
    expect(telegramCalls()).toHaveLength(0)
  })

  it('passes other DB errors through as 500', async () => {
    db.handler = q => (q.op === 'insert' ? { data: null, error: { code: '23505', message: 'duplicate' } } : { data: null, error: null })
    const res = await POST(req(body))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/instagram/draft (images stay untouched)', () => {
  it('inserts exactly the old columns, no media_kind/video_url', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('api.telegram.org')) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))
      if (init?.method === 'HEAD') throw new Error('image flow must not HEAD')
      return new Response(new Blob(['x']), { headers: { 'content-type': 'image/png' } })
    }))
    const res = await POST(req({ imageUrls: ['https://cdn.example.com/a.png'], caption: 'cap' }))
    expect(res.status).toBe(200)
    const insert = db.queries.find(q => q.op === 'insert')!
    expect(Object.keys(insert.payload).sort()).toEqual(['caption', 'image_url', 'image_urls'])
  })

  it('still validates image payloads', async () => {
    const res = await POST(req({ caption: 'cap' }))
    expect(res.status).toBe(400)
  })
})
