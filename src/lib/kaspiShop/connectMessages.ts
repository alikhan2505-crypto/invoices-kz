import type { Lang } from '@/lib/langResolve'

// Тексты ошибок подключения Kaspi-кабинета (вход по SMS). Один источник и для
// сервера (русский текст в поле `error` ответа), и для страницы /kaspi-shop
// (там по `code` берётся текст на языке пользователя). Никогда не содержат
// адресов и OAuth-параметров -- только понятная человеку фраза.

export type ConnectErrorCode =
  | 'kaspi_unreachable'   // Kaspi не ответил (сеть/таймаут) даже после повторов
  | 'session_not_issued'  // код принят, но кабинет не выдал сессию (mc-session/mc-sid)
  | 'otp_rejected'        // Kaspi отклонил код (HTTP-ответ)
  | 'phone_rejected'      // Kaspi отклонил номер (HTTP-ответ)
  | 'invalid_token'
  | 'code_required'
  | 'redirect_off_site'

export type ConnectStep = 'phone' | 'otp'

type Texts = {
  unreachablePhone: string
  unreachableResumable: string
  unreachableRetry: string
  sessionNotIssued: string
  retry: string
  newCode: string
  techReason: string
}

const TEXTS: Record<Lang, Texts> = {
  ru: {
    unreachablePhone: 'Kaspi не ответил. Попробуйте ещё раз через минуту.',
    unreachableResumable: 'Kaspi не ответил. Код из SMS уже принят — нажмите «Повторить», новый код не нужен.',
    unreachableRetry: 'Kaspi не ответил. Попробуйте ещё раз — если код не подойдёт, запросите новый.',
    sessionNotIssued: 'Kaspi принял код, но не открыл кабинет. Нажмите «Повторить» — новый код не нужен.',
    retry: 'Повторить',
    newCode: 'Запросить новый код',
    techReason: 'Техническая причина',
  },
  kk: {
    unreachablePhone: 'Kaspi жауап бермеді. Бір минуттан кейін қайта көріңіз.',
    unreachableResumable: 'Kaspi жауап бермеді. SMS-тегі код қабылданып қойған — «Қайталау» түймесін басыңыз, жаңа код керек емес.',
    unreachableRetry: 'Kaspi жауап бермеді. Қайта көріңіз — код сәйкес келмесе, жаңасын сұраңыз.',
    sessionNotIssued: 'Kaspi кодты қабылдады, бірақ кабинетті ашпады. «Қайталау» түймесін басыңыз — жаңа код керек емес.',
    retry: 'Қайталау',
    newCode: 'Жаңа код сұрау',
    techReason: 'Техникалық себеп',
  },
  en: {
    unreachablePhone: 'Kaspi did not respond. Please try again in a minute.',
    unreachableResumable: 'Kaspi did not respond. Your SMS code was already accepted — tap “Retry”, no new code needed.',
    unreachableRetry: 'Kaspi did not respond. Please try again — if the code does not work, request a new one.',
    sessionNotIssued: 'Kaspi accepted the code but did not open the cabinet. Tap “Retry” — no new code needed.',
    retry: 'Retry',
    newCode: 'Request a new code',
    techReason: 'Technical reason',
  },
}

export function connectUiText(lang: Lang): Pick<Texts, 'retry' | 'newCode' | 'techReason'> {
  const t = TEXTS[lang] ?? TEXTS.ru
  return { retry: t.retry, newCode: t.newCode, techReason: t.techReason }
}

// Локализованный текст для кодов, которым нужна особая фраза; для остальных
// возвращает null (страница покажет текст сервера как есть).
export function connectErrorMessage(
  lang: Lang,
  code: string | undefined,
  ctx: { step: ConnectStep; resumable: boolean },
): string | null {
  const t = TEXTS[lang] ?? TEXTS.ru
  if (code === 'kaspi_unreachable') {
    if (ctx.step === 'phone') return t.unreachablePhone
    return ctx.resumable ? t.unreachableResumable : t.unreachableRetry
  }
  if (code === 'session_not_issued') return t.sessionNotIssued
  return null
}
