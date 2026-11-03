import type { Lang } from '@/components/LanguageProvider'

// Карточка «Заполните реквизиты за минуту» в /create (src/components/QuickRequisitesSetup.tsx,
// 03.11.2026): БИН, банк и ИИК на одном экране вместо двух походов по профилю.
// kk вычитывает носитель языка (запись 'cabinet-ui' реестра src/lib/kkReview.ts покрывает
// src/lib/i18n). В строках нет тире и эмодзи.
export interface QuickRequisitesTexts {
  title: string
  hint: string
  binLabel: string
  lookupButton: string
  lookupNotFound: string
  companyLabel: string
  companyPlaceholder: string
  bankLabel: string
  bankPlaceholder: string
  iikLabel: string
  iikPlaceholder: string
  otherBank: string
  otherBankLink: string
  saveButton: string
  saving: string
  errCompany: string
  errBank: string
  errGeneric: string
  stepLabel: (n: number, total: number) => string
  stepCompanyName: string
  stepBankName: string
  nextButton: string
  backButton: string
  lookupFound: (name: string) => string
  doneTitle: string
  doneHint: string
}

export const quickRequisitesDict: Record<Lang, QuickRequisitesTexts> = {
  ru: {
    title: 'Заполните реквизиты за минуту, и счёт можно выставлять',
    hint: 'Введите БИН и нажмите «Проверить»: название, адрес и руководитель подставятся из реестра.',
    binLabel: 'БИН / ИИН вашей компании',
    lookupButton: 'Проверить',
    lookupNotFound: 'В реестре не нашли, впишите название сами.',
    companyLabel: 'Название компании / ИП',
    companyPlaceholder: 'ТОО «Пример»',
    bankLabel: 'Банк',
    bankPlaceholder: 'Выберите банк',
    iikLabel: 'ИИК (номер счёта)',
    iikPlaceholder: 'KZ…',
    otherBank: 'Нет вашего банка?',
    otherBankLink: 'Добавьте счёт на странице «Банковские счета»',
    saveButton: 'Сохранить и продолжить',
    saving: 'Сохраняем',
    errCompany: 'Укажите название компании',
    errBank: 'Выберите банк и впишите ИИК',
    errGeneric: 'Не удалось сохранить. Попробуйте ещё раз.',
    stepLabel: (n, total) => `Шаг ${n} из ${total}`,
    stepCompanyName: 'Компания',
    stepBankName: 'Банк',
    nextButton: 'Далее',
    backButton: 'Назад',
    lookupFound: (name) => `Нашли в реестре: ${name}`,
    doneTitle: 'Готово, реквизиты сохранены',
    doneHint: 'Теперь можно выставлять счёт',
  },
  kk: {
    title: 'Деректемелерді бір минутта толтырыңыз, содан кейін шот шығаруға болады',
    hint: 'БСН енгізіп, «Тексеру» түймесін басыңыз: атауы, мекенжайы және басшысы тізілімнен қойылады.',
    binLabel: 'Компанияңыздың БСН / ЖСН',
    lookupButton: 'Тексеру',
    lookupNotFound: 'Тізілімде табылмады, атауын өзіңіз жазыңыз.',
    companyLabel: 'Компания / ЖК атауы',
    companyPlaceholder: '«Мысал» ЖШС',
    bankLabel: 'Банк',
    bankPlaceholder: 'Банкті таңдаңыз',
    iikLabel: 'ЖСК (шот нөмірі)',
    iikPlaceholder: 'KZ…',
    otherBank: 'Банкіңіз жоқ па?',
    otherBankLink: '«Банк шоттары» бетінде шотты қосыңыз',
    saveButton: 'Сақтап, жалғастыру',
    saving: 'Сақталуда',
    errCompany: 'Компания атауын көрсетіңіз',
    errBank: 'Банкті таңдап, ЖСК жазыңыз',
    errGeneric: 'Сақтау мүмкін болмады. Қайталап көріңіз.',
    stepLabel: (n, total) => `${n}-қадам, барлығы ${total}`,
    stepCompanyName: 'Компания',
    stepBankName: 'Банк',
    nextButton: 'Әрі қарай',
    backButton: 'Артқа',
    lookupFound: (name) => `Тізілімнен таптық: ${name}`,
    doneTitle: 'Дайын, деректемелер сақталды',
    doneHint: 'Енді шот шығаруға болады',
  },
  en: {
    title: 'Fill in your details in a minute and you can issue invoices',
    hint: 'Enter your BIN and press Check: the name, address and director are filled in from the register.',
    binLabel: 'Your company BIN / IIN',
    lookupButton: 'Check',
    lookupNotFound: 'Not found in the register, type the name yourself.',
    companyLabel: 'Company / sole proprietor name',
    companyPlaceholder: 'Example LLP',
    bankLabel: 'Bank',
    bankPlaceholder: 'Choose a bank',
    iikLabel: 'Account number (IIK)',
    iikPlaceholder: 'KZ…',
    otherBank: 'Your bank is not listed?',
    otherBankLink: 'Add the account on the Bank accounts page',
    saveButton: 'Save and continue',
    saving: 'Saving',
    errCompany: 'Enter the company name',
    errBank: 'Choose a bank and enter the account number',
    errGeneric: 'Could not save. Try again.',
    stepLabel: (n, total) => `Step ${n} of ${total}`,
    stepCompanyName: 'Company',
    stepBankName: 'Bank',
    nextButton: 'Next',
    backButton: 'Back',
    lookupFound: (name) => `Found in the register: ${name}`,
    doneTitle: 'Done, your details are saved',
    doneHint: 'You can issue an invoice now',
  },
}
