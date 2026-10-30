// Строки результата проверки физлица: чистая функция без сети и React, чтобы
// вердикты проверялись тестами. Формулировки реестров берутся из словаря
// /tools/kontragent (kontragentDict.ru): одно и то же сказано везде одинаково.
// Только русский: вкладка закрыта админ-гейтом (config.ts), переводы на қаз и en
// появятся вместе с открытием.

import { kontragentDict } from '@/app/tools/kontragent/dict'
import { AISOIP_DATASET_URL, AISOIP_MANUAL_URL } from '@/lib/aisoip'
import { taxRegimesText, unreliableCategoriesText } from '@/lib/binRiskText'
import { formatIsoDate, formatTenge } from '@/lib/tools-i18n'
import type { PersonCheckResult, PublicEntrepreneur } from './run'

const t = kontragentDict.ru

export type PersonTone = 'ok' | 'bad' | 'info' | 'unknown' | 'manual'

export interface PersonRow {
  id: string
  tone: PersonTone
  label: string
  text: string
  details: string[]
  link?: { href: string; label: string }
}

export interface PersonGroup {
  id: 'debts' | 'entrepreneur' | 'manual'
  title: string
  rows: PersonRow[]
}

export interface PersonCounts { bad: number; ok: number; info: number; other: number }

export const personText = {
  groups: { debts: 'Долги и ограничения', entrepreneur: 'Предпринимательство', manual: 'Проверьте вручную' },
  entrepreneur: {
    label: 'Статус ИП',
    none: 'По открытым данным КГД ИП по этому ИИН не найдено',
    noneDetail: 'Ответ сервиса КГД «Поиск налогоплательщика», это не справка об отсутствии ИП',
    unknown: 'Не удалось проверить, есть ли у человека ИП. Это не значит, что его нет',
    found: (name: string, since: string | null) => `${name}${since ? `, зарегистрирован с ${since}` : ''}`,
    kgdNote: 'Данные КГД: для ИП государство публикует только наименование и дату регистрации',
  },
  court: {
    label: 'Судебные дела',
    text: 'Открытого поиска по ИИН нет. Смотрите в судебном кабинете.',
    link: 'Судебный кабинет',
    href: 'https://office.sud.kz',
  },
  wanted: {
    label: 'Розыск',
    text: 'Списки розыска ведёт МВД, по ИИН они открыто не проверяются.',
    detail: 'Если есть сомнения, обратитесь в МВД или попросите справку у самого человека.',
  },
  conviction: {
    title: 'Судимость не проверяется',
    text: 'По ИИН судимость открыто не проверить: сведения закрытые, мы их не получаем и не продаём. Законный путь: попросить справку у самого человека или запросить её на egov.kz через услугу «Получение электронной справки третьим лицом». Человек подтверждает запрос по SMS или в личном кабинете.',
    link: 'Услуга на gov.kz',
    href: 'https://www.gov.kz/services/3934',
  },
  legal: 'Проверяйте человека, только если есть основание: договор, сделка, наём. Мы показываем записи из открытых реестров. Это справка, а не вердикт о человеке.',
} as const

function enforcementRow(r: PersonCheckResult): PersonRow {
  const e = r.enforcement
  const label = t.enforcement.label
  if (!e) {
    return {
      id: 'enforcement', tone: 'unknown', label, text: t.enforcement.unknown, details: [],
      link: { href: AISOIP_MANUAL_URL, label: t.enforcement.manualLink },
    }
  }
  const amount = e.totalAmount > 0 ? formatTenge(e.totalAmount) : null
  return {
    id: 'enforcement',
    tone: e.found ? 'bad' : 'ok',
    label,
    text: e.found ? t.enforcement.bad(String(e.count), String(e.activeCount), amount, formatIsoDate(e.earliestStart)) : t.enforcement.ok,
    details: [t.enforcement.asOfNote],
    link: { href: AISOIP_DATASET_URL, label: `${t.enforcement.sourcePrefix}${t.enforcement.sourceLink}` },
  }
}

/** Та же логика «банкротство», что в KontragentTool: без категории или без ответа это не «чисто». */
function bankruptOk(e: PublicEntrepreneur): boolean | null {
  const cats = e.unreliableCategories
  if (e.isUnreliable === null || cats === null) return null
  if (cats.includes('bankrupt')) return false
  if (e.isUnreliable === true && cats.length === 0) return null
  return true
}

function entrepreneurRows(r: PersonCheckResult): PersonRow[] {
  const p = personText.entrepreneur
  const s = r.entrepreneur
  if (s.state === 'unknown') {
    return [{ id: 'ip', tone: 'unknown', label: p.label, text: p.unknown, details: [] }]
  }
  if (s.state === 'none') {
    return [{ id: 'ip', tone: 'info', label: p.label, text: p.none, details: [p.noneDetail] }]
  }
  const e = s.entrepreneur
  const rows: PersonRow[] = []
  rows.push({ id: 'ip', tone: 'info', label: p.label, text: p.found(e.name, formatIsoDate(e.registeredAt)), details: [p.kgdNote] })

  const reasons = e.isUnreliable === true && e.unreliableCategories ? unreliableCategoriesText(e.unreliableCategories, 'ru') : ''
  rows.push({
    id: 'unreliable',
    tone: e.isUnreliable === null ? 'unknown' : e.isUnreliable ? 'bad' : 'ok',
    label: t.unreliable.label,
    text: e.isUnreliable === null ? t.unknown : e.isUnreliable ? t.unreliable.bad : t.unreliable.ok,
    details: reasons ? [t.unreliable.reasons(reasons)] : [],
  })

  const bo = bankruptOk(e)
  rows.push({
    id: 'bankruptcy',
    tone: bo === null ? 'unknown' : bo ? 'ok' : 'bad',
    label: t.bankruptcy.label,
    text: bo === null ? t.bankruptcy.unknown : bo ? t.bankruptcy.ok : t.bankruptcy.bad,
    details: [],
  })

  const hasDebt = e.totalArrear !== null && e.totalArrear > 0
  const taxPart = hasDebt && e.taxArrear !== null && e.taxArrear !== e.totalArrear ? formatTenge(e.taxArrear) : null
  rows.push({
    id: 'arrear',
    tone: e.totalArrear === null ? 'unknown' : hasDebt ? 'bad' : 'ok',
    label: t.arrear.label,
    text: e.totalArrear === null ? t.arrear.unknown : hasDebt ? t.arrear.bad(formatTenge(e.totalArrear as number), taxPart) : t.arrear.ok,
    details: [],
  })

  const regimeText = e.taxRegimes ? taxRegimesText(e.taxRegimes, 'ru', formatIsoDate, { since: t.regime.since, until: t.regime.until }) : ''
  rows.push({
    id: 'regime',
    tone: e.taxRegimes ? 'info' : 'unknown',
    label: t.regime.label,
    text: e.taxRegimes ? regimeText : t.regime.unknown,
    details: e.taxRegimes && e.taxRegimes.some(x => !x.beginDate) ? [t.regime.datesNote] : [],
  })

  // undefined = проверка реабилитации не включена (таблицы нет): строки нет.
  if (e.rehabilitation !== undefined) {
    const rb = e.rehabilitation
    rows.push({
      id: 'rehabilitation',
      tone: rb === null ? 'unknown' : rb.state === 'listed' ? 'bad' : rb.state === 'terminated' ? 'info' : 'ok',
      label: t.rehabilitation.label,
      text: rb === null ? t.rehabilitation.unknown
        : rb.state === 'listed' ? t.rehabilitation.bad(formatIsoDate(rb.since ?? null))
        : rb.state === 'terminated' ? t.rehabilitation.terminated
        : t.rehabilitation.ok,
      details: rb ? [t.rehabilitation.note] : [],
    })
  }
  return rows
}

export function buildPersonGroups(r: PersonCheckResult): PersonGroup[] {
  return [
    { id: 'debts', title: personText.groups.debts, rows: [enforcementRow(r)] },
    { id: 'entrepreneur', title: personText.groups.entrepreneur, rows: entrepreneurRows(r) },
    {
      id: 'manual',
      title: personText.groups.manual,
      rows: [
        { id: 'court', tone: 'manual', label: personText.court.label, text: personText.court.text, details: [], link: { href: personText.court.href, label: personText.court.link } },
        { id: 'wanted', tone: 'manual', label: personText.wanted.label, text: personText.wanted.text, details: [personText.wanted.detail] },
      ],
    },
  ]
}

export function countPersonRows(groups: PersonGroup[]): PersonCounts {
  const c: PersonCounts = { bad: 0, ok: 0, info: 0, other: 0 }
  for (const g of groups) for (const row of g.rows) {
    if (row.tone === 'bad') c.bad += 1
    else if (row.tone === 'ok') c.ok += 1
    else if (row.tone === 'info') c.info += 1
    else c.other += 1
  }
  return c
}
