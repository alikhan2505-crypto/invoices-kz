// Чистая логика Reels-черновиков Instagram: проверка адресов видео/обложки,
// тексты для Telegram, человекочитаемые причины отказа. Здесь нет сети и нет
// Supabase, поэтому всё покрывается юнит-тестами без моков.
//
// Сеть и токены живут в instagram.ts (publishReel), маршруты — в
// src/app/api/instagram/draft и telegram-webhook.

import { escapeHtml } from './htmlEscape'

export const REEL_BUCKET = 'instagram-drafts'
export const REEL_CAPTION_MAX = 2200
// Документация Meta: контейнер Reels до 300 МБ, 3 с - 15 мин.
export const REEL_MAX_BYTES = 300 * 1024 * 1024
// Telegram Bot API принимает видео по URL до 20 МБ; больше -- ссылкой.
export const TELEGRAM_URL_VIDEO_MAX_BYTES = 20 * 1024 * 1024

// Пока черновик публикуется, строка держит этот статус. Это именно 'approved',
// а не новый 'publishing': check-ограничение instagram_drafts_status_check
// допускает только pending/approved/rejected/published/failed, и так захват
// строки работает без правки ограничения.
export const DRAFT_STATUS_IN_PROGRESS = 'approved'

export type PublishStage = 'create' | 'processing' | 'expired' | 'timeout' | 'publish'

// Ошибка публикации с этапом, по которому можно объяснить причину по-русски.
export class InstagramPublishError extends Error {
  constructor(
    message: string,
    public stage: PublishStage,
    public containerId?: string,
    // Служебное поле Meta (`status` контейнера: подкод ошибки), без токенов.
    public detail?: string,
  ) {
    super(message)
    this.name = 'InstagramPublishError'
  }
}

// ---------- адреса ----------

export type MediaUrlKind = 'video' | 'cover'
export type MediaUrlCheck = { ok: true; url: string } | { ok: false; error: string }

const EXT: Record<MediaUrlKind, string[]> = {
  video: ['.mp4', '.mov'],
  // Instagram принимает обложку только JPEG.
  cover: ['.jpg', '.jpeg'],
}

// SSRF-безопасная проверка: допускаем только публичные объекты нашего бакета
// Supabase Storage на нашем же хосте. Любой другой хост, порт, логин в адресе,
// query/hash, выход из папки через .. -- отказ.
export function validateReelMediaUrl(raw: unknown, kind: MediaUrlKind, supabaseUrl: string | undefined): MediaUrlCheck {
  const label = kind === 'video' ? 'videoUrl' : 'coverUrl'
  if (typeof raw !== 'string' || !raw || raw.length > 2048) {
    return { ok: false, error: `${label} должен быть строкой-адресом` }
  }
  let host: string
  try {
    host = new URL(supabaseUrl || '').hostname.toLowerCase()
  } catch {
    return { ok: false, error: 'Хранилище не настроено (NEXT_PUBLIC_SUPABASE_URL)' }
  }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, error: `${label}: некорректный адрес` }
  }
  if (u.protocol !== 'https:') return { ok: false, error: `${label} должен быть https` }
  if (u.username || u.password || u.port) return { ok: false, error: `${label}: адрес с логином или портом не допускается` }
  if (u.hostname.toLowerCase() !== host) {
    return { ok: false, error: `${label} должен лежать в нашем хранилище (${host})` }
  }
  if (u.search || u.hash) return { ok: false, error: `${label}: адрес без параметров и якорей` }

  const prefix = `/storage/v1/object/public/${REEL_BUCKET}/`
  let decoded: string
  try {
    decoded = decodeURIComponent(u.pathname)
  } catch {
    return { ok: false, error: `${label}: некорректный путь` }
  }
  if (!u.pathname.startsWith(prefix) || decoded.length <= prefix.length) {
    return { ok: false, error: `${label} должен быть публичным файлом бакета ${REEL_BUCKET}` }
  }
  if (decoded.split('/').some(seg => seg === '..' || seg === '.') || decoded.includes('\\')) {
    return { ok: false, error: `${label}: недопустимый путь` }
  }
  const lower = decoded.toLowerCase()
  if (!EXT[kind].some(ext => lower.endsWith(ext))) {
    return { ok: false, error: `${label}: допустимые расширения ${EXT[kind].join(', ')}` }
  }
  return { ok: true, url: u.toString() }
}

// ---------- тело запроса черновика ----------

export interface ReelDraftInput {
  videoUrl: string
  coverUrl: string | null
  caption: string
  shareToFeed: boolean
  note: string | null
}

export type ReelDraftParse = { ok: true; value: ReelDraftInput } | { ok: false; error: string }

// Reel-черновик определяется ТОЛЬКО наличием videoUrl в теле. Остальное (картинки)
// идёт прежним путём и сюда не попадает.
export function isReelDraftBody(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as Record<string, unknown>).videoUrl !== undefined
}

export function parseReelDraftBody(body: Record<string, unknown>, supabaseUrl: string | undefined): ReelDraftParse {
  if (body.imageUrls !== undefined || body.imageUrl !== undefined) {
    return { ok: false, error: 'videoUrl нельзя совмещать с imageUrls: Reels не бывает в карусели' }
  }
  if (body.mediaKind !== undefined && body.mediaKind !== 'reel') {
    return { ok: false, error: "С videoUrl mediaKind может быть только 'reel'" }
  }
  const video = validateReelMediaUrl(body.videoUrl, 'video', supabaseUrl)
  if (!video.ok) return { ok: false, error: video.error }
  let coverUrl: string | null = null
  if (body.coverUrl !== undefined && body.coverUrl !== null && body.coverUrl !== '') {
    const cover = validateReelMediaUrl(body.coverUrl, 'cover', supabaseUrl)
    if (!cover.ok) return { ok: false, error: cover.error }
    coverUrl = cover.url
  }
  const caption = body.caption
  if (!caption || typeof caption !== 'string') return { ok: false, error: 'caption is required' }
  if (caption.length > REEL_CAPTION_MAX) return { ok: false, error: 'Caption too long for Instagram' }
  if (body.shareToFeed !== undefined && typeof body.shareToFeed !== 'boolean') {
    return { ok: false, error: 'shareToFeed должен быть true или false' }
  }
  const note = typeof body.note === 'string' && body.note ? body.note : null
  return {
    ok: true,
    value: {
      videoUrl: video.url,
      coverUrl,
      caption,
      shareToFeed: body.shareToFeed === undefined ? true : body.shareToFeed,
      note,
    },
  }
}

// Колонок media_kind/video_url/... ещё нет (миграция не применена): PostgREST
// отвечает PGRST204 («Could not find the ... column ... in the schema cache»),
// Postgres -- 42703 (undefined_column).
export function isMissingVideoColumnsError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST204' || err.code === '42703') return true
  const m = (err.message || '').toLowerCase()
  return /(media_kind|video_url|cover_url|share_to_feed)/.test(m) && /(column|schema cache)/.test(m)
}

export const MIGRATION_REQUIRED_MESSAGE =
  'Для Reels примените миграцию instagram_drafts_video.sql (SQL Editor в Supabase): в таблице instagram_drafts нет колонок media_kind/video_url/cover_url/share_to_feed'

// ---------- Telegram ----------

export function buildReelDraftText(caption: string, note: string | null): string {
  return `🎬 <b>Новый Reels для Instagram</b>\n\n${escapeHtml(caption)}${note ? `\n\n— — —\n${escapeHtml(note)}` : ''}`
}

export function buildReelLinkFallbackText(videoUrl: string, reason: 'too_big' | 'send_failed'): string {
  const why =
    reason === 'too_big'
      ? 'Файл больше 20 МБ, Telegram не покажет превью.'
      : 'Telegram не смог показать превью видео.'
  return `🎬 Reels (видео): ${escapeHtml(videoUrl)}\n${why} Откройте ссылку, посмотрите ролик и решайте ниже.`
}

// ---------- причины отказа ----------

// Вычищает всё, что похоже на токен, из текста, который уйдёт в Telegram и в БД.
export function sanitizeErrorText(text: string): string {
  return text
    .replace(/access_token=[^&\s"']+/gi, 'access_token=***')
    .replace(/\bIG[A-Za-z]{1,3}[A-Za-z0-9_-]{20,}/g, '***')
    .replace(/\bEA[A-Za-z0-9]{30,}/g, '***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 500)
}

const FORMAT_HINT = 'Проверьте файл: MP4 (H.264 + AAC), 3 с - 15 мин, до 300 МБ, лучше 9:16.'

// Человекочитаемая причина по-русски. Без токенов и без внутренних адресов.
export function describeReelError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const msg = sanitizeErrorText(raw)
  if (err instanceof InstagramPublishError) {
    switch (err.stage) {
      case 'timeout':
        return `Instagram не успел обработать видео вовремя (контейнер ${err.containerId ?? '?'} всё ещё в обработке). Попробуйте отправить черновик заново позже. ${FORMAT_HINT}`
      case 'expired':
        return `Контейнер Instagram просрочился (живёт 24 часа) до публикации. Отправьте черновик заново.`
      case 'processing':
        return `Instagram отклонил видео при обработке${err.detail ? ` (${sanitizeErrorText(err.detail)})` : ''}. ${FORMAT_HINT}`
      case 'create':
      case 'publish':
        break
    }
  }
  if (/permission|not authorized|OAuthException|access token/i.test(msg)) {
    return `Нет прав на публикацию в Instagram (токен без instagram_business_content_publish или просрочен): ${msg}`
  }
  // Только явные формулировки лимита: голое /rate/ или /limit/ цеплялось бы за
  // «generate», «operate» и т.п.
  if (/\b(rate limit|rate-limit|limit reached|reached (the|your) (publishing )?limit|too many (calls|requests|posts)|daily limit|publishing limit)\b/i.test(msg)) {
    return `Instagram ограничил публикации (лимит): ${msg}`
  }
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return `Instagram не ответил вовремя (${msg}). Проверьте ленту Instagram: если запрос был на публикацию, Reel мог выйти. Если нет, отправьте черновик заново.`
  }
  if (/instagram not configured/i.test(msg)) {
    return 'Токен публикации в Instagram не настроен.'
  }
  const where = err instanceof InstagramPublishError && err.stage === 'create' ? 'при создании Reels' : 'при публикации Reels'
  return `Instagram вернул ошибку ${where}: ${msg || 'без текста'}`
}
