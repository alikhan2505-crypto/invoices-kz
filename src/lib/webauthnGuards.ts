import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CHALLENGE_TTL_MS } from '@/lib/webauthn'
import { clientIp, quotaIp } from '@/lib/toolQuota'
import { createBurstLimiter, createIntervalGate } from '@/lib/memoryGuards'

// Защиты маршрутов /api/webauthn/* (аудит 02.11.2026, раздел 4). login-options
// открыт без входа и на КАЖДЫЙ вызов делал DELETE просроченных челленджей и
// INSERT новой строки: поток анонимных запросов раздувал запись в базу и
// таблицу webauthn_challenges. Теперь вызовы режутся по IP, а уборка идёт
// раз в минуту на инстанс. Константы живут здесь, а не в route.ts: из файла
// маршрута Next разрешает экспортировать только обработчики.

const WINDOW_MS = 60_000

/** Честному человеку нужен один вызов на нажатие кнопки; 20 в минуту с адреса с большим запасом. */
export const LOGIN_OPTIONS_PER_IP_PER_MIN = 20
/** За каждым verify стоит свой options, но сбои и повторы допустимы: чуть выше. */
export const LOGIN_VERIFY_PER_IP_PER_MIN = 30
/** Регистрация ключа -- раз в жизни устройства, а бесплатных аккаунтов можно наделать сколько угодно: считаем по аккаунту. */
export const REGISTER_OPTIONS_PER_USER_PER_MIN = 10
/** Просроченные челленджи чистим не чаще раза в это время на инстанс. */
export const CHALLENGE_CLEANUP_MIN_GAP_MS = 60_000

// 'unknown' (адрес не определился) не считаем: общий счётчик закрыл бы вход всем сразу.
export const loginOptionsLimiter = createBurstLimiter({ limit: LOGIN_OPTIONS_PER_IP_PER_MIN, windowMs: WINDOW_MS, exemptKeys: ['unknown'] })
export const loginVerifyLimiter = createBurstLimiter({ limit: LOGIN_VERIFY_PER_IP_PER_MIN, windowMs: WINDOW_MS, exemptKeys: ['unknown'] })
export const registerOptionsLimiter = createBurstLimiter({ limit: REGISTER_OPTIONS_PER_USER_PER_MIN, windowMs: WINDOW_MS })

const cleanupGate = createIntervalGate(CHALLENGE_CLEANUP_MIN_GAP_MS)

/** Ключ лимита по адресу: IPv6 сводим к /64, чтобы смена хвоста адреса не давала свежий лимит. */
export function webauthnClientKey(headers: Headers): string {
  return quotaIp(clientIp(headers))
}

/** 429 для превышения лимита; Retry-After -- окно целиком, точнее не нужно. */
export function tooManyAttempts(): NextResponse {
  return NextResponse.json(
    { error: 'Too many attempts, try again in a minute' },
    { status: 429, headers: { 'Retry-After': String(WINDOW_MS / 1000) } },
  )
}

/**
 * Удалить просроченные челленджи, но не чаще раза в CHALLENGE_CLEANUP_MIN_GAP_MS
 * на инстанс. Просроченный челлендж и так отвергается при проверке по created_at,
 * так что запоздавшая уборка ничего не ломает. Сбой уборки не мешает входу.
 * Возвращает, выполнялась ли уборка.
 */
export async function cleanupExpiredChallengesIfDue(supabase: SupabaseClient, now = Date.now()): Promise<boolean> {
  if (!cleanupGate.due(now)) return false
  try {
    const { error } = await supabase
      .from('webauthn_challenges')
      .delete()
      .lt('created_at', new Date(now - CHALLENGE_TTL_MS).toISOString())
    if (error) console.error('webauthn: expired challenge cleanup failed:', error.message)
  } catch (err) {
    console.error('webauthn: expired challenge cleanup threw:', err instanceof Error ? err.message : err)
  }
  return true
}

/** Только для тестов: сбросить счётчики и момент последней уборки. */
export function resetWebauthnGuards(): void {
  loginOptionsLimiter.reset()
  loginVerifyLimiter.reset()
  registerOptionsLimiter.reset()
  cleanupGate.reset()
}
