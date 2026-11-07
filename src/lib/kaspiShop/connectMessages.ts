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
  | 'phone_required'      // номер не передан (наш маршрут, до обращения к Kaspi)
  | 'phone_invalid'       // это не казахстанский номер из десяти цифр (наш маршрут)
  | 'rate_limited'        // лимит SMS-запросов (на аккаунт, номер или адрес)
  | 'limit_unavailable'   // счётчик лимитов недоступен: SMS не шлём

export type ConnectStep = 'phone' | 'otp'

type Texts = {
  unreachablePhone: string
  unreachableResumable: string
  unreachableRetry: string
  sessionNotIssued: string
  retry: string
  newCode: string
  techReason: string
  phoneRequired: string
  phoneInvalid: string
  limitUnavailable: string
  // Ответы Kaspi на номер и код: человеческая фраза вместо «HTTP 400» (прогон воронки 07.11.2026).
  otpRejected: string
  phoneRejected: string
  invalidToken: string
  codeRequired: string
  // «Слишком много SMS-запросов на этот номер»: по одной фразе на каждый лимит.
  rateLimited: { user: string; phone: string; ip: string }
  // Хвост про ожидание: с минутами и без них (если сервер не передал retryAfterSec).
  retryInMinutes: (minutes: number) => string
  retryLater: string
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
    phoneRequired: 'Введите номер телефона.',
    phoneInvalid: 'Введите номер телефона полностью: +7 777 123 45 67',
    limitUnavailable: 'Не удалось проверить лимит запросов. Попробуйте через минуту.',
    otpRejected: 'Код не подошёл или устарел. Проверьте SMS или запросите новый код.',
    phoneRejected: 'Kaspi не принял этот номер. Введите номер, на который оформлен кабинет Kaspi Магазин.',
    invalidToken: 'Время на ввод кода вышло. Запросите новый код.',
    codeRequired: 'Введите код из SMS.',
    rateLimited: {
      user: 'Слишком много SMS-запросов от вашего аккаунта.',
      phone: 'Слишком много SMS-запросов на этот номер.',
      ip: 'Слишком много SMS-запросов с вашего адреса.',
    },
    retryInMinutes: m => `Повторите примерно через ${m} мин.`,
    retryLater: 'Повторите позже.',
  },
  kk: {
    unreachablePhone: 'Kaspi жауап бермеді. Бір минуттан кейін қайта көріңіз.',
    unreachableResumable: 'Kaspi жауап бермеді. SMS-тегі код қабылданып қойған — «Қайталау» түймесін басыңыз, жаңа код керек емес.',
    unreachableRetry: 'Kaspi жауап бермеді. Қайта көріңіз — код сәйкес келмесе, жаңасын сұраңыз.',
    sessionNotIssued: 'Kaspi кодты қабылдады, бірақ кабинетті ашпады. «Қайталау» түймесін басыңыз — жаңа код керек емес.',
    retry: 'Қайталау',
    newCode: 'Жаңа код сұрау',
    techReason: 'Техникалық себеп',
    phoneRequired: 'Телефон нөмірін енгізіңіз.',
    phoneInvalid: 'Телефон нөмірін толық енгізіңіз: +7 777 123 45 67',
    limitUnavailable: 'Сұрау лимитін тексеру мүмкін болмады. Бір минуттан кейін қайта көріңіз.',
    otpRejected: 'Код сәйкес келмеді немесе ескірді. SMS-ті тексеріңіз немесе жаңа код сұраңыз.',
    phoneRejected: 'Kaspi бұл нөмірді қабылдамады. Kaspi Магазин кабинеті тіркелген нөмірді енгізіңіз.',
    invalidToken: 'Кодты енгізу уақыты өтті. Жаңа код сұраңыз.',
    codeRequired: 'SMS-тегі кодты енгізіңіз.',
    rateLimited: {
      user: 'Сіздің аккаунтыңыздан SMS тым көп сұралды.',
      phone: 'Бұл нөмірге SMS тым көп сұралды.',
      ip: 'Сіздің мекенжайыңыздан SMS тым көп сұралды.',
    },
    retryInMinutes: m => `Шамамен ${m} минуттан кейін қайталаңыз.`,
    retryLater: 'Кейінірек қайталаңыз.',
  },
  en: {
    unreachablePhone: 'Kaspi did not respond. Please try again in a minute.',
    unreachableResumable: 'Kaspi did not respond. Your SMS code was already accepted — tap “Retry”, no new code needed.',
    unreachableRetry: 'Kaspi did not respond. Please try again — if the code does not work, request a new one.',
    sessionNotIssued: 'Kaspi accepted the code but did not open the cabinet. Tap “Retry” — no new code needed.',
    retry: 'Retry',
    newCode: 'Request a new code',
    techReason: 'Technical reason',
    phoneRequired: 'Enter your phone number.',
    phoneInvalid: 'Enter the full phone number: +7 777 123 45 67',
    limitUnavailable: 'Could not check the request limit. Please try again in a minute.',
    otpRejected: 'The code did not match or has expired. Check the SMS or request a new code.',
    phoneRejected: 'Kaspi did not accept this number. Enter the number your Kaspi Merchant cabinet is registered to.',
    invalidToken: 'The time to enter the code ran out. Request a new code.',
    codeRequired: 'Enter the code from the SMS.',
    rateLimited: {
      user: 'Too many SMS requests from your account.',
      phone: 'Too many SMS requests for this number.',
      ip: 'Too many SMS requests from your address.',
    },
    retryInMinutes: m => `Please try again in about ${m} min.`,
    retryLater: 'Please try again later.',
  },
}

export function connectUiText(lang: Lang): Pick<Texts, 'retry' | 'newCode' | 'techReason'> {
  const t = TEXTS[lang] ?? TEXTS.ru
  return { retry: t.retry, newCode: t.newCode, techReason: t.techReason }
}

// Локализованный текст для кодов, которым нужна особая фраза; для остальных
// возвращает null (страница покажет текст сервера как есть). Для rate_limited
// страница может передать scope и retryAfterSec из ответа сервера (с ними в тексте
// есть минуты ожидания); без них текст честно говорит «позже».
export function connectErrorMessage(
  lang: Lang,
  code: string | undefined,
  ctx: { step: ConnectStep; resumable: boolean; scope?: string; retryAfterSec?: number },
): string | null {
  const t = TEXTS[lang] ?? TEXTS.ru
  if (code === 'kaspi_unreachable') {
    if (ctx.step === 'phone') return t.unreachablePhone
    return ctx.resumable ? t.unreachableResumable : t.unreachableRetry
  }
  if (code === 'session_not_issued') return t.sessionNotIssued
  if (code === 'phone_required') return t.phoneRequired
  if (code === 'phone_invalid') return t.phoneInvalid
  if (code === 'limit_unavailable') return t.limitUnavailable
  if (code === 'otp_rejected') return t.otpRejected
  if (code === 'phone_rejected') return t.phoneRejected
  if (code === 'invalid_token') return t.invalidToken
  if (code === 'code_required') return t.codeRequired
  if (code === 'rate_limited') {
    const who = ctx.scope === 'phone' ? t.rateLimited.phone : ctx.scope === 'ip' ? t.rateLimited.ip : t.rateLimited.user
    const sec = ctx.retryAfterSec
    const tail = typeof sec === 'number' && Number.isFinite(sec) && sec > 0
      ? t.retryInMinutes(Math.max(1, Math.ceil(sec / 60)))
      : t.retryLater
    return `${who} ${tail}`
  }
  return null
}
