import type { Lang } from '@/components/LanguageProvider'

// Карточка в /create «Нашли ваши реквизиты из бесплатного документа»
// (src/components/ToolRequisitesOffer.tsx, 03.11.2026). kk вычитывает носитель
// языка (запись 'cabinet-ui' реестра src/lib/kkReview.ts покрывает src/lib/i18n).
// В строках нет тире и эмодзи.
export interface ToolRequisitesOfferTexts {
  title: string
  /** Строка с компанией: название и БИН. */
  company: (name: string, bin: string) => string
  /** Строка с банком: название и последние цифры ИИК. */
  bank: (name: string, last4: string) => string
  saveButton: string
  saving: string
  errBin: string
  errIik: string
  errGeneric: string
}

export const toolRequisitesOfferDict: Record<Lang, ToolRequisitesOfferTexts> = {
  ru: {
    title: 'Нашли ваши реквизиты из бесплатного документа',
    company: (name, bin) => `${name}, БИН ${bin}`,
    bank: (name, last4) => `${name}, ИИК заканчивается на ${last4}`,
    saveButton: 'Сохранить и продолжить',
    saving: 'Сохраняем',
    errBin: 'БИН в сохранённых реквизитах не проходит проверку. Откройте «Реквизиты» и поправьте.',
    errIik: 'ИИК в сохранённых реквизитах не проходит проверку. Откройте «Банковские счета» и поправьте.',
    errGeneric: 'Не удалось сохранить. Попробуйте ещё раз или заполните вручную.',
  },
  kk: {
    title: 'Тегін құжаттан деректемелеріңізді таптық',
    company: (name, bin) => `${name}, БСН ${bin}`,
    bank: (name, last4) => `${name}, ЖСК соңғы цифрлары ${last4}`,
    saveButton: 'Сақтап, жалғастыру',
    saving: 'Сақталуда',
    errBin: 'Сақталған деректемелердегі БСН тексеруден өтпейді. «Деректемелерді» ашып, түзетіңіз.',
    errIik: 'Сақталған деректемелердегі ЖСК тексеруден өтпейді. «Банк шоттарын» ашып, түзетіңіз.',
    errGeneric: 'Сақтау мүмкін болмады. Қайталап көріңіз немесе қолмен толтырыңыз.',
  },
  en: {
    title: 'We found your details from the free document',
    company: (name, bin) => `${name}, BIN ${bin}`,
    bank: (name, last4) => `${name}, account ending in ${last4}`,
    saveButton: 'Save and continue',
    saving: 'Saving',
    errBin: 'The BIN in the saved details does not pass the check. Open Company details and fix it.',
    errIik: 'The account number in the saved details does not pass the check. Open Bank accounts and fix it.',
    errGeneric: 'Could not save. Try again or fill it in by hand.',
  },
}
