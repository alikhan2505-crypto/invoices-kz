import type { FlowStep } from './aiAgent/flow'
import { loadPublishToken } from './instagramPublishToken'
import { InstagramPublishError } from './instagramReel'
import { buildIceBreakersBody } from './instagramIceBreakers'

// "Instagram API with Instagram Login" tokens (prefixed IGAA...) are only
// valid against graph.instagram.com — the classic graph.facebook.com host
// (used by the older Facebook-Login flavor of this API) can't parse them
// at all, which surfaces as an opaque "Cannot parse access token" error.
const GRAPH_API = 'https://graph.instagram.com/v21.0'

// Один запрос к Graph API не должен зависать дольше этого срока: общий срок
// ожидания контейнера проверяется только МЕЖДУ опросами, и без таймаута один
// повисший запрос съел бы весь maxDuration маршрута, оставив черновик в
// промежуточном статусе. По таймауту fetch бросает исключение: опрос статуса
// считает его временным сбоем, create/publish -- отказом.
const GRAPH_REQUEST_TIMEOUT_MS = 20_000
const graphSignal = () => AbortSignal.timeout(GRAPH_REQUEST_TIMEOUT_MS)

async function createContainer(igUserId: string, accessToken: string, params: Record<string, string | boolean>): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: accessToken }),
    signal: graphSignal(),
  })
  const data = await res.json()
  if (!res.ok || !data.id) {
    throw new InstagramPublishError(data.error?.message || 'Failed to create media container', 'create')
  }
  return data.id as string
}

export interface WaitOptions {
  // Общий срок ожидания готовности контейнера, мс.
  timeoutMs: number
  // Пауза перед следующим опросом (attempt считается с 0).
  pollDelayMs: (attempt: number) => number
  // Подмена для тестов: без реальных пауз и со своими часами.
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

// Картинки готовы за секунды: опрос раз в 1,5 с, до минуты.
export const IMAGE_WAIT: WaitOptions = { timeoutMs: 60_000, pollDelayMs: () => 1500 }
// Видео обрабатывается дольше (обычно секунды - минута, документации с цифрой
// нет): 3 с, затем 4 с, 5 с ... до потолка 10 с. Срок 200 с оставляет запас
// до maxDuration = 300 на webhook-маршруте (создание контейнера + publish + Telegram).
export const VIDEO_WAIT: WaitOptions = {
  timeoutMs: 200_000,
  pollDelayMs: attempt => Math.min(3000 + attempt * 1000, 10_000),
}

// Подряд столько сбоев запроса статуса (HTTP-ошибка, не-JSON) считаем отказом
// API, а не «пока не готово».
const MAX_STATUS_FAILURES = 5

// Instagram processes each container asynchronously — publishing (or adding
// it as a carousel child) before it reports FINISHED fails with an opaque
// "Media ID is not available".
//
// Значения status_code (документация IG Container): IN_PROGRESS, FINISHED,
// ERROR, EXPIRED, PUBLISHED. Всё, что не конечное, считаем «ещё идёт».
//
// Раньше эта функция по исчерпании попыток МОЛЧА возвращалась, будто
// контейнер готов, и публикация падала с «Media ID is not available» уже
// на следующем шаге, без указания причины. Теперь таймаут -- явная ошибка.
export async function waitForContainer(
  containerId: string,
  accessToken: string,
  opts: WaitOptions = IMAGE_WAIT,
): Promise<void> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const now = opts.now ?? (() => Date.now())
  const startedAt = now()
  let failures = 0
  let lastApiError = ''

  for (let attempt = 0; ; attempt++) {
    let data: any = null
    let httpOk = false
    try {
      const statusRes = await fetch(
        `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`,
        { signal: graphSignal() },
      )
      httpOk = statusRes.ok
      data = await statusRes.json().catch(() => null)
    } catch {
      data = null
    }

    const code = data?.status_code
    if (code === 'FINISHED' || code === 'PUBLISHED') return
    if (code === 'ERROR') {
      throw new InstagramPublishError(
        'Instagram failed to process the media container',
        'processing',
        containerId,
        typeof data.status === 'string' ? data.status : undefined,
      )
    }
    if (code === 'EXPIRED') {
      throw new InstagramPublishError('The media container expired before it was published', 'expired', containerId)
    }

    if (!httpOk || !code) {
      failures++
      lastApiError = data?.error?.message || lastApiError
      if (failures >= MAX_STATUS_FAILURES) {
        throw new InstagramPublishError(
          lastApiError || 'Could not read the media container status',
          'processing',
          containerId,
        )
      }
    } else {
      failures = 0
    }

    const delay = opts.pollDelayMs(attempt)
    if (now() - startedAt + delay > opts.timeoutMs) {
      throw new InstagramPublishError(
        `Instagram did not finish processing the media container within ${Math.round(opts.timeoutMs / 1000)}s`,
        'timeout',
        containerId,
      )
    }
    await sleep(delay)
  }
}

// «Media ID is not available» -- контейнер уже FINISHED, но объект ещё не
// виден публикации. Бывает у видео сразу после FINISHED; лечится повтором.
function isNotYetAvailable(message: string | undefined, code: unknown, subcode: unknown): boolean {
  return code === 9007 || subcode === 2207027 || /not available|not ready/i.test(message || '')
}

async function publishContainer(
  igUserId: string,
  accessToken: string,
  creationId: string,
  opts: { attempts?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<string> {
  const attempts = opts.attempts ?? 1
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  let lastMessage = 'Failed to publish media'
  for (let i = 0; i < attempts; i++) {
    const publishRes = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
      signal: graphSignal(),
    })
    const publishData = await publishRes.json()
    if (publishRes.ok && publishData.id) return publishData.id as string
    lastMessage = publishData.error?.message || 'Failed to publish media'
    const retriable = isNotYetAvailable(lastMessage, publishData.error?.code, publishData.error?.error_subcode)
    if (!retriable || i === attempts - 1) break
    await sleep(opts.retryDelayMs ?? 5000)
  }
  throw new InstagramPublishError(lastMessage, 'publish', creationId)
}

// The account we publish to, resolved from the token itself when
// INSTAGRAM_BUSINESS_ACCOUNT_ID is not set.
//
// That variable does double duty: publishing used to read it, and the webhook
// still compares it against entry.id to decide whether an event belongs to the
// retired single-tenant auto-reply path. Unsetting it in Vercel to kill that
// path therefore also killed posting — a draft the founder approved on
// 2026-09-07 failed with "Instagram not configured" even though the token was
// fine. Deriving the id from the token decouples the two: posting needs only
// INSTAGRAM_ACCESS_TOKEN, and the legacy branch stays off.
let cachedIgUserId: string | null = null

async function resolveIgUserId(accessToken: string): Promise<string> {
  const configured = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (configured) return configured
  if (cachedIgUserId) return cachedIgUserId
  const res = await fetch(`${GRAPH_API}/me?fields=user_id&access_token=${accessToken}`, { signal: graphSignal() })
  const data = await res.json()
  const id = data?.user_id ? String(data.user_id) : ''
  if (!res.ok || !id) {
    throw new Error(data?.error?.message || 'Could not resolve the Instagram account from the access token')
  }
  cachedIgUserId = id
  return id
}

// Token + account for posting to our OWN feed (shared by images and Reels).
async function resolvePublishAuth(
  credentials?: { igUserId: string; accessToken: string },
): Promise<{ igUserId: string; accessToken: string }> {
  // Our OWN marker wins — the one generated in the App Dashboard, which
  // carries every permission the app holds at Standard Access, including
  // instagram_business_content_publish. loadPublishToken returns the rotated
  // copy from the database when there is one and falls back to the env var
  // otherwise, so this works before the cron has seeded the table.
  //
  // The customer's connection token is the fallback, not the other way round:
  // it comes from the Business Login flow, whose scope list is deliberately
  // narrow, and Instagram silently drops a scope that flow is not configured
  // to grant. On 2026-09-07 that produced four identical "Application does not
  // have permission for this action" failures — the grant came back with only
  // basic, manage_messages and manage_comments, confirmed in the callback log.
  const ownToken = await loadPublishToken()
  const accessToken = ownToken || credentials?.accessToken
  if (!accessToken) throw new Error('Instagram not configured')
  const igUserId = ownToken ? await resolveIgUserId(ownToken) : credentials!.igUserId
  return { igUserId, accessToken }
}

// A single image publishes directly; 2+ images publish as a swipeable
// carousel (each image becomes a child container, then a parent CAROUSEL
// container references all of them) — the format users can slide through
// instead of a single photo + a caption they have to open and read.
export async function publishToInstagram(
  imageUrls: string[],
  caption: string,
  credentials?: { igUserId: string; accessToken: string },
): Promise<string> {
  const { igUserId, accessToken } = await resolvePublishAuth(credentials)
  if (imageUrls.length === 0) throw new Error('No images provided')

  let creationId: string
  if (imageUrls.length === 1) {
    creationId = await createContainer(igUserId, accessToken, { image_url: imageUrls[0], caption })
    await waitForContainer(creationId, accessToken, IMAGE_WAIT)
  } else {
    const childIds = await Promise.all(
      imageUrls.map(url => createContainer(igUserId, accessToken, { image_url: url, is_carousel_item: 'true' }))
    )
    await Promise.all(childIds.map(id => waitForContainer(id, accessToken, IMAGE_WAIT)))
    creationId = await createContainer(igUserId, accessToken, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
    })
    await waitForContainer(creationId, accessToken, IMAGE_WAIT)
  }

  return publishContainer(igUserId, accessToken, creationId)
}

// Параметры контейнера Reels (документация IG User Media): media_type=REELS,
// video_url -- публичный адрес файла (Instagram сам скачивает его), share_to_feed
// -- показывать и в ленте, cover_url -- обложка JPEG. Чистая функция ради теста.
export function buildReelContainerParams(
  videoUrl: string,
  caption: string,
  opts: { coverUrl?: string | null; shareToFeed?: boolean } = {},
): Record<string, string | boolean> {
  const params: Record<string, string | boolean> = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: opts.shareToFeed ?? true,
  }
  if (opts.coverUrl) params.cover_url = opts.coverUrl
  return params
}

export interface PublishReelOptions {
  coverUrl?: string | null
  shareToFeed?: boolean
  credentials?: { igUserId: string; accessToken: string }
  // Переопределения для тестов/настройки срока ожидания.
  wait?: Partial<WaitOptions>
  publishRetryDelayMs?: number
}

export interface PublishedReel {
  mediaId: string
  containerId: string
  permalink: string | null
}

// Публикация Reels: контейнер -> ожидание обработки видео (минуты, не секунды)
// -> media_publish. Бросает InstagramPublishError с этапом (create / processing
// / expired / timeout / publish), по которому describeReelError объясняет причину.
export async function publishReel(
  videoUrl: string,
  caption: string,
  opts: PublishReelOptions = {},
): Promise<PublishedReel> {
  if (!videoUrl) throw new Error('No video provided')
  const { igUserId, accessToken } = await resolvePublishAuth(opts.credentials)

  const containerId = await createContainer(
    igUserId,
    accessToken,
    buildReelContainerParams(videoUrl, caption, { coverUrl: opts.coverUrl, shareToFeed: opts.shareToFeed }),
  )
  await waitForContainer(containerId, accessToken, { ...VIDEO_WAIT, ...opts.wait })
  // Объект после FINISHED иногда не сразу виден публикации: до 3 попыток.
  const mediaId = await publishContainer(igUserId, accessToken, containerId, {
    attempts: 3,
    retryDelayMs: opts.publishRetryDelayMs ?? 5000,
    sleep: opts.wait?.sleep,
  })

  // Лучшее усилие: ссылка на пост для сообщения в Telegram. Сбой не отменяет
  // уже состоявшуюся публикацию.
  let permalink: string | null = null
  try {
    const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${accessToken}`, { signal: graphSignal() })
    const data = await res.json()
    if (res.ok && typeof data?.permalink === 'string') permalink = data.permalink
  } catch {
    permalink = null
  }
  return { mediaId, containerId, permalink }
}

export interface MediaInsights {
  reach: number | null
  likes: number | null
  comments: number | null
  saved: number | null
  shares: number | null
}

export async function getMediaInsights(igMediaId: string): Promise<MediaInsights> {
  // Same token as publishing: insights are read for OUR posts on OUR account,
  // and reading the env var directly here would break the moment the rotated
  // copy diverges from it.
  const accessToken = await loadPublishToken()
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(
    `${GRAPH_API}/${igMediaId}/insights?metric=reach,likes,comments,saved,shares&access_token=${accessToken}`
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to fetch media insights')
  }

  const byName: Record<string, number> = {}
  for (const entry of data.data || []) {
    byName[entry.name] = entry.values?.[0]?.value ?? null
  }

  return {
    reach: byName.reach ?? null,
    likes: byName.likes ?? null,
    comments: byName.comments ?? null,
    saved: byName.saved ?? null,
    shares: byName.shares ?? null,
  }
}

// Thrown instead of a bare Error so callers that need to distinguish "the
// token is dead" (401 -- Task 8/9 mark the connection token_expired) from
// any other failure (transient, malformed request, etc.) can do so without
// parsing error message text. Still an Error, so the existing
// single-tenant caller's `console.error(err.message)` handling needs no
// changes.
export class InstagramApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'InstagramApiError'
  }
}

// Replies to a comment on any post on the account (not just ones published
// through our own draft-approval flow) — Instagram's own comment-reply
// endpoint, scoped by the comment's own ID rather than a media ID.
export async function replyToComment(commentId: string, message: string, credentials?: { accessToken: string }): Promise<void> {
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to reply to comment', res.status)
  }
}

// Sends a direct message reply. `recipientId` is the sender's Instagram-
// scoped user ID from the incoming webhook event, not a username.
export async function sendDirectMessage(recipientId: string, message: string, credentials?: { igUserId: string; accessToken: string }): Promise<void> {
  const igUserId = credentials?.igUserId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send direct message', res.status)
  }
}

// Sends an image on its own. Instagram has no caption field on an attachment
// message, so the text goes first as a normal message and the photo follows —
// which is also the order that reads correctly in the chat.
export async function sendDirectImage(recipientId: string, imageUrl: string, credentials?: { igUserId: string; accessToken: string }): Promise<void> {
  const igUserId = credentials?.igUserId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  const accessToken = credentials?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN
  if (!igUserId || !accessToken) throw new Error('Instagram not configured')

  const res = await fetch(`${GRAPH_API}/${igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { attachment: { type: 'image', payload: { url: imageUrl } } },
      access_token: accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send image', res.status)
  }
}

const INSTAGRAM_QUICK_REPLY_TITLE_MAX = 20
const INSTAGRAM_QUICK_REPLY_MAX = 13

interface InstagramFlowMessage {
  text: string
  quick_replies?: { content_type: 'text'; title: string; payload: string }[]
}

// Pure -- decides Instagram's native quick-reply shape for a flow step.
// FlowBuilder.tsx already caps a step at 8 buttons, so the >13 truncation
// branch below is defensive (unreachable via the UI today).
export function buildInstagramFlowMessage(step: FlowStep): InstagramFlowMessage {
  if (step.buttons.length === 0) return { text: step.text }
  if (step.buttons.length > INSTAGRAM_QUICK_REPLY_MAX) {
    console.error('ai-agent flow: step', step.id, 'has', step.buttons.length, 'buttons -- Instagram quick replies cap at', INSTAGRAM_QUICK_REPLY_MAX, ', truncating')
  }
  const quick_replies = step.buttons.slice(0, INSTAGRAM_QUICK_REPLY_MAX).map((b, i) => ({
    content_type: 'text' as const,
    title: b.label.slice(0, INSTAGRAM_QUICK_REPLY_TITLE_MAX),
    payload: `btn:${step.id}:${i}`,
  }))
  return { text: step.text, quick_replies }
}

// Sends one flow step as a DM -- text or quick replies depending on button
// count (buildInstagramFlowMessage). Same send shape as sendDirectMessage,
// just with a richer `message` object.
export async function sendInstagramFlowStep(recipientId: string, step: FlowStep, credentials: { igUserId: string; accessToken: string }): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${credentials.igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: buildInstagramFlowMessage(step),
      access_token: credentials.accessToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new InstagramApiError(data.error?.message || 'Failed to send flow step', res.status)
  }
}

// Instagram Private Reply (29.10.2026): ЕДИНСТВЕННОЕ личное сообщение автору
// комментария, по id комментария (POST /<IG_ID>/messages, recipient.comment_id).
// Документация Meta (Private Replies): одно сообщение на комментарий, не позже
// 7 дней после комментария (для Live -- только во время эфира); продолжить
// диалог можно, только когда человек сам ответит (окно 24 часа). Права при
// Instagram Login: instagram_business_basic + instagram_business_manage_comments
// (токен Instagram User). manage_comments выдаётся подключению только владельцу-
// админу (см. instagramScopes.ts), поэтому режим @comment_ack включается лишь для
// таких агентов; у остальных вызов упал бы с ошибкой разрешений.
// Бросает InstagramApiError (status = HTTP-код Meta); вызывающий решает, что
// говорить публично, если не получилось.
export async function sendPrivateReply(commentId: string, message: string, credentials: { igUserId: string; accessToken: string }): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${credentials.igUserId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
      access_token: credentials.accessToken,
    }),
    signal: graphSignal(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new InstagramApiError(data?.error?.message || 'Failed to send private reply', res.status)
  }
}

export interface IceBreakerItem { question: string; payload: string }

// Готовые вопросы (Ice Breakers): POST /<IG_ID>/messenger_profile,
// platform=instagram, до 4 вопросов, locale: 'default' (без него Meta отвечает
// «Invalid parameter», см. instagramIceBreakers.ts).
// Нажатие приходит вебхуком messaging_postbacks (postback.payload).
export async function setInstagramIceBreakers(igUserId: string, accessToken: string, items: IceBreakerItem[]): Promise<void> {
  // Токен -- в строке запроса, как в документации Meta (в теле Meta отвечала
  // «Invalid parameter»). В сообщение об ошибке идут код и подкод Meta, без токена.
  const res = await fetch(`${GRAPH_API}/${igUserId}/messenger_profile?access_token=${encodeURIComponent(accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildIceBreakersBody(items)),
    signal: graphSignal(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = data?.error
    const detail = [e?.code && `code ${e.code}`, e?.error_subcode && `subcode ${e.error_subcode}`, e?.error_user_msg].filter(Boolean).join(', ')
    throw new InstagramApiError(`${e?.message || 'Failed to set ice breakers'}${detail ? ` (${detail})` : ''}`, res.status)
  }
}

export async function getInstagramIceBreakers(igUserId: string, accessToken: string): Promise<unknown> {
  const res = await fetch(
    `${GRAPH_API}/${igUserId}/messenger_profile?fields=ice_breakers&platform=instagram&access_token=${encodeURIComponent(accessToken)}`,
    { signal: graphSignal() },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new InstagramApiError(data?.error?.message || 'Failed to read ice breakers', res.status)
  }
  return data
}

export async function deleteInstagramIceBreakers(igUserId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${GRAPH_API}/${igUserId}/messenger_profile`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'instagram', fields: ['ice_breakers'], access_token: accessToken }),
    signal: graphSignal(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new InstagramApiError(data?.error?.message || 'Failed to delete ice breakers', res.status)
  }
}

// Поля вебхука, на которые подписан САМ аккаунт (отдельно от подписки
// приложения в кабинете Meta). OAuth-колбэк подписывает только comments,messages;
// для нажатий на «готовые вопросы» нужен ещё messaging_postbacks.
export async function getInstagramSubscribedFields(accessToken: string): Promise<unknown> {
  const res = await fetch(`${GRAPH_API}/me/subscribed_apps?access_token=${encodeURIComponent(accessToken)}`, { signal: graphSignal() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new InstagramApiError(data?.error?.message || 'Failed to read subscribed fields', res.status)
  return data
}

export async function setInstagramSubscribedFields(accessToken: string, fields: string[]): Promise<void> {
  const res = await fetch(
    `${GRAPH_API}/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields.join(','))}&access_token=${encodeURIComponent(accessToken)}`,
    { method: 'POST', signal: graphSignal() },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new InstagramApiError(data?.error?.message || 'Failed to set subscribed fields', res.status)
}
