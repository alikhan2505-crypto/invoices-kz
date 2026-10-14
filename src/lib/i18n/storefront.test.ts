import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { storefrontDict, ruItemsWord, storefrontApiError, storefrontApiErrorKey, formatStorefrontPrice } from './storefront'

describe('storefront dictionary', () => {
  it('has the same non-empty keys in ru, kk and en', () => {
    const keys = (o: object) => Object.keys(o).sort()
    expect(keys(storefrontDict.kk)).toEqual(keys(storefrontDict.ru))
    expect(keys(storefrontDict.en)).toEqual(keys(storefrontDict.ru))
    expect(keys(storefrontDict.kk.errors)).toEqual(keys(storefrontDict.ru.errors))
    expect(keys(storefrontDict.en.errors)).toEqual(keys(storefrontDict.ru.errors))
    for (const lang of ['ru', 'kk', 'en'] as const) {
      for (const [k, v] of Object.entries(storefrontDict[lang])) {
        if (typeof v === 'string') expect(v.trim(), `${lang}.${k}`).not.toBe('')
      }
    }
  })

  it('Kazakh strings say БСН, not БИН', () => {
    expect(storefrontDict.kk.binPlaceholder).toContain('БСН')
    expect(JSON.stringify(storefrontDict.kk)).not.toContain('БИН')
  })

  it('declines «товар» in Russian', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(ruItemsWord)).toEqual([
      'товар', 'товара', 'товара', 'товаров', 'товаров', 'товаров', 'товаров', 'товар', 'товара', 'товаров', 'товар', 'товаров',
    ])
    expect(storefrontDict.ru.cartBar(5)).toBe('Корзина: 5 товаров')
    expect(storefrontDict.en.cartBar(1)).toBe('Cart: 1 item')
    expect(storefrontDict.en.cartBar(3)).toBe('Cart: 3 items')
  })

  it('formats money the same in every language', () => {
    expect(formatStorefrontPrice(12500).replace(/\s/g, ' ')).toBe('12 500 ₸')
  })

  it('maps API errors to the buyer language, with a fallback', () => {
    expect(storefrontApiError('Корзина пуста', storefrontDict.kk, 'orderFailed')).toBe('Себет бос')
    expect(storefrontApiError('not_found', storefrontDict.en, 'orderFailed')).toBe(storefrontDict.en.errors.storeClosed)
    expect(storefrontApiError('something new', storefrontDict.kk, 'requestFailed')).toBe(storefrontDict.kk.errors.requestFailed)
    expect(storefrontApiError(undefined, storefrontDict.en, 'orderFailed')).toBe(storefrontDict.en.errors.orderFailed)
    // Keys, not texts, are stored — so a language switch re-translates the message.
    expect(storefrontApiErrorKey('БИН должен состоять из 12 цифр', 'requestFailed')).toBe('binInvalid')
    // Object.prototype names never leak through as a non-string "message".
    expect(storefrontApiErrorKey('toString', 'orderFailed')).toBe('orderFailed')
    expect(storefrontApiErrorKey('__proto__', 'orderFailed')).toBe('orderFailed')
  })

  // The buyer-facing shop API answers in Russian; if someone adds or rewords
  // an error there, this fails until the storefront dictionary maps it too.
  it('maps every error text the public shop API can return', () => {
    const root = join(__dirname, '..', '..', 'app', 'api', 'shop')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.ts')) files.push(p)
      }
    }
    walk(root)
    const texts = new Set<string>()
    for (const f of files) {
      for (const m of readFileSync(f, 'utf-8').matchAll(/NextResponse\.json\(\{\s*error:\s*'([^']+)'/g)) texts.add(m[1])
    }
    // order-status's 'orderId required' is a programming error, never shown.
    texts.delete('orderId required')
    expect(texts.size).toBeGreaterThan(5)
    const sentinel = 'zz-unmapped'
    const t = { ...storefrontDict.en, errors: { ...storefrontDict.en.errors, orderFailed: sentinel, requestFailed: sentinel } }
    for (const text of texts) {
      // 'Не удалось оформить …' legitimately map onto the fallbacks themselves.
      if (text === 'Не удалось оформить заказ' || text === 'Не удалось оформить заявку') continue
      expect(storefrontApiError(text, t, 'orderFailed'), text).not.toBe(sentinel)
    }
  })
})
