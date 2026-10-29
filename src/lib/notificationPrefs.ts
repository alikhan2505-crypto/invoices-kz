// Настройки уведомлений: каталог событий платформы + решение «слать или нет».
//
// Хранение: одна jsonb-колонка profiles.notification_prefs вида
//   { "<событие>": { "telegram": true, "email": false, "chat": true } }
// Отсутствующий ключ = «не выбирал» → берётся значение по умолчанию, равное
// тому, как платформа вела себя до этой колонки (старые notify_* колонки
// читаются как запасной вариант). Поэтому код работает и до применения
// supabase/migrations/notification_prefs.sql: колонки нет → prefs пустые →
// всё как раньше.
//
// Файл чистый (без Supabase/fetch) — его можно импортировать и со страницы.
// Серверные загрузчики и отправка — в notificationPrefsServer.ts.

export type NotificationChannel = 'telegram' | 'email' | 'bell' | 'chat'
export type ToggleableChannel = 'telegram' | 'email' | 'chat'
export type NotificationAudience = 'owner' | 'client'
export type NotificationGroup =
  | 'invoices' | 'documents' | 'acquiring' | 'kaspiShop' | 'aiAgent' | 'salon' | 'cfo' | 'account'

export type NotificationEventKey =
  // Владельцу — счета
  | 'invoice_viewed'
  | 'invoice_marked_paid'
  | 'invoice_paid_kaspi'
  | 'invoice_due_tomorrow'
  | 'invoice_overdue'
  | 'invoices_unpaid_summary'
  | 'weekly_report'
  // Владельцу — документы и сверка
  | 'document_signed'
  | 'bcc_matches_found'
  // Владельцу — Kaspi Bot
  | 'kaspi_daily_digest'
  | 'kaspi_floor_price'
  // Владельцу — ИИ-агент
  | 'ai_operator_requested'
  | 'ai_review_draft'
  | 'ai_invoice_draft'
  | 'ai_wallet_empty'
  | 'ai_training_exit'
  | 'ai_pro_lapsed'
  // Владельцу — салон
  | 'salon_booking_pending'
  // Настраивается в другом месте / отдельная колонка
  | 'cfo_morning_digest'
  | 'welcome_series'
  // Владельцу - слежение за БИН (пока только админам, см. src/lib/binWatch/config.ts)
  | 'bin_watch_changed'
  // Что получают клиенты продавца
  | 'client_invoice_email'
  | 'client_recurring_invoice'
  | 'client_wholesale_invoice'
  | 'client_signature_request'
  | 'client_payment_chat'

export interface NotificationEventDef {
  key: NotificationEventKey
  audience: NotificationAudience
  group: NotificationGroup
  labelRu: string
  descRu: string
  // Все каналы, по которым событие реально уходит.
  channels: NotificationChannel[]
  // Те из них, что можно выключить. Остальные (колокольчик, письмо клиенту,
  // которое продавец отправил сам) — информационные, без тумблера.
  toggleable: ToggleableChannel[]
  // Если событие настраивается не здесь — куда вести (на странице: ссылка).
  managedAt?: string
  // Что нужно, чтобы событие вообще случалось (для пояснения на странице).
  requiresRu?: string
  // Где отправляется (для разработчика; на странице не показывается).
  sentFrom: string[]
}

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  // ---------- Счета ----------
  {
    key: 'invoice_viewed', audience: 'owner', group: 'invoices',
    labelRu: 'Клиент открыл счёт',
    descRu: 'Когда клиент впервые открывает ссылку на счёт.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    sentFrom: ['src/app/api/notify-viewed/route.ts'],
  },
  {
    key: 'invoice_marked_paid', audience: 'owner', group: 'invoices',
    labelRu: 'Клиент нажал «Я оплатил»',
    descRu: 'Клиент сам отметил счёт оплаченным на странице счёта. Это его слово — проверьте поступление.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    sentFrom: ['src/app/api/notify-paid/route.ts'],
  },
  {
    key: 'invoice_paid_kaspi', audience: 'owner', group: 'invoices',
    labelRu: 'Счёт оплачен через Kaspi Pay',
    descRu: 'Kaspi подтвердил оплату счёта — счёт сам стал «Оплачен».',
    channels: ['telegram', 'email', 'bell'], toggleable: ['telegram', 'email'],
    requiresRu: 'Подключённая касса Kaspi Pay',
    sentFrom: ['src/lib/kaspiPay/settlePayment.ts', 'src/lib/kaspiPay/historySync.ts', 'src/lib/kaspiPay/ownerPaidNotify.ts'],
  },
  {
    key: 'invoice_due_tomorrow', audience: 'owner', group: 'invoices',
    labelRu: 'Завтра срок оплаты',
    descRu: 'Вам, за день до срока оплаты, если счёт ещё не оплачен (для счетов без срока — на 3-й день после отправки). Клиенту ничего не уходит.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    sentFrom: ['src/app/api/cron/notifications/route.ts'],
  },
  {
    key: 'invoice_overdue', audience: 'owner', group: 'invoices',
    labelRu: 'Счёт просрочен',
    descRu: 'Срок оплаты прошёл больше суток назад, а счёт не оплачен (для счетов без срока — через 7 дней после создания). Счёт помечается «Просрочен».',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    sentFrom: ['src/app/api/cron/notifications/route.ts'],
  },
  {
    key: 'invoices_unpaid_summary', audience: 'owner', group: 'invoices',
    labelRu: 'Сколько счетов ждут оплаты',
    descRu: 'Раз в день в колокольчике: «Неоплаченных счетов: N».',
    channels: ['bell'], toggleable: [],
    sentFrom: ['src/app/api/cron/notifications/route.ts'],
  },
  {
    key: 'weekly_report', audience: 'owner', group: 'invoices',
    labelRu: 'Отчёт за неделю',
    descRu: 'По понедельникам: сколько счетов создано, оплачено и ждёт оплаты за 7 дней. Не приходит, если счетов за неделю не было.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    sentFrom: ['src/app/api/cron/notifications/route.ts'],
  },
  // ---------- Документы и сверка ----------
  {
    key: 'document_signed', audience: 'owner', group: 'documents',
    labelRu: 'Клиент подписал документ ЭЦП',
    descRu: 'Клиент поставил свою подпись — документ подписан обеими сторонами.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    requiresRu: 'Тариф Про',
    sentFrom: ['src/app/api/signatures/client-sign/route.ts'],
  },
  {
    key: 'bcc_matches_found', audience: 'owner', group: 'acquiring',
    labelRu: 'Найдены возможные оплаты (BCC)',
    descRu: 'В выписке BCC нашлись поступления, похожие на оплату ваших счетов, — их нужно подтвердить.',
    channels: ['telegram', 'email'], toggleable: ['telegram', 'email'],
    requiresRu: 'Тариф Про и подключённый счёт BCC',
    sentFrom: ['src/app/api/cron/bcc-check/route.ts'],
  },
  // ---------- Kaspi Bot ----------
  {
    key: 'kaspi_daily_digest', audience: 'owner', group: 'kaspiShop',
    labelRu: 'Дневная сводка Kaspi Bot',
    descRu: 'Раз в день: изменения цен, заказы витрины, расход и низкий баланс кошелька. В тихий день не приходит.',
    channels: ['telegram'], toggleable: ['telegram'],
    requiresRu: 'Тариф Про',
    sentFrom: ['src/app/api/cron/notifications/route.ts', 'src/lib/kaspiShop/dailyDigest.ts'],
  },
  {
    key: 'kaspi_floor_price', audience: 'owner', group: 'kaspiShop',
    labelRu: 'Цена упёрлась в минимум',
    descRu: 'Конкурент дешевле, а снижать дальше вашего минимума нельзя. Не чаще раза в сутки на товар.',
    channels: ['telegram'], toggleable: ['telegram'],
    requiresRu: 'Тариф Про',
    sentFrom: ['src/lib/kaspiShop/checkCycle.ts'],
  },
  // ---------- ИИ-агент ----------
  {
    key: 'ai_operator_requested', audience: 'owner', group: 'aiAgent',
    labelRu: 'Клиент попросил оператора',
    descRu: 'Клиент хочет говорить с человеком — агент замолчал в этом диалоге.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: [
      'src/lib/aiAgent/webhookHandler.ts', 'src/lib/aiAgent/whatsappWebhookHandler.ts',
      'src/lib/aiAgent/telegramWebhookHandler.ts', 'src/lib/aiAgent/websiteWebhookHandler.ts',
      'src/lib/aiAgent/externalApiWebhookHandler.ts',
    ],
  },
  {
    key: 'ai_review_draft', audience: 'owner', group: 'aiAgent',
    labelRu: 'Новый ответ ждёт проверки',
    descRu: 'Агент в режиме обучения подготовил ответ клиенту — он уйдёт после вашего одобрения.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: [
      'src/lib/aiAgent/webhookHandler.ts', 'src/lib/aiAgent/whatsappWebhookHandler.ts',
      'src/lib/aiAgent/telegramWebhookHandler.ts', 'src/lib/aiAgent/websiteWebhookHandler.ts',
      'src/lib/aiAgent/externalApiWebhookHandler.ts',
    ],
  },
  {
    key: 'ai_invoice_draft', audience: 'owner', group: 'aiAgent',
    labelRu: 'Черновик счёта ждёт подтверждения',
    descRu: 'Агент подготовил счёт для клиента — он уйдёт после вашего подтверждения.',
    channels: ['bell'], toggleable: [],
    sentFrom: ['src/lib/aiAgent/invoiceSend.ts'],
  },
  {
    key: 'ai_wallet_empty', audience: 'owner', group: 'aiAgent',
    labelRu: 'Кошелёк агента пуст',
    descRu: 'Баланса не хватает на ответы ИИ — клиенты получают заготовку. Не чаще раза в сутки.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: ['src/lib/aiAgent/budgetAlert.ts'],
  },
  {
    key: 'ai_training_exit', audience: 'owner', group: 'aiAgent',
    labelRu: 'Агент вышел из обучения',
    descRu: 'Ответы больше не ждут вашей проверки и сразу уходят клиентам.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: ['src/lib/aiAgent/trainingExit.ts'],
  },
  {
    key: 'ai_pro_lapsed', audience: 'owner', group: 'aiAgent',
    labelRu: 'Клиенты пишут, а агент молчит',
    descRu: 'Тариф Про закончился: сообщения клиентов сохраняются, но агент не отвечает. Не чаще раза в сутки.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: ['src/lib/aiAgent/lapsedInbound.ts'],
  },
  // ---------- Салон ----------
  {
    key: 'salon_booking_pending', audience: 'owner', group: 'salon',
    labelRu: 'Новая запись ждёт подтверждения',
    descRu: 'Клиент записался через агента — подтвердите запись в планировщике.',
    channels: ['telegram', 'bell'], toggleable: ['telegram'],
    sentFrom: ['src/lib/aiAgent/bookingSend.ts'],
  },
  // ---------- Настраивается отдельно ----------
  {
    key: 'cfo_morning_digest', audience: 'owner', group: 'cfo',
    labelRu: 'Утренняя сводка CFO',
    descRu: 'Деньги на счетах и платежи на сегодня. Включается в настройках CFO-кабинета.',
    channels: ['telegram'], toggleable: [],
    managedAt: '/cfo/settings',
    sentFrom: ['src/lib/cfo/digestSend.ts'],
  },
  {
    key: 'welcome_series', audience: 'owner', group: 'account',
    labelRu: 'Письма с советами после регистрации',
    descRu: 'Несколько писем в первую неделю: бонусы за профиль, обзор сервисов, приёмы.',
    channels: ['email'], toggleable: ['email'],
    sentFrom: ['src/app/api/hooks/welcome-instant/route.ts', 'src/app/api/cron/welcome-drip/route.ts'],
  },
  {
    key: 'bin_watch_changed', audience: 'owner', group: 'account',
    labelRu: 'Контрагент на слежении: новый признак риска',
    descRu: 'Письмо не чаще раза в сутки, если у БИН из вашего списка слежения появился новый признак риска.',
    channels: ['email'], toggleable: ['email'],
    sentFrom: ['src/app/api/cron/bin-watch/route.ts', 'src/lib/binWatch/run.ts'],
  },
  // ---------- Что получают клиенты продавца ----------
  {
    key: 'client_invoice_email', audience: 'client', group: 'invoices',
    labelRu: 'Письмо со счётом',
    descRu: 'Уходит, только когда вы сами нажимаете «Отправить» на счёте.',
    channels: ['email'], toggleable: [],
    sentFrom: ['src/app/api/send-invoice/route.ts'],
  },
  {
    key: 'client_recurring_invoice', audience: 'client', group: 'invoices',
    labelRu: 'Повторяющийся счёт раз в месяц',
    descRu: '1-го числа, если вы включили повтор у счёта. Выключается в самом счёте.',
    channels: ['email'], toggleable: [],
    sentFrom: ['src/app/api/cron/recurring/route.ts'],
  },
  {
    key: 'client_wholesale_invoice', audience: 'client', group: 'kaspiShop',
    labelRu: 'Счёт оптовому покупателю витрины',
    descRu: 'Покупатель сам оформил оптовый заказ на вашей витрине — счёт уходит ему на почту.',
    channels: ['email'], toggleable: [],
    sentFrom: ['src/app/api/shop/[slug]/wholesale-order/route.ts'],
  },
  {
    key: 'client_signature_request', audience: 'client', group: 'documents',
    labelRu: 'Документ ожидает подписи',
    descRu: 'Уходит, когда вы подписали документ ЭЦП и отправили его клиенту на подпись.',
    channels: ['email'], toggleable: [],
    sentFrom: ['src/app/api/signatures/owner-sign/route.ts'],
  },
  {
    key: 'client_payment_chat', audience: 'client', group: 'aiAgent',
    labelRu: 'Подтверждение оплаты в чате',
    descRu: 'Если счёт выставил ИИ-агент: после оплаты через Kaspi или нажатия «Я оплатил» клиент получает ответ в том же чате.',
    channels: ['chat'], toggleable: ['chat'],
    sentFrom: ['src/lib/aiAgent/invoiceSend.ts (notifyInvoicePaidInConversation)'],
  },
]

const EVENT_BY_KEY: ReadonlyMap<string, NotificationEventDef> = new Map(NOTIFICATION_EVENTS.map(e => [e.key, e]))

export function getNotificationEvent(key: string): NotificationEventDef | undefined {
  return EVENT_BY_KEY.get(key)
}

export function isToggleable(event: string, channel: string): channel is ToggleableChannel {
  const def = EVENT_BY_KEY.get(event)
  return !!def && (def.toggleable as string[]).includes(channel)
}

// То, что читается из profiles. Все поля необязательны: вызывающий может
// выбрать только нужные колонки, а notification_prefs до миграции нет.
export interface NotifyProfile {
  email?: string | null
  telegram_chat_id?: string | null
  notification_prefs?: unknown
  notify_email?: boolean | null
  notify_telegram?: boolean | null
  notify_client_viewed?: boolean | null
  notify_payment_reminder?: boolean | null
  notify_overdue?: boolean | null
  notify_weekly_report?: boolean | null
  email_optout?: boolean | null
}

// Колонки, которых достаточно для любого решения wantsNotification
// (без notification_prefs — её добавляет загрузчик, если колонка есть).
export const NOTIFY_PROFILE_COLUMNS =
  'email, telegram_chat_id, notify_email, notify_telegram, notify_client_viewed, notify_payment_reminder, notify_overdue, notify_weekly_report, email_optout'

// Явный выбор пользователя из jsonb, если он есть и он boolean. Мусор в
// колонке (строки, числа, массивы) считается «не выбирал».
export function explicitPref(prefs: unknown, event: string, channel: string): boolean | undefined {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return undefined
  const forEvent = (prefs as Record<string, unknown>)[event]
  if (!forEvent || typeof forEvent !== 'object' || Array.isArray(forEvent)) return undefined
  const value = (forEvent as Record<string, unknown>)[channel]
  return typeof value === 'boolean' ? value : undefined
}

// Значение по умолчанию = поведение платформы до notification_prefs.
//  - Telegram: всё шло через общий рубильник notify_telegram (по умолчанию
//    выключен; при подключении бота он теперь включается сам). Исключения:
//    еженедельный отчёт — только если включён и сам отчёт (раньше TG
//    приходил и при выключенном отчёте — это был баг); ЭЦП и BCC раньше
//    в Telegram не приходили вовсе — по умолчанию выключено.
//  - Email: свои колонки notify_* там, где они были; новые/безфлаговые
//    письма (ЭЦП, BCC) — включены, как и шли всегда.
export function defaultPref(profile: NotifyProfile, event: NotificationEventKey, channel: ToggleableChannel): boolean {
  const tgMaster = profile.notify_telegram === true
  if (channel === 'chat') return true
  if (channel === 'telegram') {
    switch (event) {
      case 'weekly_report': return tgMaster && profile.notify_weekly_report === true
      case 'document_signed':
      case 'bcc_matches_found': return false
      default: return tgMaster
    }
  }
  // email
  switch (event) {
    case 'invoice_viewed': return profile.notify_client_viewed !== false
    case 'invoice_marked_paid': return profile.notify_email !== false
    // Новое событие без своей старой колонки — просто включено. НЕ читаем
    // notify_email: до миграции эту колонку пишет тумблер «Я оплатил», и он
    // молча выключал бы заодно и это письмо (тумблер которого до миграции
    // заблокирован).
    case 'invoice_paid_kaspi': return true
    case 'invoice_due_tomorrow': return profile.notify_payment_reminder !== false
    case 'invoice_overdue': return profile.notify_overdue !== false
    case 'weekly_report': return profile.notify_weekly_report === true
    case 'welcome_series': return profile.email_optout !== true
    default: return true
  }
}

// Чистое предпочтение (без проверки, подключён ли канал) — для страницы.
// Для нетогглируемых каналов события: true (колокольчик/информационное).
export function preferenceFor(profile: NotifyProfile | null | undefined, event: NotificationEventKey, channel: NotificationChannel): boolean {
  const def = EVENT_BY_KEY.get(event)
  if (!def || !def.channels.includes(channel)) return false
  if (def.managedAt) return true // решает своя настройка (CFO) — здесь не гейтим
  if (!(def.toggleable as string[]).includes(channel)) return true
  const p = profile || {}
  // Приветственная цепочка живёт в своей колонке-отписке (её читают
  // welcome-крон и /api/email/unsubscribe) — единственный источник правды.
  if (event === 'welcome_series') return p.email_optout !== true
  const explicit = explicitPref(p.notification_prefs, event, channel)
  if (explicit !== undefined) return explicit
  return defaultPref(p, event, channel as ToggleableChannel)
}

// Главная проверка для отправителей: хочет ли владелец это событие по этому
// каналу И есть ли куда слать (Telegram подключён / есть email).
export function wantsNotification(profile: NotifyProfile | null | undefined, event: NotificationEventKey, channel: NotificationChannel): boolean {
  if (!profile) return false
  if (channel === 'telegram' && !profile.telegram_chat_id) return false
  if (channel === 'email' && !profile.email) return false
  return preferenceFor(profile, event, channel)
}

// Полная картина для GET /api/notification-prefs.
export function resolveAllPrefs(profile: NotifyProfile | null | undefined): Record<string, Partial<Record<NotificationChannel, boolean>>> {
  const out: Record<string, Partial<Record<NotificationChannel, boolean>>> = {}
  for (const def of NOTIFICATION_EVENTS) {
    const values: Partial<Record<NotificationChannel, boolean>> = {}
    for (const ch of def.channels) values[ch] = preferenceFor(profile, def.key, ch)
    out[def.key] = values
  }
  return out
}

// Старая колонка, которая до миграции может хранить выбор этого тумблера
// целиком (одна колонка = одно событие × канал). Для Telegram такой нет —
// notify_telegram был общим рубильником на все события.
export function legacyColumnFor(event: NotificationEventKey, channel: ToggleableChannel): keyof NotifyProfile | null {
  if (channel !== 'email') return null
  switch (event) {
    case 'invoice_viewed': return 'notify_client_viewed'
    case 'invoice_marked_paid': return 'notify_email'
    case 'invoice_due_tomorrow': return 'notify_payment_reminder'
    case 'invoice_overdue': return 'notify_overdue'
    case 'weekly_report': return 'notify_weekly_report'
    default: return null
  }
}

// До миграции: единый рубильник «Все уведомления в Telegram» — старая
// колонка notify_telegram (значение по умолчанию для всех Telegram-событий,
// см. defaultPref). Псевдо-событие для PATCH /api/notification-prefs: без
// него до применения SQL у владельца нет способа выключить Telegram, кроме
// как отвязать бота. После миграции не показывается — там тумблеры по событиям.
export const LEGACY_TELEGRAM_MASTER_EVENT = 'telegram_all'

// Значение рубильника для страницы (как его видят Telegram-события по умолчанию).
export function legacyTelegramMaster(profile: NotifyProfile | null | undefined): boolean {
  return profile?.notify_telegram === true
}

// Раз в сутки на товар: «цена упёрлась в минимум» (захват — в checkCycle.ts).
export const FLOOR_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000

// Тестовое сообщение в Telegram: не чаще раза в 30 секунд на аккаунт.
export const TELEGRAM_TEST_INTERVAL_MS = 30 * 1000
