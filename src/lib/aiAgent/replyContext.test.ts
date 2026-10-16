import { describe, it, expect } from 'vitest'
import { composeReplyContextLine, pickPreviewChannel } from './replyContext'
import { buildBusinessContextLine, buildCatalogBlock, buildDeliveryBlock, buildShopLinksBlock } from './promptContext'

const agent = {
  user_id: 'u1',
  name: 'Цветы Алматы',
  tone: 'friendly',
  business_description: 'Доставка букетов по Алматы',
  goal: 'answer_questions',
  collect_fields: ['name', 'phone'],
  timezone: 'Asia/Almaty',
  currency: 'KZT',
  custom_instructions: 'Не обещай доставку за час.',
}
const data = {
  catalog: [{ name: 'Букет роз', price: 15000 }],
  deliveryInfo: 'Доставка по городу 1500 ₸',
  shopLinks: { kaspiShopUrl: 'https://kaspi.kz/shop/info/merchant/1', storefrontUrl: null },
  salonInfo: null,
}

describe('composeReplyContextLine', () => {
  it('is exactly what the live channels used to build inline (business line + catalog + delivery + shop links)', () => {
    const expected = buildBusinessContextLine({
      name: agent.name,
      tone: 'friendly',
      description: agent.business_description,
      goal: 'answer_questions',
      collectFields: agent.collect_fields,
      timezone: agent.timezone,
      currency: agent.currency,
      customInstructions: agent.custom_instructions,
      channel: 'whatsapp',
    }) + buildCatalogBlock(data.catalog) + buildDeliveryBlock(data.deliveryInfo) + buildShopLinksBlock(data.shopLinks)
    expect(composeReplyContextLine(agent, 'whatsapp', data)).toBe(expected)
  })

  it('carries the catalog and delivery into the prompt (the test chat used to drop them)', () => {
    const line = composeReplyContextLine(agent, 'whatsapp', data)
    expect(line).toContain('Букет роз')
    expect(line).toContain('Доставка по городу 1500 ₸')
    expect(line).toContain('WhatsApp')
  })

  it('without a channel keeps the Instagram wording byte-for-byte', () => {
    const noChannel = composeReplyContextLine(agent, undefined, data)
    expect(noChannel).toBe(composeReplyContextLine(agent, 'instagram', data))
    expect(noChannel).toContain('Instagram')
  })

  it('tolerates a null description', () => {
    expect(() => composeReplyContextLine({ ...agent, business_description: null }, 'telegram', data)).not.toThrow()
  })
})

describe('pickPreviewChannel', () => {
  it('prefers WhatsApp, then Instagram, Telegram, website, API', () => {
    expect(pickPreviewChannel(['telegram', 'whatsapp'])).toBe('whatsapp')
    expect(pickPreviewChannel(['website', 'instagram'])).toBe('instagram')
    expect(pickPreviewChannel(['api', 'telegram'])).toBe('telegram')
    expect(pickPreviewChannel(['api'])).toBe('api')
  })

  it('falls back to undefined (Instagram wording) with no channel connected', () => {
    expect(pickPreviewChannel([])).toBeUndefined()
  })
})
