import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NO_STORE, storePinFor, loadAgentCatalog, loadAgentDeliveryInfo, loadAgentShopLinks } from './catalogContext'
import { checkCatalogPricing } from './invoiceDrafts'
import { pickProductPhoto } from './productPhoto'

// Клиент, который падает на любом обращении: отказ от магазина обязан не
// делать запросов вовсе (пустой результат, а не запрос с последующим пустым).
const explodingClient = {
  from() {
    throw new Error('opted-out agent must not query any Kaspi table')
  },
} as unknown as SupabaseClient

describe('storePinFor', () => {
  it('opted-out agent -> NO_STORE, even if it still carries a pin', () => {
    expect(storePinFor({ kaspi_catalog_off: true, kaspi_shop_connection_id: 'shop-1' })).toBe(NO_STORE)
    expect(storePinFor({ kaspi_catalog_off: true })).toBe(NO_STORE)
  })

  it('pinned agent -> the connection id', () => {
    expect(storePinFor({ kaspi_catalog_off: false, kaspi_shop_connection_id: 'shop-1' })).toBe('shop-1')
  })

  it('unpinned agent -> null (follow the active store)', () => {
    expect(storePinFor({ kaspi_shop_connection_id: null })).toBeNull()
    expect(storePinFor({})).toBeNull()
    expect(storePinFor(null)).toBeNull()
    expect(storePinFor(undefined)).toBeNull()
  })

  it('column missing (migration not applied) reads as not opted out', () => {
    // строка select('*') до миграции: ключа kaspi_catalog_off нет вовсе
    expect(storePinFor({ kaspi_shop_connection_id: 'shop-1' })).toBe('shop-1')
    expect(storePinFor({ kaspi_catalog_off: null, kaspi_shop_connection_id: null })).toBeNull()
  })
})

describe('loaders with NO_STORE', () => {
  it('return empty without touching the database', async () => {
    expect(await loadAgentCatalog(explodingClient, 'u1', NO_STORE)).toEqual([])
    expect(await loadAgentDeliveryInfo(explodingClient, 'u1', NO_STORE)).toBeNull()
    expect(await loadAgentShopLinks(explodingClient, 'u1', NO_STORE)).toEqual({ kaspiShopUrl: null, storefrontUrl: null })
  })

  it('an empty catalog degrades the invoice and photo paths gracefully', () => {
    expect(checkCatalogPricing([{ name: 'Что угодно', quantity: 1, unitPrice: 1 } as any], [])).toEqual({ ok: true })
    expect(pickProductPhoto('Букет роз — 15 000 ₸', [])).toBeNull()
  })
})
