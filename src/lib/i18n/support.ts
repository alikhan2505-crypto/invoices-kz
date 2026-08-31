// New i18n module for the "Telegram support is Basic/Pro only" gating copy.
// Kept separate from src/lib/i18n/misc.ts (which another agent is editing
// concurrently) so this feature doesn't collide with unrelated landing work.
//
// Used by: src/app/dashboard/page.tsx (footer contacts), src/app/profile/support/page.tsx,
// src/app/profile/about/page.tsx, src/app/upgrade/page.tsx (free-plan footer variant).

export interface SupportGatingContent {
  // Shown in place of the Telegram support link for free-plan users.
  telegramGatedNotice: string
  // Short link label pointing at /upgrade, placed right after telegramGatedNotice.
  upgradeLinkLabel: string
  // upgrade/page.tsx footer, free-plan variant: text before the support@invoices.kz mailto link
  // (paid users keep the existing "Вопросы? Написать в Telegram" copy from misc.ts, untouched).
  upgradeFooterEmailPrefix: string
}

export const supportDict: Record<'ru' | 'kk' | 'en', SupportGatingContent> = {
  ru: {
    telegramGatedNotice: 'Поддержка в Telegram доступна на тарифах Базовый и Про.',
    upgradeLinkLabel: 'Оформить тариф',
    upgradeFooterEmailPrefix: 'Вопросы? Напишите на ',
  },
  kk: {
    telegramGatedNotice: 'Telegram-дағы қолдау Базовый және Про тарифтерінде қолжетімді.',
    upgradeLinkLabel: 'Тарифті рәсімдеу',
    upgradeFooterEmailPrefix: 'Сұрақтарыңыз болса, мына мекенжайға жазыңыз: ',
  },
  en: {
    telegramGatedNotice: 'Telegram support is available on the Basic and Pro plans.',
    upgradeLinkLabel: 'Upgrade plan',
    upgradeFooterEmailPrefix: 'Questions? Email us at ',
  },
}
