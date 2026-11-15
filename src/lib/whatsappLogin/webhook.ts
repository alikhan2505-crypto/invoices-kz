// Вход через WhatsApp, часть вебхука: сообщение «Вход <код>» забирается ДО агента.
// Агент о таких сообщениях не узнаёт: диалога, заявки и ответа модели нет. Это обычный код, а не
// просьба к ИИ «пропускай такие сообщения»: модель ошибается, а условие в коде нет.

import type { SupabaseClient } from '@supabase/supabase-js'
import { claimWindowSlot, hourBucket, windowKey } from '@/lib/windowLimits'
import {
  EXPIRED_CODE_REPLY, loginConfig, loginReplyText, normalizeWaId, parseLoginMessage, type WhatsAppLoginConfig,
} from './helpers'
import { claimLoginCode } from './service'

/** Ссылок входа на один номер WhatsApp в час: больше ни одному человеку не нужно. */
export const LOGINS_PER_NUMBER_PER_HOUR = 6

export const LOGIN_LINK_BASE = 'https://invoices.kz/auth/wa?t='

export interface LoginMessageParams {
  db: SupabaseClient
  /** phone_number_id, на который пришло сообщение. */
  phoneNumberId: string
  /** wa_id отправителя. */
  from: string
  text: string
  /** Отправка ответа человеку (WhatsApp Cloud API). */
  send: (text: string) => Promise<void>
  cfg?: WhatsAppLoginConfig | null
  now?: number
}

/**
 * true: сообщение наше (вход), агенту его отдавать нельзя. false: это обычное сообщение клиента.
 * Сообщение считается входом только если оно пришло на номер входа и выглядит как «Вход <код>»
 * (слово и код нашей формы): обычные письма клиентов к агенту не затрагиваются.
 */
export async function handleLoginMessage(p: LoginMessageParams): Promise<boolean> {
  const cfg = p.cfg === undefined ? loginConfig() : p.cfg
  if (!cfg || p.phoneNumberId !== cfg.phoneNumberId) return false
  const code = parseLoginMessage(p.text)
  if (!code) return false
  const waId = normalizeWaId(p.from)
  if (!waId) return false

  try {
    const slot = await claimWindowSlot(p.db, windowKey('walogin-wa', waId, hourBucket(p.now)), LOGINS_PER_NUMBER_PER_HOUR)
    if (!slot.ok && slot.reason === 'limit') return true // слишком часто: молчим

    const claim = await claimLoginCode(p.db, code, waId, p.now)
    if (!claim) {
      await p.send(EXPIRED_CODE_REPLY)
      return true
    }
    await p.send(loginReplyText(`${LOGIN_LINK_BASE}${claim.token}`))
  } catch (e) {
    // Сбой базы или отправки: человек увидит, что ответа нет, и нажмёт кнопку ещё раз. Агенту не отдаём.
    console.error('whatsapp login: message handling failed:', e instanceof Error ? e.message : e)
  }
  return true
}
