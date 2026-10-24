import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ProGate, { ProGateBanner } from './ProGate'
import { proGateCtaDict } from '@/lib/i18n/proGate'

// Без провайдера язык русский (DEFAULT_LANG), этого достаточно для проверки разметки.

describe('proGateCtaDict', () => {
  it('есть во всех языках и без тире', () => {
    for (const l of ['ru', 'kk', 'en'] as const) {
      expect(proGateCtaDict[l].cta.length).toBeGreaterThan(3)
      expect(proGateCtaDict[l].cta).not.toMatch(/[-–—]/)
    }
    expect(proGateCtaDict.ru.cta).toBe('Перейти к тарифам')
  })

  it('один заголовок на все замки, без тире и эмодзи, цена отдельной строкой', () => {
    expect(proGateCtaDict.ru.title).toBe('Доступно на тарифе Про')
    for (const l of ['ru', 'kk', 'en'] as const) {
      expect(proGateCtaDict[l].title.length).toBeGreaterThan(3)
      expect(proGateCtaDict[l].title).not.toMatch(/[-–—]/)
      expect(proGateCtaDict[l].priceLine('5990 T')).toContain('5990 T')
      expect(proGateCtaDict[l].priceLine('1')).not.toMatch(/[-–—\u{1F300}-\u{1FAFF}]/u)
    }
  })
})

describe('ProGate', () => {
  it('рисует заголовок, строку пояснения и ссылку на /upgrade с подписью по умолчанию', () => {
    const html = renderToStaticMarkup(createElement(ProGate, { title: 'Только для Про', description: 'Шаблоны в один клик' }))
    expect(html).toContain('Только для Про')
    expect(html).toContain('Шаблоны в один клик')
    expect(html).toContain('href="/upgrade"')
    expect(html).toContain('Перейти к тарифам')
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('значок по умолчанию замок, заголовок h2, цвета только токенами --nav-*', () => {
    const html = renderToStaticMarkup(createElement(ProGate, { title: 'a', description: 'b' }))
    expect(html).toContain('<rect x="5" y="11"')
    expect(html).toMatch(/<h2 [^>]*>a<\/h2>/)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}|rgb\(|gray-/)
    expect(html).toContain('var(--nav-text-primary)')
    expect(html).toContain('var(--nav-text-secondary)')
  })

  it('без title берёт общий заголовок, с showPrice добавляет строку цены из PLAN_PRICES', () => {
    const plain = renderToStaticMarkup(createElement(ProGate, { description: 'b' }))
    expect(plain).toContain('Доступно на тарифе Про')
    expect(plain).not.toContain('в месяц')
    const priced = renderToStaticMarkup(createElement(ProGate, { description: 'b', showPrice: true }))
    expect(priced).toContain('в месяц')
    expect(priced).toContain('₸')
    expect(priced.indexOf('Перейти к тарифам')).toBeLessThan(priced.indexOf('в месяц'))
  })

  it('своя подпись, адрес и значок переопределяют умолчания', () => {
    const html = renderToStaticMarkup(createElement(ProGate, {
      title: 'a', description: 'b', cta: 'Продлить Про', href: '/upgrade?plan=pro',
      icon: createElement('i', { 'data-x': '1' }),
    }))
    expect(html).toContain('Продлить Про')
    expect(html).toContain('href="/upgrade?plan=pro"')
    expect(html).toContain('data-x="1"')
    expect(html).not.toContain('<svg')
  })

  it('animate=false отдаёт сразу видимый блок без начальной прозрачности', () => {
    const html = renderToStaticMarkup(createElement(ProGate, { title: 'a', description: 'b', animate: false }))
    expect(html).not.toContain('opacity:0')
  })
})

describe('ProGateBanner', () => {
  it('card: заголовок, бейдж, пояснение и кнопка-ссылка', () => {
    const html = renderToStaticMarkup(createElement(ProGateBanner, {
      title: 'Эквайринг', badge: 'Про', description: 'Доступно на тарифе Про', icon: createElement('b', null, 'ico'),
    }))
    expect(html).toContain('Эквайринг')
    expect(html).toContain('Про')
    expect(html).toContain('Доступно на тарифе Про')
    expect(html).toContain('ico')
    expect(html).toContain('href="/upgrade"')
    expect(html).toContain('Перейти к тарифам')
  })

  it('card без пояснения не рисует пустую строку, кнопка остаётся', () => {
    const html = renderToStaticMarkup(createElement(ProGateBanner, { title: 'Доступно на тарифе Про', badge: 'Про' }))
    expect(html).toContain('Доступно на тарифе Про')
    expect(html).toContain('Перейти к тарифам')
    expect(html).not.toContain('text-xs mb-3')
  })

  it('card без заголовка, значка и бейджа не рисует пустую шапку', () => {
    const html = renderToStaticMarkup(createElement(ProGateBanner, { description: 'только текст' }))
    expect(html).toContain('только текст')
    expect(html).not.toContain('flex items-center gap-3 mb-2')
  })

  it('note: строка пояснения со ссылкой в конце, без карточки', () => {
    const html = renderToStaticMarkup(createElement(ProGateBanner, {
      variant: 'note', description: 'Подписание ЭЦП на тарифе Про.',
    }))
    expect(html).toContain('Подписание ЭЦП на тарифе Про.')
    expect(html).toMatch(/<a [^>]*href="\/upgrade"[^>]*>Перейти к тарифам<\/a>/)
    expect(html).not.toContain('nav-glass')
  })
})
