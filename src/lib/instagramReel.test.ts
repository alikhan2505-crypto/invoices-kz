import { describe, it, expect } from 'vitest'
import {
  InstagramPublishError,
  MIGRATION_REQUIRED_MESSAGE,
  buildReelDraftText,
  describeReelError,
  isMissingVideoColumnsError,
  isReelDraftBody,
  parseReelDraftBody,
  sanitizeErrorText,
  validateReelMediaUrl,
} from './instagramReel'

const SB = 'https://abc.supabase.co'
const BASE = `${SB}/storage/v1/object/public/instagram-drafts`

describe('validateReelMediaUrl (SSRF guard)', () => {
  it('accepts a public mp4 in our bucket', () => {
    const r = validateReelMediaUrl(`${BASE}/reels/1.mp4`, 'video', SB)
    expect(r).toEqual({ ok: true, url: `${BASE}/reels/1.mp4` })
  })
  it('accepts mov and jpg cover', () => {
    expect(validateReelMediaUrl(`${BASE}/reels/1.MOV`, 'video', SB).ok).toBe(true)
    expect(validateReelMediaUrl(`${BASE}/reels/1.jpeg`, 'cover', SB).ok).toBe(true)
  })
  it.each([
    ['http scheme', `http://abc.supabase.co/storage/v1/object/public/instagram-drafts/a.mp4`],
    ['foreign host', 'https://evil.example.com/storage/v1/object/public/instagram-drafts/a.mp4'],
    ['lookalike host', 'https://abc.supabase.co.evil.com/storage/v1/object/public/instagram-drafts/a.mp4'],
    ['credentials', 'https://user:pw@abc.supabase.co/storage/v1/object/public/instagram-drafts/a.mp4'],
    ['port', 'https://abc.supabase.co:8443/storage/v1/object/public/instagram-drafts/a.mp4'],
    ['other bucket', `${SB}/storage/v1/object/public/invoices/a.mp4`],
    ['private object path', `${SB}/storage/v1/object/instagram-drafts/a.mp4`],
    ['traversal', `${SB}/storage/v1/object/public/instagram-drafts/../invoices/a.mp4`],
    ['encoded traversal', `${SB}/storage/v1/object/public/instagram-drafts/%2e%2e/a.mp4`],
    ['query', `${BASE}/a.mp4?x=1`],
    ['wrong ext', `${BASE}/a.png`],
    ['empty object', `${BASE}/`],
    ['not a url', 'javascript:alert(1)'],
  ])('rejects %s', (_name, url) => {
    expect(validateReelMediaUrl(url, 'video', SB).ok).toBe(false)
  })
  it('rejects a png as cover (Instagram needs JPEG)', () => {
    expect(validateReelMediaUrl(`${BASE}/c.png`, 'cover', SB).ok).toBe(false)
  })
  it('rejects non-strings and a missing storage host config', () => {
    expect(validateReelMediaUrl(undefined, 'video', SB).ok).toBe(false)
    expect(validateReelMediaUrl(`${BASE}/a.mp4`, 'video', undefined).ok).toBe(false)
  })
})

describe('parseReelDraftBody', () => {
  const ok = { videoUrl: `${BASE}/reels/1.mp4`, caption: 'Подпись', mediaKind: 'reel' }
  it('parses a valid body with defaults', () => {
    const r = parseReelDraftBody(ok, SB)
    expect(r).toEqual({
      ok: true,
      value: { videoUrl: ok.videoUrl, coverUrl: null, caption: 'Подпись', shareToFeed: true, note: null },
    })
  })
  it('keeps cover, shareToFeed=false and note', () => {
    const r = parseReelDraftBody({ ...ok, coverUrl: `${BASE}/reels/1.jpg`, shareToFeed: false, note: 'n' }, SB)
    expect(r.ok && r.value).toMatchObject({ coverUrl: `${BASE}/reels/1.jpg`, shareToFeed: false, note: 'n' })
  })
  it('rejects a long caption, empty caption, mixed payload, bad kind and bad cover', () => {
    expect(parseReelDraftBody({ ...ok, caption: 'x'.repeat(2201) }, SB).ok).toBe(false)
    expect(parseReelDraftBody({ ...ok, caption: '' }, SB).ok).toBe(false)
    expect(parseReelDraftBody({ ...ok, imageUrls: ['https://x/a.png'] }, SB).ok).toBe(false)
    expect(parseReelDraftBody({ ...ok, mediaKind: 'image' }, SB).ok).toBe(false)
    expect(parseReelDraftBody({ ...ok, coverUrl: 'https://evil.com/c.jpg' }, SB).ok).toBe(false)
    expect(parseReelDraftBody({ ...ok, shareToFeed: 'yes' }, SB).ok).toBe(false)
  })
  it('accepts exactly 2200 characters', () => {
    expect(parseReelDraftBody({ ...ok, caption: 'x'.repeat(2200) }, SB).ok).toBe(true)
  })
})

describe('isReelDraftBody', () => {
  it('is true only when videoUrl is present', () => {
    expect(isReelDraftBody({ videoUrl: 'x' })).toBe(true)
    expect(isReelDraftBody({ imageUrls: ['x'], caption: 'c' })).toBe(false)
    expect(isReelDraftBody(null)).toBe(false)
  })
})

describe('isMissingVideoColumnsError', () => {
  it('detects PostgREST/Postgres missing-column errors', () => {
    expect(isMissingVideoColumnsError({ code: 'PGRST204', message: "Could not find the 'media_kind' column of 'instagram_drafts' in the schema cache" })).toBe(true)
    expect(isMissingVideoColumnsError({ code: '42703', message: 'column "video_url" does not exist' })).toBe(true)
    expect(isMissingVideoColumnsError({ message: 'column instagram_drafts.cover_url does not exist' })).toBe(true)
  })
  it('ignores unrelated errors', () => {
    expect(isMissingVideoColumnsError({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingVideoColumnsError(null)).toBe(false)
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('instagram_drafts_video.sql')
  })
})

describe('Telegram text', () => {
  it('shows the Reels header and escapes the caption', () => {
    const t = buildReelDraftText('a <b> & c', 'заметка')
    expect(t).toContain('Reels')
    expect(t).toContain('a &lt;b&gt; &amp; c')
    expect(t).toContain('заметка')
  })
})

describe('sanitizeErrorText / describeReelError', () => {
  it('strips tokens', () => {
    const t = sanitizeErrorText('GET https://graph.instagram.com/x?access_token=IGAAabcdefghijklmnopqrstuvwxyz0123 failed Bearer abc.def')
    expect(t).not.toContain('IGAAabcdef')
    expect(t).not.toContain('abc.def')
    expect(t).toContain('access_token=***')
  })
  it('explains each stage in Russian without leaking a token', () => {
    expect(describeReelError(new InstagramPublishError('x', 'timeout', 'c9'))).toMatch(/не успел обработать.*c9/)
    expect(describeReelError(new InstagramPublishError('x', 'expired', 'c9'))).toContain('просрочился')
    const proc = describeReelError(new InstagramPublishError('x', 'processing', 'c9', 'code 2207026'))
    expect(proc).toContain('отклонил видео')
    expect(proc).toContain('2207026')
    expect(describeReelError(new InstagramPublishError('Application does not have permission for this action', 'publish'))).toContain('Нет прав')
    expect(describeReelError(new Error('Instagram not configured'))).toContain('не настроен')
    const leaky = describeReelError(new Error('boom access_token=IGAAsecretsecretsecretsecretsecret1'))
    expect(leaky).not.toContain('IGAAsecret')
  })
  it('labels a rate limit only on explicit wording, not on words like generate/operate', () => {
    expect(describeReelError(new Error('Failed to generate the video thumbnail'))).not.toContain('лимит')
    expect(describeReelError(new Error('Unable to operate on separate media'))).not.toContain('лимит')
    expect(describeReelError(new Error('Application request limit reached'))).toContain('лимит')
    expect(describeReelError(new Error('Too many calls to this endpoint'))).toContain('лимит')
  })
  it('explains a timed-out request', () => {
    const e = new Error('The operation was aborted due to timeout')
    e.name = 'TimeoutError'
    const t = describeReelError(e)
    expect(t).toContain('не ответил вовремя')
    expect(t).toContain('мог выйти')
  })
})
