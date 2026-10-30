import { describe, it, expect } from 'vitest'
import {
  SOURCE_1688_ADMIN_ONLY, build1688SearchUrl, cacheKey, canUseSource1688, encodeGbkQuery, marginHref,
  parseSuggestion, readMarginPrefill, risksFor,
} from './source1688'

// Все названия и ответы вымышленные. Кодировку GBK проверяем круговым преобразованием через
// тот же декодер, чтобы тест не зависел от вручную выписанных байтов.
const decodeGbkPercent = (s: string): string => {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%') { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2 } else bytes.push(s.charCodeAt(i))
  }
  return new TextDecoder('gbk').decode(new Uint8Array(bytes))
}

describe('encodeGbkQuery', () => {
  it('иероглифы в процентной кодировке GBK, круговое преобразование даёт исходную строку', () => {
    expect(encodeGbkQuery('中')).toBe('%D6%D0')
    expect(decodeGbkPercent(encodeGbkQuery('湿巾 婴儿 80抽')!)).toBe('湿巾 婴儿 80抽')
  })
  it('латиница и цифры не кодируются, пробел это %20', () => {
    expect(encodeGbkQuery('abc-123')).toBe('abc-123')
    expect(encodeGbkQuery('a b')).toBe('a%20b')
  })
  it('символ вне GBK даёт null, а не мусор', () => {
    expect(encodeGbkQuery('湿巾😀')).toBeNull()
  })
})

describe('build1688SearchUrl', () => {
  it('ведёт на поиск 1688 с GBK-запросом', () => {
    const u = build1688SearchUrl('湿巾')
    expect(u.startsWith('https://s.1688.com/selloffer/offer_search.htm?keywords=')).toBe(true)
    expect(decodeGbkPercent(u.split('keywords=')[1])).toBe('湿巾')
  })
  it('если GBK не получился, откат на UTF-8, ссылка всё равно рабочая', () => {
    const u = build1688SearchUrl('湿巾😀')
    expect(decodeURIComponent(u.split('keywords=')[1])).toBe('湿巾😀')
  })
})

describe('parseSuggestion', () => {
  const good = '{"queries":[{"zh":"婴儿湿巾","ru":"детские влажные салфетки"},{"zh":"湿纸巾 批发","ru":"салфетки оптом"}],"weightGrams":350}'
  it('JSON с лишними словами вокруг', () => {
    const s = parseSuggestion(`Вот ответ:\n${good}\nУдачи!`)
    expect(s?.queries.map(q => q.zh)).toEqual(['婴儿湿巾', '湿纸巾 批发'])
    expect(s?.weightGrams).toBe(350)
  })
  it('без иероглифов, слишком длинные и дубли отбрасываются, максимум три', () => {
    const raw = JSON.stringify({
      queries: [
        { zh: 'wet wipes', ru: 'нет иероглифов' },
        { zh: '湿巾', ru: 'а' }, { zh: '湿巾', ru: 'дубль' },
        { zh: '一'.repeat(41), ru: 'длинный' },
        { zh: '婴儿湿巾', ru: 'б' }, { zh: '湿纸巾', ru: 'в' }, { zh: '擦手纸', ru: 'г' },
      ],
      weightGrams: 10,
    })
    expect(parseSuggestion(raw)?.queries.map(q => q.zh)).toEqual(['湿巾', '婴儿湿巾', '湿纸巾'])
  })
  it.each([[0], [-5], [60_000], ['много'], [null]])('вес %s не принимается, запросы остаются', w => {
    const s = parseSuggestion(JSON.stringify({ queries: [{ zh: '湿巾', ru: 'x' }], weightGrams: w }))
    expect(s?.weightGrams).toBeNull()
    expect(s?.queries).toHaveLength(1)
  })
  it.each([[undefined], [''], ['не JSON'], ['{"queries":"нет"}'], ['{"queries":[]}'], ['{"queries":[{"zh":"abc"}]}']])(
    'мусор %j даёт null', raw => { expect(parseSuggestion(raw)).toBeNull() })
})

describe('risksFor', () => {
  const keys = (n: string, b?: string | null) => risksFor(n, b).map(r => r.key)
  it('предупреждение про пошлину и НДС есть всегда', () => {
    expect(keys('Скакалка')).toEqual(['duty'])
  })
  it('бренд: плашка; «Без бренда» и пустое не считаются брендом', () => {
    expect(keys('Скакалка', 'Nike')).toContain('brand')
    expect(keys('Скакалка', 'Без бренда')).not.toContain('brand')
    expect(keys('Скакалка', '')).not.toContain('brand')
    expect(keys('Скакалка', null)).not.toContain('brand')
  })
  it.each([
    ['Детские влажные салфетки 80 шт', 'documents'],
    ['Витамин D3 таблетки', 'documents'],
    ['Крем для рук', 'documents'],
    ['Футболка мужская', 'documents'],
    ['Зарядка быстрая 65W', 'documents'],
  ])('категория с документами: %s', (name, key) => { expect(keys(name)).toContain(key) })
  it('«бад» только как слово: бадминтон не считается', () => {
    expect(keys('Ракетка для бадминтона')).not.toContain('documents')
    expect(keys('БАД Омега-3')).toContain('documents')
  })
})

describe('калькулятор маржи', () => {
  it('ссылка и чтение возвращают то же самое', () => {
    const href = marginHref({ name: 'Влажные салфетки 80 шт', price: 1999.6, weightGrams: 350 })
    expect(href.startsWith('/kaspi-shop/margin?')).toBe(true)
    expect(readMarginPrefill(href.split('?')[1])).toEqual({ name: 'Влажные салфетки 80 шт', price: '2000', weight: '350' })
  })
  it('нет веса и цены: параметров нет', () => {
    expect(marginHref({ name: 'X', price: 0, weightGrams: null })).toBe('/kaspi-shop/margin?name=X')
  })
  it('чтение отбрасывает отрицательное, нечисловое и огромное, обрезает название', () => {
    const r = readMarginPrefill(`name=${'а'.repeat(500)}&price=-5&weight=abc`)
    expect(r.name).toHaveLength(120)
    expect(r.price).toBe('')
    expect(r.weight).toBe('')
    expect(readMarginPrefill('price=1e12').price).toBe('')
    expect(readMarginPrefill('').name).toBe('')
  })
})

describe('служебное', () => {
  it('ключ кэша: регистр, пробелы и знаки не различаются', () => {
    expect(cacheKey('  Влажные  салфетки, 80 шт!! ')).toBe(cacheKey('влажные салфетки 80 шт'))
  })
  it('админ-гейт: пока включён, доступ только у админа', () => {
    expect(SOURCE_1688_ADMIN_ONLY).toBe(true)
    expect(canUseSource1688(true)).toBe(true)
    expect(canUseSource1688(false)).toBe(false)
    expect(canUseSource1688(null)).toBe(false)
    expect(canUseSource1688(undefined)).toBe(false)
  })
})
