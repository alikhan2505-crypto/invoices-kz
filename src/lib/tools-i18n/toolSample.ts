// Общие типы и чистые помощники блока «Образец» под формой бесплатных
// инструментов /tools (src/components/tools/ToolSample.tsx). Файл без React и
// без 'use client': его читают и серверный компонент, и тесты.
//
// Образец — это текст в HTML (таблицы, не картинка), чтобы поисковик и
// ИИ-краулеры видели реальный документ. Данные в образце всегда вымышленные
// (БИН из нулей, «Банк Образец») — реальных реквизитов тут быть не должно.
// Сам бланк на всех языках русский (так его печатает генератор), поэтому
// содержимое документа (SampleDoc) одно на все языки, а переводятся только
// обёртка и пояснения (SampleCopy).

/** Одна пара «подпись — значение» в шапке документа (банковский блок). */
export interface SampleField {
  label: string
  value: string
  /** По центру ячейки — как ИИК/КБе в печатной форме. */
  center?: boolean
}

/** Строка таблицы позиций: ячейки уже отформатированы. */
export interface SampleRow {
  cells: string[]
}

/** Строка итогов: «Итого:», «В том числе НДС 16%:» и т. п. */
export interface SampleTotalLine {
  label: string
  value: string
}

/** Содержимое документа-образца (язык бланка — русский на всех страницах). */
export interface SampleDoc {
  /** Подпись над банковским блоком, например «Образец платежного поручения». */
  bankCaption: string
  /** Банковский блок: ряды по 3 ячейки. */
  bankRows: SampleField[][]
  /** Заголовок документа: «Счет на оплату №1 от 15.01.2026». */
  title: string
  /** Стороны: Поставщик / Покупатель. */
  parties: { label: string; value: string }[]
  /** Заголовки столбцов таблицы позиций. */
  columns: string[]
  /** Индексы столбцов, выровненных по правому краю (цена, сумма). */
  rightAlignedColumns: number[]
  /** Индекс столбца с наименованием — выравнивается влево. */
  nameColumn: number
  rows: SampleRow[]
  totals: SampleTotalLine[]
  /** «Всего наименований 2, на сумму … KZT» / «Всего к оплате: …». */
  summaryLines: string[]
  /** Подпись «Руководитель» и расшифровка подписи. */
  signatureLabel: string
  signatureName: string
}

/** Тексты вокруг образца на языке страницы. */
export interface SampleCopy {
  /** h2 над блоком. */
  heading: string
  /** Метка-«лента» на карточке: Пример / Мысал / Example. */
  ribbon: string
  /** Короткий абзац: что показано и что данные вымышленные. */
  intro: string
  /** Заголовок списка «что должно быть в документе». */
  pointsTitle: string
  /** 3–4 пункта о содержании документа. */
  points: string[]
  /** Подпись под карточкой (в т. ч. что бланк русский, а данные вымышленные). */
  caption: string
  /** Подпись для скринридера у прокручиваемой области с таблицей. */
  scrollLabel: string
}

/** Деньги в образце — так же, как печатает generateInvoicePDF: «149 400,00». */
export function formatSampleMoney(n: number): string {
  return n.toLocaleString('ru-KZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('.', ',')
}
