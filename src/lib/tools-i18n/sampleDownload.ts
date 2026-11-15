import type { ToolLang } from './index'
import type { SampleCtaTool } from './sampleCta'

// «Скачать образец PDF» на страницах бесплатных инструментов (15.11.2026).
// В Search Console основные запросы на этих страницах: «образец», «бланк», «скачать».
// Человек приходит за готовым файлом, а предлагали заполнить форму. Файл лежит
// готовым в public/samples (собирает scripts/build-sample-pdfs.mts теми же
// данными и тем же генератором, что показан на странице), скачивается одним
// нажатием, без окна, без регистрации и без траты лимита документов.
//
// Казахский текст кнопки появится только после вычитки (src/lib/kkReview.ts,
// файл «Тексты на вычитку (казахский).md»): пока для kk возвращается null и
// кнопки на /tools/kk/* нет. Сам PDF русский на всех языках, как и образец.
//
// В тексте нет тире и эмодзи (правило новых строк интерфейса).

export interface SampleDownloadFile {
  /** Публичный путь файла. */
  href: string
  /** Имя при сохранении (латиница: так надёжнее в любом браузере и почте). */
  fileName: string
}

/** Готовые PDF. Инструмент без записи кнопку не получает. */
export const SAMPLE_DOWNLOADS: Partial<Record<SampleCtaTool, SampleDownloadFile>> = {
  avr: { href: '/samples/obrazec-akta-vypolnennyh-rabot.pdf', fileName: 'obrazec-akta-vypolnennyh-rabot.pdf' },
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
  avr: { button: 'Download the sample act (PDF)', link: 'Download the sample act (PDF)' },
  kp: { button: 'Download the sample offer (PDF)', link: 'Download the sample offer (PDF)' },
  schet: { button: 'Download the sample invoice (PDF)', link: 'Download the sample invoice (PDF)' },
  nakladnaya: { button: 'Download the sample waybill (PDF)', link: 'Download the sample waybill (PDF)' },
}
const HINT: Record<'ru' | 'en', string> = {
  ru: 'PDF на русском, данные вымышленные, без регистрации.',
  en: 'PDF in Russian, fictional data, no sign-up.',
}

/** Файл и тексты для инструмента и языка; null, если файла нет или текста на языке ещё нет. */
export function sampleDownload(tool: SampleCtaTool, lang: ToolLang): { file: SampleDownloadFile; copy: SampleDownloadCopy } | null {
  const file = SAMPLE_DOWNLOADS[tool]
  if (!file) return null
  if (lang === 'ru') return { file, copy: { ...RU[tool], hint: HINT.ru } }
  if (lang === 'en') return { file, copy: { ...EN[tool], hint: HINT.en } }
  return null
}
