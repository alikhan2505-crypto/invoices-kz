import type { ToolLang } from './index'

// Тексты блока с кнопкой под образцом (ToolSampleCta) для четырёх документов:
// акт, КП, счёт, накладная. Макет согласован основателем 14.11.2026 для акта; те же
// данные Search Console (запросы «образец», «бланк», «скачать» на всех четырёх
// страницах) легли в основу остальных трёх.
//
// Казахского текста нет намеренно: kk-строки нельзя выкладывать до вычитки
// основателем (src/lib/kkReview.ts), поэтому на /tools/kk/<инструмент> блок не
// показывается, пока текст не утверждён. Черновик kk лежит в файле «Тексты на
// вычитку (казахский).md». Чтобы включить kk: заполнить поле kk и убрать null.
//
// В тексте нет тире и эмодзи (правило новых строк интерфейса).

export type SampleCtaTool = 'avr' | 'kp' | 'schet' | 'nakladnaya'

export interface SampleCtaCopy { title: string; body: string; button: string }

/** Поле формы, куда кнопка ставит курсор: БИН исполнителя. */
export const SAMPLE_CTA_TARGET_ID: Record<SampleCtaTool, string> = {
  avr: 'avr-bin',
  kp: 'kp-bin',
  schet: 'sc-bin',
  nakladnaya: 'nk-bin',
}

const BUTTON: Record<'ru' | 'en', string> = {
  ru: 'Заполнить образец своими данными ↑',
  en: 'Fill in the sample with my details ↑',
}

const RU: Record<SampleCtaTool, { title: string; body: string }> = {
  avr: {
    title: 'Нужен такой же акт со своими данными?',
    body: 'Введите БИН, название компании подставится само. Готовый акт в PDF за минуту, без регистрации.',
  },
  kp: {
    title: 'Нужно такое же КП со своими данными?',
    body: 'Введите БИН, название компании подставится само. Готовое КП в PDF за минуту, без регистрации.',
  },
  schet: {
    title: 'Нужен такой же счёт на оплату со своими данными?',
    body: 'Введите БИН, название компании подставится само. Готовый счёт в PDF за минуту, без регистрации.',
  },
  nakladnaya: {
    title: 'Нужна такая же накладная со своими данными?',
    body: 'Введите БИН, название компании подставится само. Готовая накладная в PDF за минуту, без регистрации.',
  },
}

const EN: Record<SampleCtaTool, string> = {
  avr: 'Need an act like this with your own details?',
  kp: 'Need a commercial offer like this with your own details?',
  schet: 'Need an invoice like this with your own details?',
  nakladnaya: 'Need a waybill like this with your own details?',
}
const EN_BODY = 'Enter your BIN and the company name fills in by itself. A ready PDF in a minute, no sign-up.'

/** Текст блока для инструмента и языка; null, если для языка текста ещё нет (kk до вычитки). */
export function sampleCtaCopy(tool: SampleCtaTool, lang: ToolLang): SampleCtaCopy | null {
  if (lang === 'ru') return { ...RU[tool], button: BUTTON.ru }
  if (lang === 'en') return { title: EN[tool], body: EN_BODY, button: BUTTON.en }
  return null
}
