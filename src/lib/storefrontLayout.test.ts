import { describe, it, expect } from 'vitest'
import { placeholderInitial, STOREFRONT_WRAP, STOREFRONT_GRID, STOREFRONT_BAR_INNER, STOREFRONT_BAR_WIDGET_PAD } from './storefrontLayout'

describe('storefront layout', () => {
  it('takes the initial of the product name for the photo placeholder', () => {
    expect(placeholderInitial('Футболка оверсайз')).toBe('Ф')
    expect(placeholderInitial('abil.sisters F01kor')).toBe('A')
    expect(placeholderInitial('  «Қызыл» көйлек')).toBe('Қ')
    expect(placeholderInitial('3D брелок')).toBe('3')
    expect(placeholderInitial('')).toBe('•')
    expect(placeholderInitial('---')).toBe('•')
  })

  it('keeps one ceiling and a single desktop grid', () => {
    // Потолок как у PageContainer wide: 1800 px от 2000 px, ниже без потолка.
    expect(STOREFRONT_WRAP).toContain('min-[2000px]:max-w-[1800px]')
    expect(STOREFRONT_WRAP).not.toMatch(/(^|\s)max-w-(2xl|3xl|4xl|5xl|6xl)/)
    // Одна сплошная сетка на любой ширине (на телефоне 2 колонки), без раздельных сеток разделов:
    // иначе после раздела из одной карточки пустует половина или вся правая часть строки.
    expect(STOREFRONT_GRID).toMatch(/(^|\s)grid(\s|$)/)
    expect(STOREFRONT_GRID).toContain('grid-cols-2')
    expect(STOREFRONT_GRID).toContain('2xl:grid-cols-6')
    expect(STOREFRONT_GRID).toContain('items-stretch')
  })

  it('keeps the cart bar a centred narrow strip so it never reaches the AI widget bubble', () => {
    expect(STOREFRONT_BAR_INNER).toContain('mx-auto')
    expect(STOREFRONT_BAR_INNER).toContain('lg:max-w-3xl')
    // на телефоне при виджете справа остаётся место под пузырь (>= 20 + 56 px)
    expect(STOREFRONT_BAR_WIDGET_PAD).toContain('pr-[5.5rem]')
  })
})
