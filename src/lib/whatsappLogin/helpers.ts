// Вход через WhatsApp: чистые функции без сети и базы (разбор сообщения, коды, ссылки).
// См. supabase/migrations/whatsapp_login.sql и src/lib/whatsappLogin/service.ts.

import { randomInt } from 'node:crypto'
import { sha256Hex } from '@/lib/toolQuota'

/** Первое слово сообщения. Человек отправляет готовый текст «Вход ABCD2345». */
export const LOGIN_WORD = 'Вход'

/** Алфавит кода: без 0/O, 1/I/L: код читают глазами и вводят на телефоне. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const LOGIN_CODE_LENGTH = 8

/** Код живёт столько минут с момента нажатия кнопки. */
export const CODE_TTL_MS = 10 * 60_000
/** Ссылка живёт столько минут с момента ответа в WhatsApp. */
export const TOKEN_TTL_MS = 10 * 60_000

export function generateLoginCode(): string {
  let out = ''
  for (let i = 0; i < LOGIN_CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/** Одноразовый токен для ссылки: 32 байта энтропии, url-безопасный. */
export function generateLinkToken(): string {
  const bytes = new Uint8Array(32)
  for (let i = 0; i < bytes.length; i++) bytes[i] = randomInt(256)
  return Buffer.from(bytes).toString('base64url')
}

export const hashSecret = (s: string): string => sha256Hex(s)

const CODE_SHAPE = new RegExp(`^[${CODE_ALPHABET}]{${LOGIN_CODE_LENGTH}}$`)

/**
 * Код из сообщения человека, если оно выглядит как наш вход: «Вход ABCD2345» (регистр и пробелы любые).
 * Любой другой текст возвращает null: такое сообщение идёт к агенту как обычно, чужую переписку мы не трогаем.
 */
export function parseLoginMessage(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^вход\s+([a-z0-9]+)\s*$/iu)
  if (!m) return null
  const code = m[1].toUpperCase()
  return CODE_SHAPE.test(code) ? code : null
}

/** Цифры номера, как их присылает WhatsApp (wa_id). */
export function normalizeWaId(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export { placeholderEmailFor, isPlaceholderEmail } from './placeholderEmail'

/** Привязка номера к существующему аккаунту: «Привязать ABCD2345». */
export function parseLinkMessage(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const m = text.trim().match(/^привязать\s+([a-z0-9]+)\s*$/iu)
  if (!m) return null
  const code = m[1].toUpperCase()
  return CODE_SHAPE.test(code) ? code : null
}

/** 6-значный код подтверждения привязки: приходит человеку в WhatsApp, вводится в кабинете. */
export function generateConfirmCode(): string {
  let out = ''
  for (let i = 0; i < 6; i++) out += String(randomInt(10))
  return out
}

export const LINK_WORD = 'Привязать'

export function buildLinkWaMeUrl(displayNumber: string, code: string): string {
  const digits = displayNumber.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${LINK_WORD} ${code}`)}`
}

/** Признак нашего ответа с кодом привязки: эхо с телефона такое сообщение пропускает (как LOGIN_LINK_MARKER). */
export const LINK_REPLY_MARKER = 'Код для привязки этого номера к аккаунту invoices.kz'

export function linkReplyText(confirm: string): string {
  return `${LINK_REPLY_MARKER}: ${confirm}\nВведите его в профиле, в разделе «Вход и Face ID». Код действует 10 минут. Никому его не сообщайте: с ним номер привяжется к чужому аккаунту.`
}

/** Ссылка на чат с готовым текстом. displayNumber любой: берём из него только цифры. */
export function buildWaMeUrl(displayNumber: string, code: string): string {
  const digits = displayNumber.replace(/\D/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${LOGIN_WORD} ${code}`)}`
}

export interface WhatsAppLoginConfig {
  phoneNumberId: string
  displayNumber: string
}

/** Выключено, пока обе переменные не заданы в Vercel. */
export function loginConfig(env: Record<string, string | undefined> = process.env): WhatsAppLoginConfig | null {
  const phoneNumberId = env.WHATSAPP_LOGIN_PHONE_NUMBER_ID?.trim()
  const displayNumber = env.WHATSAPP_LOGIN_DISPLAY_NUMBER?.trim()
  if (!phoneNumberId || !displayNumber || displayNumber.replace(/\D/g, '').length < 8) return null
  return { phoneNumberId, displayNumber }
}

/** Что страница входа везёт вместе с запросом (те же ключи, что у письма): остальное отбрасываем. */
const META_KEYS = ['referral_code', 'first_source', 'pending_bin_watch', 'post_login_next'] as const
export type LoginMeta = Partial<Record<(typeof META_KEYS)[number], string>>

export function sanitizeMeta(raw: unknown): LoginMeta {
  const out: LoginMeta = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of META_KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.length > 0 && v.length <= 200) out[k] = v
  }
  return out
}

/** Текст ответа с ссылкой на вход (на русском: казахский и английский ждут вычитки). */
export function loginReplyText(url: string): string {
  return `Ваша ссылка для входа в invoices.kz (действует 10 минут, сработает один раз):\n${url}\n\nЕсли вы не нажимали «Войти через WhatsApp», просто проигнорируйте это сообщение.`
}

export const EXPIRED_CODE_REPLY = 'Этот код входа устарел. Вернитесь на страницу входа invoices.kz и нажмите «Войти через WhatsApp» ещё раз.'

/** Признак нашего автоответа: эхо с телефона не должно ставить диалог на паузу. */
export const LOGIN_LINK_MARKER = '/auth/wa?t='
