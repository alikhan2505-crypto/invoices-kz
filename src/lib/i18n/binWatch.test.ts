import { describe, it, expect } from 'vitest'
import { binWatchDict } from './binWatch'
import { CHANGE_KEYS, EMPTY_SIGNALS } from '@/lib/binWatch/signals'

// Функции вызываем с нейтральными латинскими аргументами: проверяем только собственные строки словаря.
const asText = (lang: 'ru' | 'kk' | 'en') =>
  JSON.stringify(binWatchDict[lang], (_k, v) => {
    if (typeof v !== 'function') return v
    return [v(3, 5), v('X', 'Y'), v(7)].join(' ')
  })

const CYR = 'А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі'

describe('словарь слежения за БИН', () => {
  it('en без кириллицы', () => {
    expect(asText('en')).not.toMatch(new RegExp(`[${CYR}]`))
  })

  it('kk использует казахские термины, а не русские аббревиатуры', () => {
    const kk = asText('kk')
    for (const abbr of ['БИН', 'ИИН', 'НДС', 'КГД']) {
      expect(kk, abbr).not.toMatch(new RegExp(`(^|[^${CYR}])${abbr}($|[^${CYR}])`))
    }
    expect(kk).toMatch(/БСН/)
    expect(kk).toMatch(/ҚҚС/)
  })

  it('во всех языках есть подпись у каждого признака и все строки непустые', () => {
    const keys = new Set<string>([...CHANGE_KEYS, ...Object.keys(EMPTY_SIGNALS)])
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = binWatchDict[lang]
      for (const k of keys) expect((t.signals as Record<string, string>)[k]?.trim().length, `${lang}.${k}`).toBeGreaterThan(2)
      for (const [name, v] of Object.entries(t)) {
        if (typeof v === 'string') expect(v.trim().length, `${lang}.${name}`).toBeGreaterThan(0)
      }
    }
  })

  it('нет длинного тире и эмодзи', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      expect(asText(lang)).not.toMatch(/[‒-―\u{1F300}-\u{1FAFF}]/u)
    }
  })

  it('подсказка о лимитах берёт цифры из единого источника', () => {
    expect(binWatchDict.ru.planNote(5, 50)).toBe('На бесплатном тарифе до 5 БИН, на тарифе Про до 50.')
  })
})
