import { describe, expect, it } from 'vitest'
import { HP_COPY } from './copy'
import { BOUNDS, chapterAt, swap, win } from './timeline'

// Все строки превью главной (рекурсивно).
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(strings)
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings)
  return []
}

// Форма словаря: те же ключи и длины массивов во всех трёх языках.
function shape(v: unknown): unknown {
  if (typeof v === 'string') return 's'
  if (Array.isArray(v)) return v.map(shape)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
  return typeof v
}

describe('тексты превью главной', () => {
  it('у ru, kk и en одна и та же форма', () => {
    expect(shape(HP_COPY.kk)).toEqual(shape(HP_COPY.ru))
    expect(shape(HP_COPY.en)).toEqual(shape(HP_COPY.ru))
  })

  it('нет длинных тире и пустых строк в видимых текстах', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      for (const s of strings(HP_COPY[lang])) {
        expect(s.trim().length).toBeGreaterThan(0)
        expect(s).not.toMatch(/[—–]/)
      }
    }
  })

  it('казахские тексты следуют сверенным терминам', () => {
    const kk = strings(HP_COPY.kk).join(' ')
    expect(kk).not.toContain('ҚЗ')
    expect(kk).not.toContain('ГФСС')
    expect(kk).toContain('Про тарифіне')
    expect(kk).toContain('AI-агент')
  })

  it('в ru нет слов, которых не было на живом лендинге: отзывы, клиенты, логотипы', () => {
    const ru = strings(HP_COPY.ru).join(' ').toLowerCase()
    for (const bad of ['отзыв', 'нам доверяют', 'клиентов уже', '%+']) expect(ru).not.toContain(bad)
  })
})

describe('шкала прокрутки', () => {
  it('границы глав растут и лежат внутри 0..1', () => {
    for (let i = 1; i < BOUNDS.length; i++) expect(BOUNDS[i]).toBeGreaterThan(BOUNDS[i - 1])
    expect(BOUNDS[0]).toBeGreaterThan(0)
    expect(BOUNDS[BOUNDS.length - 1]).toBeLessThan(1)
  })

  it('номер главы по прогрессу', () => {
    expect(chapterAt(0)).toBe(0)
    expect(chapterAt(BOUNDS[0] - 0.01)).toBe(0)
    expect(chapterAt(BOUNDS[0])).toBe(1)
    expect(chapterAt(0.5)).toBe(3)
    expect(chapterAt(1)).toBe(5)
  })

  it('окна смены не пересекаются: старое слово ушло до прихода нового', () => {
    for (let j = 1; j <= 5; j++) {
      const prev = swap(j - 1) as Record<string, number>
      const next = swap(j) as Record<string, number>
      const prevGone = prev['--a2'] + 1 / prev['--k2']
      expect(prevGone).toBeLessThanOrEqual(next['--a'] + 1e-9)
    }
  })

  it('win задаёт начало и 1/длину', () => {
    const w = win(0.1, 0.2) as Record<string, number>
    expect(w['--a']).toBe(0.1)
    expect(w['--k']).toBe(10)
  })
})
