import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./instagramPublishToken', () => ({
  loadPublishToken: vi.fn(async () => 'IGAA_test_token_value_0123456789'),
}))

import {
  IMAGE_WAIT,
  VIDEO_WAIT,
  buildReelContainerParams,
  publishReel,
  publishToInstagram,
  waitForContainer,
} from './instagram'
import { InstagramPublishError } from './instagramReel'

// Часы, которые двигает только sleep: тест не ждёт по-настоящему.
function fakeClock() {
  let t = 0
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms
    },
    elapsed: () => t,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>

function mockFetch(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fn = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

const isStatus = (u: string) => u.includes('fields=status_code')
const isCreate = (u: string) => u.endsWith('/media')
const isPublish = (u: string) => u.endsWith('/media_publish')
const isPermalink = (u: string) => u.includes('fields=permalink')

beforeEach(() => {
  vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', '17841000')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('buildReelContainerParams', () => {
  it('builds REELS params with defaults', () => {
    expect(buildReelContainerParams('https://x/v.mp4', 'hi')).toEqual({
      media_type: 'REELS',
      video_url: 'https://x/v.mp4',
      caption: 'hi',
      share_to_feed: true,
    })
  })
  it('adds cover_url and honors share_to_feed=false', () => {
    const p = buildReelContainerParams('https://x/v.mp4', 'hi', { coverUrl: 'https://x/c.jpg', shareToFeed: false })
    expect(p.cover_url).toBe('https://x/c.jpg')
    expect(p.share_to_feed).toBe(false)
  })
})

describe('waitForContainer', () => {
  it('returns when the container becomes FINISHED after IN_PROGRESS', async () => {
    const seq = ['IN_PROGRESS', 'IN_PROGRESS', 'FINISHED']
    const calls = mockFetch(() => json({ status_code: seq.shift() }))
    const clock = fakeClock()
    await waitForContainer('c1', 'tok', { ...VIDEO_WAIT, sleep: clock.sleep, now: clock.now })
    expect(calls).toHaveLength(3)
    // backoff растёт: 3 с, затем 4 с
    expect(clock.elapsed()).toBe(3000 + 4000)
  })

  it('throws a processing error with the Meta subcode on ERROR', async () => {
    mockFetch(() => json({ status_code: 'ERROR', status: 'Error: Media upload has failed (2207026)' }))
    const clock = fakeClock()
    const err = await waitForContainer('c1', 'tok', { ...VIDEO_WAIT, sleep: clock.sleep, now: clock.now }).catch(e => e)
    expect(err).toBeInstanceOf(InstagramPublishError)
    expect(err.stage).toBe('processing')
    expect(err.containerId).toBe('c1')
    expect(err.detail).toContain('2207026')
  })

  it('throws an expired error on EXPIRED', async () => {
    mockFetch(() => json({ status_code: 'EXPIRED' }))
    const err = await waitForContainer('c1', 'tok', { ...VIDEO_WAIT, sleep: async () => {} }).catch(e => e)
    expect(err.stage).toBe('expired')
  })

  it('throws a timeout error instead of silently returning (the old weak spot)', async () => {
    const calls = mockFetch(() => json({ status_code: 'IN_PROGRESS' }))
    const clock = fakeClock()
    const err = await waitForContainer('c1', 'tok', { ...VIDEO_WAIT, sleep: clock.sleep, now: clock.now }).catch(e => e)
    expect(err).toBeInstanceOf(InstagramPublishError)
    expect(err.stage).toBe('timeout')
    expect(clock.elapsed()).toBeLessThanOrEqual(VIDEO_WAIT.timeoutMs)
    expect(calls.length).toBeGreaterThan(15)
  })

  it('images also time out with an error now (was: silent return after 15 s)', async () => {
    mockFetch(() => json({ status_code: 'IN_PROGRESS' }))
    const clock = fakeClock()
    const err = await waitForContainer('c1', 'tok', { ...IMAGE_WAIT, sleep: clock.sleep, now: clock.now }).catch(e => e)
    expect(err.stage).toBe('timeout')
    // не короче прежних 15 с: регрессии по сроку нет
    expect(clock.elapsed()).toBeGreaterThanOrEqual(15_000)
  })

  it('tolerates a transient failure but gives up after repeated API errors', async () => {
    const seq = [() => json({ error: { message: 'boom' } }, 500), () => json({ status_code: 'FINISHED' })]
    mockFetch(() => seq.shift()!())
    await expect(
      waitForContainer('c1', 'tok', { ...IMAGE_WAIT, sleep: async () => {}, now: () => 0 }),
    ).resolves.toBeUndefined()

    mockFetch(() => json({ error: { message: 'Invalid OAuth access token' } }, 400))
    const err = await waitForContainer('c1', 'tok', { ...IMAGE_WAIT, sleep: async () => {}, now: () => 0 }).catch(e => e)
    expect(err.message).toContain('Invalid OAuth access token')
  })
})

describe('publishReel', () => {
  const fast = { sleep: async () => {} }

  it('creates a REELS container, waits, publishes and returns ids + permalink', async () => {
    const statuses = ['IN_PROGRESS', 'FINISHED']
    const calls = mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: statuses.shift() })
      if (isPublish(url)) return json({ id: 'media1' })
      if (isPermalink(url)) return json({ permalink: 'https://www.instagram.com/reel/abc/' })
      return json({}, 404)
    })
    const res = await publishReel('https://s.co/v.mp4', 'Подпись', {
      coverUrl: 'https://s.co/c.jpg',
      shareToFeed: false,
      wait: fast,
    })
    expect(res).toEqual({ mediaId: 'media1', containerId: 'cont1', permalink: 'https://www.instagram.com/reel/abc/' })

    const create = calls.find(c => isCreate(c.url))!
    const body = JSON.parse(String(create.init!.body))
    expect(body).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://s.co/v.mp4',
      caption: 'Подпись',
      share_to_feed: false,
      cover_url: 'https://s.co/c.jpg',
    })
    expect(create.url).toContain('/17841000/media')
    // публикация идёт строго после FINISHED
    const order = calls.map(c => (isCreate(c.url) ? 'create' : isStatus(c.url) ? 'status' : isPublish(c.url) ? 'publish' : 'other'))
    expect(order.indexOf('publish')).toBeGreaterThan(order.lastIndexOf('status'))
  })

  it('does not publish when processing ends in ERROR', async () => {
    const calls = mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'ERROR', status: 'code 2207082' })
      return json({}, 404)
    })
    const err = await publishReel('https://s.co/v.mp4', 'x', { wait: fast }).catch(e => e)
    expect(err).toBeInstanceOf(InstagramPublishError)
    expect(err.stage).toBe('processing')
    expect(calls.some(c => isPublish(c.url))).toBe(false)
  })

  it('times out with a clear error and never publishes', async () => {
    const clock = fakeClock()
    const calls = mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'IN_PROGRESS' })
      return json({}, 404)
    })
    const err = await publishReel('https://s.co/v.mp4', 'x', { wait: { sleep: clock.sleep, now: clock.now } }).catch(e => e)
    expect(err.stage).toBe('timeout')
    expect(err.containerId).toBe('cont1')
    expect(calls.some(c => isPublish(c.url))).toBe(false)
  })

  it('reports a publish failure with the publish stage', async () => {
    mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) return json({ error: { message: 'Application does not have permission for this action', code: 10 } }, 400)
      return json({}, 404)
    })
    const err = await publishReel('https://s.co/v.mp4', 'x', { wait: fast }).catch(e => e)
    expect(err).toBeInstanceOf(InstagramPublishError)
    expect(err.stage).toBe('publish')
    expect(err.message).toContain('permission')
  })

  it('retries media_publish while the media is "not available" yet, then succeeds', async () => {
    let publishCalls = 0
    mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) {
        publishCalls++
        return publishCalls < 3
          ? json({ error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } }, 400)
          : json({ id: 'media9' })
      }
      return json({}, 404)
    })
    const res = await publishReel('https://s.co/v.mp4', 'x', { wait: fast, publishRetryDelayMs: 1 })
    expect(res.mediaId).toBe('media9')
    expect(publishCalls).toBe(3)
  })

  it('does not retry a non-transient publish error', async () => {
    let publishCalls = 0
    mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) {
        publishCalls++
        return json({ error: { message: 'Application does not have permission', code: 10 } }, 400)
      }
      return json({}, 404)
    })
    await publishReel('https://s.co/v.mp4', 'x', { wait: fast }).catch(() => {})
    expect(publishCalls).toBe(1)
  })

  it('surfaces a container creation failure', async () => {
    mockFetch(url => (isCreate(url) ? json({ error: { message: 'Invalid video_url' } }, 400) : json({}, 404)))
    const err = await publishReel('https://s.co/v.mp4', 'x', { wait: fast }).catch(e => e)
    expect(err.stage).toBe('create')
    expect(err.message).toBe('Invalid video_url')
  })

  it('still succeeds when the permalink lookup fails', async () => {
    mockFetch(url => {
      if (isCreate(url)) return json({ id: 'cont1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) return json({ id: 'media1' })
      throw new Error('network down')
    })
    const res = await publishReel('https://s.co/v.mp4', 'x', { wait: fast })
    expect(res).toEqual({ mediaId: 'media1', containerId: 'cont1', permalink: null })
  })
})

describe('publishToInstagram (images, unchanged behavior)', () => {
  it('publishes a single image through the shared wait/publish helpers', async () => {
    const calls = mockFetch(url => {
      if (isCreate(url)) return json({ id: 'img1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) return json({ id: 'post1' })
      return json({}, 404)
    })
    await expect(publishToInstagram(['https://s.co/a.jpg'], 'cap')).resolves.toBe('post1')
    const body = JSON.parse(String(calls.find(c => isCreate(c.url))!.init!.body))
    expect(body).toMatchObject({ image_url: 'https://s.co/a.jpg', caption: 'cap' })
    expect(body.media_type).toBeUndefined()
  })

  it('publishes a carousel: children, then a CAROUSEL parent', async () => {
    let n = 0
    const calls = mockFetch(url => {
      if (isCreate(url)) return json({ id: `c${++n}` })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) return json({ id: 'post2' })
      return json({}, 404)
    })
    await expect(publishToInstagram(['https://s.co/a.jpg', 'https://s.co/b.jpg'], 'cap')).resolves.toBe('post2')
    const creates = calls.filter(c => isCreate(c.url)).map(c => JSON.parse(String(c.init!.body)))
    expect(creates).toHaveLength(3)
    expect(creates[2]).toMatchObject({ media_type: 'CAROUSEL', children: 'c1,c2', caption: 'cap' })
  })

  it('keeps the original error message on a publish failure', async () => {
    mockFetch(url => {
      if (isCreate(url)) return json({ id: 'img1' })
      if (isStatus(url)) return json({ status_code: 'FINISHED' })
      if (isPublish(url)) return json({ error: { message: 'Application does not have permission for this action' } }, 400)
      return json({}, 404)
    })
    await expect(publishToInstagram(['https://s.co/a.jpg'], 'cap')).rejects.toThrow(
      'Application does not have permission for this action',
    )
  })
})
