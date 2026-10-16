import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_EVENTS,
  explicitPref,
  getNotificationEvent,
  isToggleable,
  legacyColumnFor,
  legacyTelegramMaster,
  LEGACY_TELEGRAM_MASTER_EVENT,
  preferenceFor,
  resolveAllPrefs,
  wantsNotification,
  type NotifyProfile,
} from './notificationPrefs'

// Профиль «как у большинства сегодня»: значения колонок по умолчанию из базы
// (notify_email/client_viewed/payment_reminder/overdue = true,
// notify_telegram/weekly_report = false), без notification_prefs.
const dbDefaults: NotifyProfile = {
  email: 'owner@example.kz',
  telegram_chat_id: null,
  notify_email: true,
  notify_telegram: false,
  notify_client_viewed: true,
  notify_payment_reminder: true,
  notify_overdue: true,
  notify_weekly_report: false,
  email_optout: false,
}
const tgOn: NotifyProfile = { ...dbDefaults, telegram_chat_id: '42', notify_telegram: true }

describe('catalogue', () => {
  it('has unique keys and toggleable ⊆ channels, bell never toggleable', () => {
    const keys = NOTIFICATION_EVENTS.map(e => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const e of NOTIFICATION_EVENTS) {
      for (const ch of e.toggleable) expect(e.channels).toContain(ch)
      expect(e.toggleable as string[]).not.toContain('bell')
      expect(e.sentFrom.length).toBeGreaterThan(0)
    }
  })

  it('has the new Kaspi Pay owner event on telegram + email + bell', () => {
    const e = getNotificationEvent('invoice_paid_kaspi')!
    expect(e.audience).toBe('owner')
    expect(e.channels.sort()).toEqual(['bell', 'email', 'telegram'])
    expect(e.toggleable.sort()).toEqual(['email', 'telegram'])
  })

  it('isToggleable rejects unknown events and fixed channels', () => {
    expect(isToggleable('invoice_viewed', 'telegram')).toBe(true)
    expect(isToggleable('ai_operator_requested', 'bell')).toBe(false)
    expect(isToggleable('ai_operator_requested', 'email')).toBe(false)
    expect(isToggleable('nope', 'email')).toBe(false)
    expect(isToggleable('client_invoice_email', 'email')).toBe(false)
    expect(isToggleable('client_payment_chat', 'chat')).toBe(true)
  })
})

describe('defaults = behaviour before notification_prefs', () => {
  it('email events follow their old columns (default on), weekly report default off', () => {
    expect(wantsNotification(dbDefaults, 'invoice_viewed', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'invoice_marked_paid', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'invoice_due_tomorrow', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'invoice_overdue', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'weekly_report', 'email')).toBe(false)
    // Без флага раньше — шли всегда.
    expect(wantsNotification(dbDefaults, 'document_signed', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'bcc_matches_found', 'email')).toBe(true)
  })

  it('old per-event email columns switched off still switch the email off', () => {
    const p = { ...dbDefaults, notify_client_viewed: false, notify_email: false, notify_payment_reminder: false, notify_overdue: false }
    expect(wantsNotification(p, 'invoice_viewed', 'email')).toBe(false)
    expect(wantsNotification(p, 'invoice_marked_paid', 'email')).toBe(false)
    expect(wantsNotification(p, 'invoice_due_tomorrow', 'email')).toBe(false)
    expect(wantsNotification(p, 'invoice_overdue', 'email')).toBe(false)
  })

  it('Kaspi Pay paid email does not ride on notify_email (the «Я оплатил» toggle writes it before the migration)', () => {
    expect(wantsNotification({ ...dbDefaults, notify_email: false }, 'invoice_paid_kaspi', 'email')).toBe(true)
    expect(wantsNotification(dbDefaults, 'invoice_paid_kaspi', 'email')).toBe(true)
    expect(wantsNotification({ ...dbDefaults, notification_prefs: { invoice_paid_kaspi: { email: false } } }, 'invoice_paid_kaspi', 'email')).toBe(false)
  })

  it('null old columns behave like the DB defaults', () => {
    const p: NotifyProfile = { email: 'a@b.kz', telegram_chat_id: '1' }
    expect(wantsNotification(p, 'invoice_viewed', 'email')).toBe(true)
    expect(wantsNotification(p, 'weekly_report', 'email')).toBe(false)
    expect(wantsNotification(p, 'invoice_viewed', 'telegram')).toBe(false)
  })

  it('telegram follows the old notify_telegram master switch', () => {
    for (const key of ['invoice_viewed', 'invoice_marked_paid', 'invoice_paid_kaspi', 'invoice_due_tomorrow', 'invoice_overdue',
      'kaspi_daily_digest', 'kaspi_floor_price', 'ai_operator_requested', 'ai_review_draft', 'ai_wallet_empty',
      'ai_training_exit', 'ai_pro_lapsed', 'salon_booking_pending'] as const) {
      expect(wantsNotification(tgOn, key, 'telegram')).toBe(true)
      expect(wantsNotification({ ...tgOn, notify_telegram: false }, key, 'telegram')).toBe(false)
    }
  })

  it('weekly report Telegram needs the report itself switched on (old bug: it went out regardless)', () => {
    expect(wantsNotification(tgOn, 'weekly_report', 'telegram')).toBe(false)
    expect(wantsNotification({ ...tgOn, notify_weekly_report: true }, 'weekly_report', 'telegram')).toBe(true)
  })

  it('ЭЦП and BCC never went to Telegram before — default off there', () => {
    expect(wantsNotification(tgOn, 'document_signed', 'telegram')).toBe(false)
    expect(wantsNotification(tgOn, 'bcc_matches_found', 'telegram')).toBe(false)
  })

  it('client chat confirmation is on by default', () => {
    expect(preferenceFor(dbDefaults, 'client_payment_chat', 'chat')).toBe(true)
    expect(preferenceFor(null, 'client_payment_chat', 'chat')).toBe(true)
  })

  it('welcome series reads email_optout only', () => {
    expect(wantsNotification(dbDefaults, 'welcome_series', 'email')).toBe(true)
    expect(wantsNotification({ ...dbDefaults, email_optout: true }, 'welcome_series', 'email')).toBe(false)
    // jsonb не перебивает колонку-отписку.
    expect(wantsNotification({ ...dbDefaults, email_optout: true, notification_prefs: { welcome_series: { email: true } } }, 'welcome_series', 'email')).toBe(false)
  })
})

describe('explicit notification_prefs win over defaults', () => {
  it('turns a single event/channel off without touching the others', () => {
    const p = { ...tgOn, notification_prefs: { invoice_viewed: { telegram: false } } }
    expect(wantsNotification(p, 'invoice_viewed', 'telegram')).toBe(false)
    expect(wantsNotification(p, 'invoice_viewed', 'email')).toBe(true)
    expect(wantsNotification(p, 'invoice_overdue', 'telegram')).toBe(true)
  })

  it('turns telegram on per event even with the old master switch off', () => {
    const p = { ...tgOn, notify_telegram: false, notification_prefs: { ai_operator_requested: { telegram: true } } }
    expect(wantsNotification(p, 'ai_operator_requested', 'telegram')).toBe(true)
    expect(wantsNotification(p, 'ai_review_draft', 'telegram')).toBe(false)
  })

  it('beats the old email columns both ways', () => {
    expect(wantsNotification({ ...dbDefaults, notify_overdue: false, notification_prefs: { invoice_overdue: { email: true } } }, 'invoice_overdue', 'email')).toBe(true)
    expect(wantsNotification({ ...dbDefaults, notification_prefs: { invoice_overdue: { email: false } } }, 'invoice_overdue', 'email')).toBe(false)
    expect(wantsNotification({ ...tgOn, notification_prefs: { weekly_report: { telegram: true } } }, 'weekly_report', 'telegram')).toBe(true)
  })

  it('client chat confirmation can be switched off', () => {
    expect(preferenceFor({ notification_prefs: { client_payment_chat: { chat: false } } }, 'client_payment_chat', 'chat')).toBe(false)
  })

  it('ignores garbage in the jsonb (falls back to defaults)', () => {
    for (const prefs of ['x', 1, [], null, { invoice_viewed: 'off' }, { invoice_viewed: { telegram: 'false' } }, { invoice_viewed: [false] }]) {
      expect(explicitPref(prefs, 'invoice_viewed', 'telegram')).toBeUndefined()
      expect(wantsNotification({ ...tgOn, notification_prefs: prefs }, 'invoice_viewed', 'telegram')).toBe(true)
    }
  })
})

describe('destination and channel guards', () => {
  it('no Telegram chat / no email = nothing to send, whatever the prefs say', () => {
    const p = { ...dbDefaults, notify_telegram: true, notification_prefs: { invoice_viewed: { telegram: true } } }
    expect(wantsNotification(p, 'invoice_viewed', 'telegram')).toBe(false)
    expect(preferenceFor(p, 'invoice_viewed', 'telegram')).toBe(true)
    expect(wantsNotification({ ...dbDefaults, email: null }, 'invoice_viewed', 'email')).toBe(false)
    expect(wantsNotification(null, 'invoice_viewed', 'email')).toBe(false)
  })

  it('a channel the event does not have is always false', () => {
    expect(wantsNotification(tgOn, 'kaspi_floor_price', 'email')).toBe(false)
    expect(wantsNotification(tgOn, 'invoice_viewed', 'bell')).toBe(false)
    expect(wantsNotification({ ...tgOn, notification_prefs: { kaspi_floor_price: { email: true } } }, 'kaspi_floor_price', 'email')).toBe(false)
  })

  it('bell is informational: always on where the event has it', () => {
    expect(wantsNotification(dbDefaults, 'ai_operator_requested', 'bell')).toBe(true)
    expect(wantsNotification(dbDefaults, 'invoices_unpaid_summary', 'bell')).toBe(true)
  })
})

describe('resolveAllPrefs / legacyColumnFor', () => {
  it('returns a value for every channel of every event', () => {
    const all = resolveAllPrefs(tgOn)
    for (const e of NOTIFICATION_EVENTS) {
      expect(Object.keys(all[e.key]).sort()).toEqual([...e.channels].sort())
    }
    expect(all.invoice_viewed).toEqual({ telegram: true, email: true })
    expect(all.weekly_report).toEqual({ telegram: false, email: false })
  })

  it('maps only single-event email toggles to an old column', () => {
    expect(legacyColumnFor('invoice_viewed', 'email')).toBe('notify_client_viewed')
    expect(legacyColumnFor('invoice_marked_paid', 'email')).toBe('notify_email')
    expect(legacyColumnFor('weekly_report', 'email')).toBe('notify_weekly_report')
    expect(legacyColumnFor('invoice_viewed', 'telegram')).toBeNull()
    expect(legacyColumnFor('document_signed', 'email')).toBeNull()
    expect(legacyColumnFor('invoice_paid_kaspi', 'email')).toBeNull()
  })

  it('legacy Telegram master mirrors notify_telegram', () => {
    expect(legacyTelegramMaster(tgOn)).toBe(true)
    expect(legacyTelegramMaster(dbDefaults)).toBe(false)
    expect(legacyTelegramMaster(null)).toBe(false)
    expect(getNotificationEvent(LEGACY_TELEGRAM_MASTER_EVENT)).toBeUndefined()
  })
})
