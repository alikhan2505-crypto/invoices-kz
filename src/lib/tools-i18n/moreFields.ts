import type { ToolLang } from './index'

// Блок «Дополнительно» в формах бесплатных документов /tools (29.10.2026):
// второстепенные поля (адрес, руководитель, email, номер и дата документа...)
// свёрнуты, чтобы до кнопки «Сформировать» было меньше экранов. Чистая логика
// раскрытия - здесь, разметка - в ToolMoreFields.tsx.

/** null - человек блок не трогал; true/false - раскрыт/свёрнут им или автоматически. */
export type MoreState = boolean | null

/**
 * Автораскрытие липкое: если в блоке появилось значение (черновик, запомненные
 * реквизиты, подстановка), блок раскрывается и дальше остаётся раскрытым, даже
 * если человек стёр это значение, - иначе поле схлопнулось бы под руками.
 */
export function nextMoreState(cur: MoreState, forceOpen: boolean): MoreState {
  return forceOpen && cur === null ? true : cur
}

/** Ошибка валидации внутри блока раскрывает его всегда. */
export function moreExpanded(cur: MoreState, hasError: boolean): boolean {
  return hasError || cur === true
}

/** Нужно ли блоку раскрыться само: в нём есть непустое значение. */
export function hasAnyValue(values: Array<string | null | undefined>): boolean {
  return values.some(v => (v ?? '').toString().trim() !== '')
}

const UPPER = /^[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ]{2}/

/** Подпись поля -> фрагмент подсказки: без «*» и скобок, со строчной буквы (кроме аббревиатур, как КБе). */
export function hintPart(label: string): string {
  const s = label.replace(/\([^)]*\)/g, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
  if (!s || UPPER.test(s)) return s
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** «Руководитель, адрес, email» из подписей полей блока (уже переведённых словарём инструмента). */
export function moreHint(labels: string[], lead?: string): string {
  const parts = labels.map(hintPart).filter(Boolean)
  const joined = parts.join(', ')
  const text = [lead, joined].filter(Boolean).join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export interface FormCopy {
  more: string
  requisitesSaved: string
  requisitesClear: string
}

// Общие подписи форм четырёх инструментов; подсказки внутри блоков собираются
// из подписей самих полей (moreHint), поэтому новых строк на каждое поле нет.
export const FORM_TEXT: Record<ToolLang, FormCopy> = {
  ru: {
    more: 'Дополнительно',
    requisitesSaved: 'Ваши реквизиты запомнены только в этом браузере.',
    requisitesClear: 'Очистить сохранённые реквизиты',
  },
  kk: {
    more: 'Қосымша',
    requisitesSaved: 'Реквизиттеріңіз тек осы браузерде сақталды.',
    requisitesClear: 'Сақталған реквизиттерді тазалау',
  },
  en: {
    more: 'More details',
    requisitesSaved: 'Your details are remembered in this browser only.',
    requisitesClear: 'Clear saved details',
  },
}
