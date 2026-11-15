import type { ToolLang } from './index'
import type { SampleCtaTool } from './sampleCta'
import { SAMPLE_DEFAULT_VAT, type SampleVat } from './sampleVat'

// «Скачать образец PDF» на страницах бесплатных инструментов (15.11.2026).
// В Search Console основные запросы на этих страницах: «образец», «бланк», «скачать».
// Человек приходит за готовым файлом, а предлагали заполнить форму. Файл лежит
// готовым в public/samples (собирает scripts/build-sample-pdfs.mts теми же
// данными и тем же генератором, что показан на странице), скачивается одним
// нажатием, без окна, без регистрации и без траты лимита документов.
//
// Для каждого документа два файла: без НДС и с НДС 16%. Какой из них скачается,
// решает переключатель НДС над образцом (ToolSampleSwitch): файл всегда совпадает
// с тем, что показано на странице. Ссылка над формой отдаёт вариант по умолчанию.
//
// Казахский текст кнопки появится только после вычитки (src/lib/kkReview.ts,
// файл «Тексты на вычитку (казахский).md»): пока для kk возвращается null и
// кнопки на /tools/kk/* нет. Сам PDF русский на всех языках, кроме КП на английском.
//
// В тексте нет тире и эмодзи (правило новых строк интерфейса).

export interface SampleDownloadFile {
  /** Публичный путь файла. */
  href: string
  /** Имя при сохранении (латиница: так надёжнее в любом браузере и почте). */
  fileName: string
}

const file = (name: string): SampleDownloadFile => ({ href: `/samples/${name}.pdf`, fileName: `${name}.pdf` })

type ByVat = Record<SampleVat, SampleDownloadFile>

/**
 * Готовые PDF по инструментам и режимам НДС. ru - основные файлы; en - только там,
 * где у образца есть английский документ (КП), иначе английская страница берёт
 * русские файлы, как и сам образец на странице. Файлов для kk нет до вычитки.
 */
export const SAMPLE_DOWNLOADS: Record<SampleCtaTool, { ru: ByVat; en?: ByVat }> = {
  avr: {
    ru: { no_vat: file('obrazec-akta-vypolnennyh-rabot'), vat_16: file('obrazec-akta-vypolnennyh-rabot-s-nds') },
  },
  kp: {
    ru: { vat_16: file('obrazec-kommercheskogo-predlozheniya'), no_vat: file('obrazec-kommercheskogo-predlozheniya-bez-nds') },
    en: { vat_16: file('sample-commercial-offer'), no_vat: file('sample-commercial-offer-no-vat') },
  },
  schet: {
    ru: { vat_16: file('obrazec-scheta-na-oplatu'), no_vat: file('obrazec-scheta-na-oplatu-bez-nds') },
  },
  nakladnaya: {
    ru: { vat_16: file('obrazec-nakladnoy'), no_vat: file('obrazec-nakladnoy-bez-nds') },
  },
}

export interface SampleDownloadCopy {
  /** Кнопка рядом с образцом. */
  button: string
  /** Короткая ссылка над формой. */
  link: string
  /** Пояснение под кнопкой. */
  hint: string
}

const RU: Record<SampleCtaTool, { button: string; link: string }> = {
  avr: { button: 'Скачать образец акта в PDF', link: 'Скачать образец акта (PDF)' },
  kp: { button: 'Скачать образец КП в PDF', link: 'Скачать образец КП (PDF)' },
  schet: { button: 'Скачать образец счёта в PDF', link: 'Скачать образец счёта (PDF)' },
  nakladnaya: { button: 'Скачать образец накладной в PDF', link: 'Скачать образец накладной (PDF)' },
}
const EN: Record<SampleCtaTool, { button: string; link: string }> = {
  avr: { button: 'Download the sample AVR (PDF)', link: 'Download the sample AVR (PDF)' },
  kp: { button: 'Download the sample commercial proposal (PDF)', link: 'Download the sample proposal (PDF)' },
  schet: { button: 'Download the sample invoice (PDF)', link: 'Download the sample invoice (PDF)' },
  nakladnaya: { button: 'Download the sample delivery note (PDF)', link: 'Download the sample delivery note (PDF)' },
}
const HINT = {
  ru: 'PDF на русском, данные вымышленные, без регистрации.',
  enRussianForm: 'PDF in Russian, fictional data, no sign-up.',
  enEnglishForm: 'PDF in English, fictional data, no sign-up.',
}

/**
 * Файл и тексты для инструмента, языка и режима НДС; null, если текста на языке ещё нет.
 * Без vat берётся режим по умолчанию для инструмента (для ссылки над формой).
 */
export function sampleDownload(
  tool: SampleCtaTool,
  lang: ToolLang,
  vat: SampleVat = SAMPLE_DEFAULT_VAT[tool],
): { file: SampleDownloadFile; copy: SampleDownloadCopy } | null {
  const entry = SAMPLE_DOWNLOADS[tool]
  if (lang === 'ru') return { file: entry.ru[vat], copy: { ...RU[tool], hint: HINT.ru } }
  if (lang === 'en') {
    const files = entry.en ?? entry.ru
    return { file: files[vat], copy: { ...EN[tool], hint: entry.en ? HINT.enEnglishForm : HINT.enRussianForm } }
  }
  return null
}
