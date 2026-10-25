// Реестр должников по исполнительным производствам (АИС ОИП, Минюст РК) через
// открытые данные data.egov.kz. Здесь только чистые функции: сборка SOAP-запроса
// и разбор ответа. Сеть, ключ и повторы живут в binExtraChecks.ts.
//
// Откуда это известно (проверено живыми вызовами 25.10.2026):
//  - набор `reestr_dolzh_po_isp_pr`, индекс сервиса `aisoip`. REST-вариант
//    data.egov.kz/proxy/... отдаёт 500, нужен именно SOAP на
//    https://data.egov.kz/egov-opendata-ws/ODWebServiceImpl. Ключ тот же
//    EGOV_API_KEY, передаётся ВНУТРИ XML (<apiKey>), не заголовком.
//  - успех: <status><code>SCSS001</code>. Строки <rows> есть => у БИН есть
//    производства; строк нет (сообщение «Данные не найдены») => по открытым данным
//    Минюста производств нет.
//  - сайт aisoip.adilet.gov.kz/debtors закрыт reCAPTCHA v3, её обходить нельзя;
//    эта проверка идёт только через официальный открытый сервис.
//  - примерно каждый третий вызов nginx data.egov.kz отвечает 403 (HTML, не XML).
//    Это НЕ «чисто», а «не проверили»: в разборе такой ответ даёт null.
//
// Условия data.egov.kz: ключ только на сервере, 40 запросов в минуту на ключ
// (общие с gbd_ul), рядом с результатом обязательна видимая ссылка на источник.
//
// Персональные данные: в ответе ФИО должников-физлиц, судебных исполнителей,
// взыскателей и категории взыскания (у ИП БИН это ИИН человека, категория может
// раскрыть личный долг). Всё это НЕ читается и наружу не отдаётся, только
// агрегаты: число производств, из них действующих, сумма, самая ранняя дата.

export const AISOIP_ENDPOINT = 'https://data.egov.kz/egov-opendata-ws/ODWebServiceImpl'
/** Страница набора данных: ссылка-источник рядом с результатом (условие портала). */
export const AISOIP_DATASET_URL = 'https://data.egov.kz/datasets/view?index=reestr_dolzh_po_isp_pr'
/** Ручная проверка: форма с reCAPTCHA, БИН подставить нельзя. */
export const AISOIP_MANUAL_URL = 'https://aisoip.adilet.gov.kz/debtors'

/** Сводка по реестру должников. Только агрегаты, без имён. */
export interface EnforcementResult {
  /** false = реестр ответил и производств по этому БИН нет. */
  found: boolean
  /** Все строки реестра по этому БИН. */
  count: number
  /** Из них без даты окончания производства. */
  activeCount: number
  /** Сумма взыскания в тенге по всем строкам; 0 = сумма не указана или нулевая. */
  totalAmount: number
  /** Самая ранняя дата начала производства (ГГГГ-ММ-ДД) или null. */
  earliestStart: string | null
}

/**
 * ИИН физлица (в том числе ИП) или БИН юрлица. ИИН начинается с ГГММДД, поэтому его
 * 5-я цифра (десяток дня) от 0 до 3; в БИН на этом месте тип организации (4, 5, 6).
 * Нужно только для пояснения в интерфейсе, на проверку не влияет.
 */
export function isIndividualId(id: string): boolean {
  return /^\d{4}[0-3]\d{7}$/.test(id)
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/**
 * The SOAP envelope from the data.egov.kz instruction for the aisoip index.
 * `bin` must already be 12 digits (the caller validates); it is escaped anyway.
 */
export function buildAisoipRequest(bin: string, apiKey: string, messageId: string, now: Date = new Date()): string {
  const date = now.toISOString().replace('Z', '+00:00')
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:soap="http://soap.opendata.egov.nitec.kz/">' +
    '<soapenv:Header/><soapenv:Body><soap:request><request><requestInfo>' +
    `<messageId>${xmlEscape(messageId)}</messageId><messageDate>${date}</messageDate>` +
    `<indexName>aisoip</indexName><apiKey>${xmlEscape(apiKey)}</apiKey></requestInfo>` +
    '<requestData><data xmlns:ns2pep="http://bip.bee.kz/SyncChannel/v10/Types/Request" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns2pep:RequestMessage">' +
    `<iinOrBin>${xmlEscape(bin)}</iinOrBin></data></requestData></request></soap:request></soapenv:Body></soapenv:Envelope>`
  )
}

/** Text of the first <tag>text</tag>, ignoring self-closing xsi:nil elements. */
function tagText(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*[^/>])?>([^<]*)</${tag}>`).exec(xml)
  const v = m ? m[1].trim() : ''
  return v ? v : null
}

const datePart = (v: string | null): string | null => {
  const m = v ? v.match(/^\d{4}-\d{2}-\d{2}/) : null
  return m ? m[0] : null
}

/**
 * Reads a SOAP answer. Returns null whenever the answer cannot be trusted as
 * a statement about this БИН: not XML (nginx 403 page), a code other than
 * SCSS001, or rows that belong to someone else. null must reach the screen as
 * "could not check", never as "no proceedings".
 */
export function parseAisoipResponse(xml: unknown, bin: string): EnforcementResult | null {
  if (typeof xml !== 'string' || !xml.includes('<code>')) return null
  const code = tagText(xml.slice(xml.indexOf('<responseInfo>') >= 0 ? xml.indexOf('<responseInfo>') : 0), 'code')
  if (code !== 'SCSS001') return null

  const rowBlocks: string[] = []
  const re = /<rows>([\s\S]*?)<\/rows>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) rowBlocks.push(m[1])

  if (rowBlocks.length === 0) {
    // "Данные не найдены": the register answered and holds nothing for this БИН.
    return { found: false, count: 0, activeCount: 0, totalAmount: 0, earliestStart: null }
  }

  // Rows for another БИН would be a service fault, not a finding about this
  // company; a row that names no debtor at all is kept (the query was ours).
  const mine = rowBlocks.filter(r => {
    const id = tagText(r, 'debtorBin') ?? tagText(r, 'debtorIin')
    return id === null || id === bin
  })
  if (mine.length === 0) return null

  let totalAmount = 0
  let activeCount = 0
  let earliest: string | null = null
  for (const r of mine) {
    const amount = Number(tagText(r, 'recoveryAmount'))
    if (Number.isFinite(amount) && amount > 0) totalAmount += amount
    if (!datePart(tagText(r, 'ipEndDate'))) activeCount += 1
    const start = datePart(tagText(r, 'ipStartDate'))
    if (start && (!earliest || start < earliest)) earliest = start
  }
  return {
    found: true,
    count: mine.length,
    activeCount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    earliestStart: earliest,
  }
}
