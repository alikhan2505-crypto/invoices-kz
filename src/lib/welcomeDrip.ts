import { createHmac } from 'crypto'
import type { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail, looksLikeEmail, verdictFromStatus } from '@/lib/emailDeliverability'
import { parseDbTimestamp } from '@/lib/plan'

// Подпись ссылки отписки welcome-цепочки. Ключом служит service-role key:
// он серверный, есть во всех окружениях и не требует заводить ещё один
// секрет ради одной ссылки. Появится второй потребитель подписей — вынести
// в отдельный ключ по конвенции «один выделенный ключ на область».
export function unsubToken(userId: string): string {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`unsub|${userId}`)
    .digest('base64url')
    .slice(0, 32)
}

// ---- расписание (решение основателя 15.10.2026) ----
//
//  шаг 1 — через 10–15 минут после регистрации: приветствие + бонусы профиля
//          (эндпоинт /api/hooks/welcome-instant, его дёргает pg_cron раз в 5 минут);
//  шаг 4 — через сутки: какие у нас есть сервисы;
//  шаг 2 — на 3-й день: три приёма, которые экономят время;
//  шаг 3 — на 7-й день: «Чего вам не хватило?».
// Шаги 2–4 шлёт дневной крон /api/cron/welcome-drip.
//
// Номера шагов — ключ в email_drips (PK user_id+step), поэтому старые номера
// не переиспользуются под другой смысл: письмо «через сутки» получило новый
// номер 4, а 1/2/3 сохранили своё место в цепочке (приветствие / 3-й день /
// 7-й день). Так аккаунт, которому старый код успел отправить шаг 1, не
// получит второе «первое» письмо.

// Пишем только зарегистрированным ПОСЛЕ запуска цепочки — 44 старых аккаунта
// не получают внезапную «цепочку» задним числом.
export const LAUNCH = '2026-10-12T00:00:00Z'

export const INSTANT_STEP = 1
export const INSTANT_AFTER_MINUTES = 10
// Старше — «догонять» приветствием не пишем: следующее письмо уже дневное.
export const INSTANT_MAX_AGE_HOURS = 24
// Между двумя письмами цепочки — не меньше этого: два письма в один день
// выглядят как спам.
export const MIN_GAP_HOURS = 20
// Сколько дней шаг остаётся «в окне», если до следующего шага далеко.
const MAX_WINDOW_DAYS = 2

export type DripProfile = {
  id: string
  email: string | null
  created_at: string
  trial_expires_at: string | null
}

export type Step = {
  n: number
  // Только для дневных шагов; у мгновенного шага не задан.
  afterDays?: number
  subject: string
  html: (unsub: string, p: DripProfile, now?: number) => string
}

export type SentDrip = { step: number; sent_at: string }

// ---- вёрстка ----

const SITE = 'https://invoices.kz'
const ACCENT = '#5B4CE0'

/** Ссылка с utm-метками; & экранирован для атрибута href. */
export function trackedUrl(url: string, campaign: string): string {
  const u = new URL(url)
  u.searchParams.set('utm_source', 'drip')
  u.searchParams.set('utm_medium', 'email')
  u.searchParams.set('utm_campaign', campaign)
  return u.toString().replace(/&/g, '&amp;')
}

const button = (href: string, label: string, primary = true) => primary
  ? `<a href="${href}" style="display:inline-block;background:${ACCENT};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">${label}</a>`
  : `<a href="${href}" style="display:inline-block;background:#fff;color:${ACCENT};border:2px solid ${ACCENT};padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">${label}</a>`

const link = (href: string, label: string) =>
  `<a href="${href}" style="color:${ACCENT};font-weight:bold;">${label}</a>`

const p = (html: string, mb = 12) => `<p style="margin:0 0 ${mb}px;">${html}</p>`
const item = (html: string, mb = 8) => `<p style="margin:0 0 ${mb}px;padding-left:14px;">• ${html}</p>`

const wrap = (body: string, unsub: string, preheader: string) => `
<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e0e0e0;">
  <div style="background:#1C2056;padding:20px 24px;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">INVOICES<span style="color:#A99EF0;">.KZ</span></span>
  </div>
  <div style="padding:24px;font-size:15px;color:#333;line-height:1.6;">${body}</div>
  <div style="padding:16px 24px;border-top:1px solid #eee;font-size:11px;color:#999;line-height:1.5;">
    Это письмо пришло, потому что вы зарегистрировались на invoices.kz.
    Ответ на это письмо попадёт прямо к нам.
    <a href="${unsub}" style="color:#999;">Отписаться от таких писем</a>
  </div>
</div></body></html>`

// «22 октября» — по времени Казахстана; пусто, если триала нет или он кончился.
export function trialUntil(iso: string | null, now = Date.now()): string {
  const d = parseDbTimestamp(iso)
  if (!d || d.getTime() <= now) return ''
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })
}

// ---- письма ----

const welcome: Step = {
  n: INSTANT_STEP,
  subject: 'Добро пожаловать! До 300 ₸ в кошелёк за заполненный профиль',
  html: (unsub, profile, now) => {
    const c = 'd0'
    const until = trialUntil(profile.trial_expires_at, now)
    return wrap(`
      ${p('Здравствуйте! Это Алихан, основатель invoices.kz. Спасибо, что зарегистрировались 👋')}
      ${p('<b>До 300 ₸ в кошелёк за заполненный профиль.</b> За каждый проверенный блок — 100 ₸:', 8)}
      ${item('<b>Реквизиты</b> — название компании и БИН/ИИН. БИН проверяем по госреестру;')}
      ${item('<b>Банковский счёт</b> — ИИК (проверяем, что в нём нет опечатки) и БИК банка. Засчитывается после проверки реквизитов;')}
      ${item('<b>Подпись или печать</b> — нарисуйте подпись или загрузите фото печати.', 12)}
      ${p('Деньги приходят в кошелёк сразу после проверки, когда вы сохраняете блок. Кошельком можно оплатить тариф Про — целиком или частью — и ответы ИИ-агента. Бонус даётся один раз на аккаунт, а за реквизиты и банковский счёт — один раз на БИН.')}
      ${p(button(trackedUrl(`${SITE}/profile`, c), 'Заполнить профиль'), 12)}
      ${p(until
        ? 'Заодно это всё, что нужно для счёта: реквизиты, банк, подпись и печать подставятся в PDF сами. В профиле карточка «Готовность к счёту» покажет, чего ещё не хватает.'
        : 'Заодно это всё, что нужно для счёта: реквизиты и банк подставятся в PDF сами, а подпись и печать — на тарифах «Базовый» и «Про». В профиле карточка «Готовность к счёту» покажет, чего ещё не хватает.', 20)}
      ${until ? p(`<b>Пробный период до ${until}</b> — 7 дней тарифа «Базовый» (до 10 счетов) уже включены, подключать ничего не нужно.`) : ''}
      ${p(`<b>+7 дней за друга.</b> Отправьте коллеге ${link(trackedUrl(`${SITE}/profile/referral`, c), 'свою ссылку')}: когда он зарегистрируется по ней, вы оба получите +7 дней «Базового» бесплатно.`, 16)}
      ${p(button(trackedUrl(`${SITE}/create`, c), 'Выставить счёт', false), 20)}
      ${p('Если что-то не получается — просто ответьте на это письмо, я читаю ответы сам.')}
      ${p('— Алихан, invoices.kz', 0)}
    `, unsub, 'За реквизиты, банковский счёт и подпись — по 100 ₸ в кошелёк. Кошельком можно оплатить тариф Про.')
  },
}

const services: Step = {
  n: 4,
  afterDays: 1,
  subject: 'Что ещё умеет invoices.kz',
  html: unsub => {
    const c = 'd1'
    return wrap(`
      ${p('Здравствуйте! Кроме счетов, в invoices.kz есть ещё несколько сервисов — коротко, что каждый делает:', 14)}
      ${item(`${link(trackedUrl(`${SITE}/create`, c), 'Счета')} — счёт по БИН за минуту, PDF и отправка клиенту в WhatsApp. Подпись и печать в PDF — с тарифа «Базовый» (и в пробный период); КП, АВР и накладные из ваших счетов и клиентов — на тарифе «Про».`, 10)}
      ${item(`${link(trackedUrl('https://kaspi.invoices.kz', c), 'Kaspi Bot')} — для продавцов Kaspi Магазина: демпинг цен, заказы и накладные, финансы магазина. На тарифе Про.`, 10)}
      ${item(`${link(trackedUrl('https://agent.invoices.kz', c), 'ИИ-агент')} — отвечает вашим клиентам в WhatsApp, Instagram, Telegram и на сайте. На тарифе Про.`, 10)}
      ${item(`${link(trackedUrl('https://api.invoices.kz', c), 'Kaspi Cashier API')} — приём оплаты Kaspi Pay на вашем сайте или в приложении, для разработчиков.`, 10)}
      ${item(`${link(trackedUrl(`${SITE}/tools`, c), 'Бесплатные инструменты')} — проверка контрагента по БИН, калькулятор маржи Kaspi, склейка накладных Kaspi, налоги ИП, а также разовые счёт, АВР, накладная и КП без регистрации.`, 16)}
      ${p(button(trackedUrl(`${SITE}/tools`, c), 'Открыть инструменты'), 20)}
      ${p('Напишите в ответ, чем вы занимаетесь, — подскажу, с чего начать.')}
      ${p('— Алихан, invoices.kz', 0)}
    `, unsub, 'Счета, Kaspi Bot, ИИ-агент, Kaspi Cashier API и бесплатные инструменты — по одной строке о каждом.')
  },
}

const tips: Step = {
  n: 2,
  afterDays: 3,
  subject: 'Три приёма, которые экономят время со счетами',
  html: unsub => {
    const c = 'd3'
    return wrap(`
      ${p('Короткое письмо — три вещи, которые чаще всего пропускают:', 10)}
      ${item(`<b>Проверьте контрагента до счёта.</b> ${link(trackedUrl(`${SITE}/tools/kontragent`, c), 'Проверка по БИН')} покажет неблагонадёжность, ликвидацию, долги по налогам и НДС по данным КГД.`, 10)}
      ${item('<b>Отправляйте счёт в WhatsApp.</b> После создания счёта — одна кнопка, клиент получает ссылку на счёт.', 10)}
      ${item('<b>Подключите оплату Kaspi.</b> Тогда клиент платит по QR прямо со счёта.', 16)}
      ${p(`И если вы ещё не заполнили профиль — за реквизиты, банковский счёт и подпись мы начисляем по 100 ₸ в кошелёк: ${link(trackedUrl(`${SITE}/profile`, c), 'заполнить профиль')}.`)}
      ${p('— Алихан, invoices.kz', 0)}
    `, unsub, 'Проверка контрагента, отправка в WhatsApp и оплата Kaspi по QR.')
  },
}

const feedback: Step = {
  n: 3,
  afterDays: 7,
  subject: 'Чего вам не хватило?',
  html: unsub => wrap(`
    ${p('Прошла неделя с регистрации. Если вы зашли, посмотрели и чего-то не нашли — ответьте одним предложением, чего не хватило.')}
    ${p('Я читаю каждый ответ сам и чиню быстро. Даже «ничего, просто не до того» — тоже полезный ответ.')}
    ${p('— Алихан, invoices.kz', 0)}
  `, unsub, 'Одно предложение в ответ — и я починю то, что мешает.'),
}

// В порядке отправки.
export const STEPS: Step[] = [welcome, services, tips, feedback]

export const DAILY_STEPS: Step[] = STEPS
  .filter(s => s.afterDays !== undefined)
  .sort((a, b) => a.afterDays! - b.afterDays!)

// ---- выбор шага ----

/**
 * Окно дневного шага — [afterDays, конец): до начала следующего шага, но не
 * дольше MAX_WINDOW_DAYS. Окна не пересекаются, поэтому на один прогон крона
 * приходится не больше одного кандидата.
 */
export function dailyWindow(step: Step): { from: number; to: number } {
  const from = step.afterDays!
  const next = DAILY_STEPS.find(s => s.afterDays! > from)
  const to = Math.min(from + MAX_WINDOW_DAYS, next ? next.afterDays! : Infinity)
  return { from, to }
}

/**
 * Какое дневное письмо отправить аккаунту сейчас; null — никакое.
 * Не шлём, если шаг уже отправлен, если аккаунт вне окна шага («догоняющие»
 * письма недельной давности выглядят как спам) и если любое письмо цепочки
 * ушло меньше MIN_GAP_HOURS назад (в том числе приветствие).
 */
export function pickDailyStep(createdAt: string, sent: SentDrip[], now = Date.now()): Step | null {
  // profiles.created_at — timestamp WITHOUT time zone (UTC), приходит без
  // смещения; parseDbTimestamp читает такую строку как UTC, а не как местное
  // время сервера.
  const created = parseDbTimestamp(createdAt)?.getTime()
  if (created === undefined || created < new Date(LAUNCH).getTime()) return null
  const ageDays = (now - created) / 86_400_000
  const lastSent = sent.reduce((max, s) => Math.max(max, parseDbTimestamp(s.sent_at)?.getTime() ?? 0), 0)
  if (lastSent && now - lastSent < MIN_GAP_HOURS * 3_600_000) return null
  const done = new Set(sent.map(s => s.step))
  for (const step of DAILY_STEPS) {
    const { from, to } = dailyWindow(step)
    if (ageDays >= from && ageDays < to && !done.has(step.n)) return step
  }
  return null
}

/** Границы created_at, в которые попадает аккаунт для приветствия. */
export function instantWindow(now = Date.now()): { newerThan: string; olderThan: string } {
  return {
    newerThan: new Date(Math.max(now - INSTANT_MAX_AGE_HOURS * 3_600_000, new Date(LAUNCH).getTime())).toISOString(),
    olderThan: new Date(now - INSTANT_AFTER_MINUTES * 60_000).toISOString(),
  }
}

// ---- отправка ----

/**
 * Адрес подтверждён (человек перешёл по ссылке из письма или вошёл через
 * Google)? Строка profiles появляется уже при ЗАПРОСЕ magic-link, до клика —
 * писать на неподтверждённый адрес значит слать в опечатки и чужие ящики.
 * Ошибка проверки = «не подтверждён»: следующий прогон спросит снова.
 */
export async function isEmailConfirmed(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    return !error && !!data.user?.email_confirmed_at
  } catch {
    return false
  }
}

/** Ключ идемпотентности Resend: повтор после «ошибки», которую Resend на деле принял, не уйдёт вторым письмом (окно 24 ч). */
export const dripIdempotencyKey = (userId: string, step: number) => `welcome-drip/${userId}/${step}`

// Письмо уходит, если адрес похож на адрес и не в suppression-списке Resend.
// Недоступность проверки — не повод молчать (unknown == шлём), как и у magic-link.
// Возвращает true, если отправили; false — пропустили; бросает при сбое отправки.
export async function sendDrip(resend: Resend, profile: DripProfile, step: Step): Promise<boolean> {
  const email = normalizeEmail(profile.email)
  if (!looksLikeEmail(email)) return false

  try {
    const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    })
    if (verdictFromStatus(res.status) === 'undeliverable') return false
  } catch { /* unknown → продолжаем */ }

  const unsub = `${SITE}/api/email/unsubscribe?u=${profile.id}&t=${unsubToken(profile.id)}`
  const { error } = await resend.emails.send({
    from: 'Алихан, invoices.kz <mail@invoices.kz>',
    to: email,
    subject: step.subject,
    html: step.html(unsub.replace(/&/g, '&amp;'), profile),
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }, { idempotencyKey: dripIdempotencyKey(profile.id, step.n) })
  // Resend SDK не бросает на ошибке API, а возвращает { error } — без этой
  // проверки неотправленное письмо считалось бы отправленным.
  if (error) throw new Error(`resend: ${error.message}`)
  return true
}
