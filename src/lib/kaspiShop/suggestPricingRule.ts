import Anthropic from '@anthropic-ai/sdk'

// Разбор ответа и проверки покрыты тестами (suggestPricingRule.test.ts); сам вызов
// платного API живьём не гоняем, как и остальной код с Anthropic в этом репозитории.
export type PricingSuggestion = {
  floorPrice: number
  undercutStep: number
  reasoning: string
}

// Не хватает исходных данных: не вызываем модель вовсе (HTTP 400 в маршруте).
export class SuggestionInputError extends Error {
  readonly kind = 'input'
}

// Модель ответила, но ответ нельзя показывать продавцу (не разобрать или ниже
// себестоимости). Маршрут отдаёт 502 с этим текстом.
export class SuggestionRejectedError extends Error {
  readonly kind = 'rejected'
}

// Число из ответа модели. Раньше /FLOOR:\s*(\d+)/ превращал «12 500» в 1, а
// «12,5» в 12. Понимаем пробелы (в том числе неразрывные) как разделитель тысяч,
// запятую и точку и как десятичную, и как тысячную: «12.500» с ровно тремя цифрами
// после единственного разделителя - это тысячи. Результат в целых тенге.
export function parseSuggestionNumber(raw: string): number | null {
  let s = raw.replace(/[\s   ]/g, '').replace(/[.,]+$/, '')
  if (!/^\d[\d.,]*$/.test(s)) return null

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    // последний из разделителей - десятичный, остальные - тысячные
    const decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    const thousandSep = decimalSep === '.' ? ',' : '.'
    s = s.split(thousandSep).join('').replace(decimalSep, '.')
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ','
    const parts = s.split(sep)
    if (parts.length > 2) {
      s = parts.join('')
    } else if (parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0') {
      s = parts.join('')
    } else {
      s = `${parts[0]}.${parts[1]}`
    }
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

const NUM = '(\\d[\\d \\u00a0\\u202f.,]*)'

export function parseSuggestionText(text: string): PricingSuggestion {
  const floorMatch = text.match(new RegExp(`FLOOR:\\s*${NUM}`, 'i'))
  const stepMatch = text.match(new RegExp(`STEP:\\s*${NUM}`, 'i'))
  const reasoningMatch = text.match(/REASONING:\s*(.+)/i)
  const floor = floorMatch ? parseSuggestionNumber(floorMatch[1]) : null
  const step = stepMatch ? parseSuggestionNumber(stepMatch[1]) : null
  if (floor === null || step === null) {
    throw new SuggestionRejectedError('ИИ вернул ответ в непонятном виде. Попробуйте ещё раз.')
  }
  return {
    floorPrice: floor,
    undercutStep: step,
    reasoning: reasoningMatch ? reasoningMatch[1].trim().slice(0, 500) : '',
  }
}

// Подбор нельзя показывать, если он ниже себестоимости: продавец сохранил бы
// минимум, при котором бот торгует в убыток.
export function validateSuggestion(s: PricingSuggestion, ownCost: number): PricingSuggestion {
  if (!Number.isFinite(s.floorPrice) || s.floorPrice <= 0) {
    throw new SuggestionRejectedError('ИИ предложил некорректную минимальную цену. Попробуйте ещё раз.')
  }
  if (!Number.isFinite(s.undercutStep) || s.undercutStep < 1) {
    throw new SuggestionRejectedError('ИИ предложил некорректный шаг. Попробуйте ещё раз.')
  }
  if (s.floorPrice < ownCost) {
    throw new SuggestionRejectedError(
      `ИИ предложил минимальную цену ${s.floorPrice.toLocaleString('ru-KZ')} ₸, это ниже себестоимости ${ownCost.toLocaleString('ru-KZ')} ₸. Попробуйте ещё раз или задайте минимум вручную.`,
    )
  }
  return s
}

// One Anthropic call proposes a starting floor price and undercut step for a
// product, given its category, the competitor prices already seen and the
// seller's own cost. The seller reviews/overrides before saving -- this is an
// estimate, not an autonomous pricing decision.
export async function suggestPricingRule({
  productTitle,
  category,
  competitorPrices,
  ownCost,
}: {
  productTitle: string
  category: string
  competitorPrices: number[]
  ownCost?: number
}): Promise<PricingSuggestion> {
  // Без себестоимости и цен конкурентов модель выдумывает минимум по названию
  // товара (аудит Kaspi 2026-11-06, K13), поэтому без них не зовём её вовсе.
  if (typeof ownCost !== 'number' || !Number.isFinite(ownCost) || ownCost <= 0) {
    throw new SuggestionInputError('Укажите себестоимость товара в разделе «Прибыль»: без неё подбор не может проверить, что цена не ниже затрат.')
  }
  const prices = competitorPrices.filter(n => Number.isFinite(n) && n > 0)
  if (prices.length === 0) {
    throw new SuggestionInputError('Пока нет цен конкурентов: дождитесь первой проверки цен по этому товару.')
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })
  const title = productTitle.replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Товар: "${title}" (категория: ${category}). Цены конкурентов на Kaspi.kz: ${prices.join(', ')} тенге. Себестоимость продавца: ${ownCost} тенге.

Предложи минимальную цену (floorPrice, ниже которой продавец никогда не опустится) и шаг демпинга (undercutStep, на сколько тенге снижать цену ниже конкурента). floorPrice обязан быть не ниже себестоимости и оставлять разумную маржу (не менее 10-15%). Числа пиши без пробелов и разделителей. Ответь СТРОГО в формате:
FLOOR: <число>
STEP: <число>
REASONING: <одно предложение на русском>`,
    }],
  })

  const block = message.content[0]
  const text = block.type === 'text' ? block.text : ''
  return validateSuggestion(parseSuggestionText(text), ownCost)
}
