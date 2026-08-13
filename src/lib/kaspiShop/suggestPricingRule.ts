import Anthropic from '@anthropic-ai/sdk'

// No test file: live network call to a paid API, matching this codebase's
// existing convention (e.g. generateAiReply in instagramAiReply.ts).
export type PricingSuggestion = {
  floorPrice: number
  undercutStep: number
  reasoning: string
}

// One Anthropic call proposes a starting floor price and undercut step for
// a newly-imported product, given its category and the competitor prices
// already seen. The seller reviews/overrides before enabling tracking --
// this is a starting point, not an autonomous pricing decision.
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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Товар: "${productTitle}" (категория: ${category}). Цены конкурентов на Kaspi.kz: ${competitorPrices.join(', ')} тенге.${ownCost ? ` Себестоимость продавца: ${ownCost} тенге.` : ''}

Предложи минимальную цену (floorPrice, ниже которой продавец никогда не опустится) и шаг демпинга (undercutStep, на сколько тенге снижать цену ниже конкурента). Если известна себестоимость, floorPrice должен оставлять разумную маржу (не менее 10-15%). Ответь СТРОГО в формате:
FLOOR: <число>
STEP: <число>
REASONING: <одно предложение на русском>`,
    }],
  })

  const block = message.content[0]
  const text = block.type === 'text' ? block.text : ''
  const floorMatch = text.match(/FLOOR:\s*(\d+)/)
  const stepMatch = text.match(/STEP:\s*(\d+)/)
  const reasoningMatch = text.match(/REASONING:\s*(.+)/)

  if (!floorMatch || !stepMatch) {
    throw new Error(`suggestPricingRule: could not parse Anthropic response: ${text}`)
  }

  return {
    floorPrice: Number(floorMatch[1]),
    undercutStep: Number(stepMatch[1]),
    reasoning: reasoningMatch ? reasoningMatch[1].trim() : '',
  }
}
