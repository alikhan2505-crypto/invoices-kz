import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { composeReplyContextLine, pickPreviewChannel, buildAgentReplyContext } from './replyContext'
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

// Минимальный клиент Supabase: цепочка запросов к Kaspi-таблицам отдаёт
// фиксированные строки; считает, сколько раз его спросили.
function fakeShopClient() {
  const calls: string[] = []
  const rows: Record<string, any> = {
    kaspi_shop_connections: { id: 'shop-1', storefront_delivery_info: 'Доставка 1500 ₸', merchant_id: '77', storefront_slug: null, storefront_published: false },
    kaspi_shop_tracked_products: [{ product_name: 'Букет роз', own_current_price: 15000, image_url: null }],
    kaspi_shop_custom_products: [],
  }
  const client = {
    from(table: string) {
      calls.push(table)
      const result = rows[table]
      const chain: any = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: result }),
        then: (res: any) => res({ data: result }),
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('buildAgentReplyContext with kaspi_catalog_off', () => {
  it('opted-out agent gets no catalog, delivery or shop links and no queries are made', async () => {
    const { client, calls } = fakeShopClient()
    const ctx = await buildAgentReplyContext(client, { ...agent, kaspi_catalog_off: true, kaspi_shop_connection_id: 'shop-1' }, { channel: 'whatsapp', withSalon: false })
    expect(calls).toEqual([])
    expect(ctx.catalog).toEqual([])
    expect(ctx.deliveryInfo).toBeNull()
    expect(ctx.shopLinks).toEqual({ kaspiShopUrl: null, storefrontUrl: null })
    expect(ctx.businessContextLine).not.toContain('Букет роз')
    expect(ctx.businessContextLine).not.toContain('kaspi.kz/shop')
    expect(ctx.businessContextLine).not.toContain('Доставка 1500')
    expect(ctx.businessContextLine).not.toContain('Ориентировочные цены доставки')
  })

  it('opted-out agent gets no generic courier price guide, but an agent without a store still does', async () => {
    const empty = { catalog: [], deliveryInfo: null, shopLinks: { kaspiShopUrl: null, storefrontUrl: null }, salonInfo: null }
    expect(composeReplyContextLine({ ...agent, kaspi_catalog_off: true }, 'whatsapp', empty)).not.toContain('Ориентировочные цены доставки')
    expect(composeReplyContextLine(agent, 'whatsapp', empty)).toContain('Ориентировочные цены доставки')
    expect(composeReplyContextLine({ ...agent, kaspi_catalog_off: false }, 'whatsapp', empty)).toContain('Ориентировочные цены доставки')
  })

  it('same agent without the flag (or before the migration) still quotes the store', async () => {
    for (const flag of [false, undefined, null]) {
      const { client } = fakeShopClient()
      const a: any = { ...agent, kaspi_shop_connection_id: 'shop-1' }
      if (flag !== undefined) a.kaspi_catalog_off = flag
      const ctx = await buildAgentReplyContext(client, a, { channel: 'whatsapp', withSalon: false })
      expect(ctx.catalog.map(p => p.name)).toContain('Букет роз')
      expect(ctx.deliveryInfo).toBe('Доставка 1500 ₸')
      expect(ctx.businessContextLine).toContain('Букет роз')
    }
  })
})
