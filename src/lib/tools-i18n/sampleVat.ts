import type { SampleCtaTool } from './sampleCta'

// Режим НДС в образце документа на страницах бесплатных /tools (15.11.2026):
// переключатель «Без НДС / С НДС 16%» над образцом меняет и таблицу на странице,
// и PDF, который скачивается. Подписи кнопок переключателя берутся из словаря
// самого инструмента (vatOptions: те же слова, что в выпадающем списке формы,
// на kk они уже вычитаны), новых текстов для перевода нет.

export type SampleVat = 'no_vat' | 'vat_16'

export const SAMPLE_VATS: readonly SampleVat[] = ['no_vat', 'vat_16']

/**
 * Какой режим показан сразу (в серверном HTML для поисковика). Совпадает с тем,
 * что было до переключателя: акт по умолчанию без НДС (как в форме), счёт,
 * накладная и КП с НДС 16%.
 */
export const SAMPLE_DEFAULT_VAT: Record<SampleCtaTool, SampleVat> = {
  avr: 'no_vat',
  kp: 'vat_16',
  schet: 'vat_16',
  nakladnaya: 'vat_16',
}
