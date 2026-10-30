import { describe, expect, it } from 'vitest'
import { BOT_TOOL_LINK, formatCheckReply, limitText, parseBotInput } from './format'
import type { BinLookupResult } from '@/lib/binLookup'

const company = (over: Partial<BinLookupResult> = {}): BinLookupResult => ({
  bin: '123456789012', name: 'ТОО «Пример <b>»', address: null, director: null, activity: null,
  status: 'Зарегистрирован', registeredAt: '01.03.2019', source: 'kgd', isVatPayer: true, vatRegisteredAt: null,
  isUnreliable: false, isLiquidating: false, totalArrear: 0, taxArrear: 0, ...over,
})

describe('parseBotInput', () => {
  it('команды', () => {
    expect(parseBotInput('/start')).toEqual({ kind: 'start' })
    expect(parseBotInput('/start@my_bot payload')).toEqual({ kind: 'start' })
    expect(parseBotInput('/help')).toEqual({ kind: 'help' })
  })
  it('БИН: голый, с пробелами и дефисами, внутри фразы', () => {
    expect(parseBotInput('123456789012')).toEqual({ kind: 'bin', bin: '123456789012' })
    expect(parseBotInput(' 1234 5678 9012 ')).toEqual({ kind: 'bin', bin: '123456789012' })
    expect(parseBotInput('123-456-789-012')).toEqual({ kind: 'bin', bin: '123456789012' })
    expect(parseBotInput('проверь 123456789012 пожалуйста')).toEqual({ kind: 'bin', bin: '123456789012' })
  })
  it('не БИН: короткие и длинные числа, телефон, пустое, не текст', () => {
    expect(parseBotInput('12345')).toEqual({ kind: 'other' })
    expect(parseBotInput('1234567890123')).toEqual({ kind: 'other' })
    expect(parseBotInput('+7 777 123 45 67')).toEqual({ kind: 'other' })
    expect(parseBotInput('привет')).toEqual({ kind: 'other' })
    expect(parseBotInput(undefined)).toEqual({ kind: 'other' })
    expect(parseBotInput(12345)).toEqual({ kind: 'other' })
  })
})

describe('formatCheckReply', () => {
  it('экранирует HTML из реестров и честно пишет «чисто»', () => {
    const t = formatCheckReply(company(), 2)
    expect(t).toContain('<b>ТОО «Пример &lt;b&gt;»</b>')
    expect(t).toContain('Неблагонадёжный налогоплательщик (КГД): нет')
    expect(t).toContain('Ликвидация: нет')
    expect(t).toContain('Налоговая задолженность: нет')
    expect(t).toContain('Осталось бесплатных проверок: 2.')
  })
  it('проблемы и «не удалось проверить» не маскируются под «чисто»', () => {
    const t = formatCheckReply(company({ isUnreliable: true, unreliableCategories: ['bankrupt'], isLiquidating: null, totalArrear: 1234567, taxArrear: null, isVatPayer: null }), 0)
    expect(t).toContain('ДА, банкрот по решению суда')
    expect(t).toContain('Ликвидация: не удалось проверить')
    expect(t).toContain('1 234 567 ₸')
    expect(t).toContain('Плательщик НДС: не удалось проверить')
    expect(t).not.toMatch(/—|–/)
  })
  it('необязательные проверки: нет поля = строки нет, null = не удалось', () => {
    const none = formatCheckReply(company(), 1)
    expect(none).not.toContain('Исполнительные')
    expect(none).not.toContain('госзакупок')
    const t = formatCheckReply(company({ enforcement: null, rnu: { found: true, count: 2 } as never }), 1)
    expect(t).toContain('Исполнительные производства (Минюст): не удалось проверить')
    expect(t).toContain('госзакупок: ДА (записей 2)')
  })
  it('ссылка лимита ведёт на go-ссылку бота', () => {
    expect(limitText()).toContain(BOT_TOOL_LINK)
  })
})
