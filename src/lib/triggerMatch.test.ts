import { describe, it, expect } from 'vitest'
import { triggerMatches } from './triggerMatch'
import { findMatchingTemplate } from './instagramReplyMatch'
import { findTemplateMatch } from './aiAgent/webhookHandler'
import { findFlowTriggerMatch } from './aiAgent/flow'

const m = (text: string, trigger: string) => triggerMatches(text.toLowerCase(), trigger)

describe('triggerMatches: короткие триггеры (до 3 символов) -- только с начала слова', () => {
  it.each(['БИН', 'Сначала БИН', 'бин?', 'бина', 'Мой бин: 123', 'бине'])('«бин» ловит «%s»', text => {
    expect(m(text, 'бин')).toBe(true)
  })

  it.each(['кабинет', 'комбинация', 'Робин', 'Личный кабинет'])('«бин» не ловит «%s»', text => {
    expect(m(text, 'бин')).toBe(false)
  })

  it('регистр триггера не важен', () => {
    expect(m('бин', 'БИН')).toBe(true)
  })

  it('цифра перед триггером -- не начало слова', () => {
    expect(m('2бин', 'бин')).toBe(false)
  })

  it('«цен» (3 символа): цена и цены ловятся, офицер -- нет', () => {
    expect(m('какая цена?', 'цен')).toBe(true)
    expect(m('цены на услуги', 'цен')).toBe(true)
    expect(m('вызовите офицер', 'цен')).toBe(false)
  })

  it('триггер из пробелов вокруг слова обрезается', () => {
    expect(m('кабинет', ' бин ')).toBe(false)
    expect(m('бин', ' бин ')).toBe(true)
  })

  it('спецсимволы регулярок в коротком триггере экранируются', () => {
    expect(m('цена (₸)', '(₸)')).toBe(true)
    expect(m('a.b', 'a.b')).toBe(true)
    expect(m('axb', 'a.b')).toBe(false)
    expect(m('abc', '.*')).toBe(false)
    expect(m('a+b', 'a+')).toBe(true)
  })
})

describe('triggerMatches: длинные триггеры (> 3 символов) -- подстрока как раньше', () => {
  it('ловит внутри слова', () => {
    expect(m('Нужны накладные на товар', 'накладн')).toBe(true)
    expect(m('кабинет', 'абине')).toBe(true)
    expect(m('Какая цена?', 'цена')).toBe(true)
  })

  it('многословная фраза', () => {
    expect(m('Сколько стоит доставка', 'сколько стоит')).toBe(true)
    expect(m('сколько это стоит', 'сколько стоит')).toBe(false)
  })

  it('спецсимволы в длинном триггере -- буквальная подстрока', () => {
    expect(m('цена (от 5000 ₸)', '(от 5000')).toBe(true)
    expect(m('abcd', 'a.cd')).toBe(false)
  })
})

describe('triggerMatches: пустой триггер никогда не ловит', () => {
  it.each(['', ' ', '   ', '\t'])('«%s»', trigger => {
    expect(m('любой текст', trigger)).toBe(false)
    expect(m('', trigger)).toBe(false)
  })
})

describe('matchers используют общую логику', () => {
  const templates = [
    { id: 't1', trigger_words: ['бин'], reply_text: 'Проверим контрагента' },
    { id: 't2', trigger_words: ['накладн'], reply_text: 'Накладные' },
  ]

  it('findMatchingTemplate (Instagram)', () => {
    expect(findMatchingTemplate('БИН', templates)?.id).toBe('t1')
    expect(findMatchingTemplate('Сначала БИН', templates)?.id).toBe('t1')
    expect(findMatchingTemplate('бина', templates)?.id).toBe('t1')
    expect(findMatchingTemplate('Личный кабинет', templates)).toBeNull()
    expect(findMatchingTemplate('комбинация', templates)).toBeNull()
    expect(findMatchingTemplate('Робин', templates)).toBeNull()
    expect(findMatchingTemplate('нужны накладные', templates)?.id).toBe('t2')
  })

  it('findTemplateMatch (AI-агент)', () => {
    expect(findTemplateMatch('БИН', templates)?.id).toBe('t1')
    expect(findTemplateMatch('бин?', templates)?.id).toBe('t1')
    expect(findTemplateMatch('кабинет', templates)).toBeNull()
    expect(findTemplateMatch('Робин', templates)).toBeNull()
    expect(findTemplateMatch('нужны накладные', templates)?.id).toBe('t2')
    expect(findTemplateMatch('любой текст', [{ id: 'e', trigger_words: ['', '  '], reply_text: 'x' }])).toBeNull()
  })

  it('findFlowTriggerMatch (сценарии)', () => {
    const flows = [{ id: 'f1', trigger_words: ['бин'] }, { id: 'f2', trigger_words: ['запись'] }]
    expect(findFlowTriggerMatch('БИН', flows)).toBe('f1')
    expect(findFlowTriggerMatch('личный кабинет', flows)).toBeNull()
    expect(findFlowTriggerMatch('хочу запись', flows)).toBe('f2')
  })
})

describe('triggerMatches: «=слово» -- сообщение целиком равно слову', () => {
  it.each(['Товар', 'товар', '  ТОВАР  ', 'товар!', 'Товар.', '👍 товар', '«товар»', 'товар?!'])('«=товар» ловит «%s»', text => {
    expect(m(text, '=товар')).toBe(true)
  })

  it.each(['товары', 'какой товар', 'товар в наличии?', 'мой товар', 'товар товар', 'очень хороший товар', ''])('«=товар» не ловит «%s»', text => {
    expect(m(text, '=товар')).toBe(false)
  })

  it('«акт» и «бот» целиком, но не внутри слов и фраз', () => {
    expect(m('АКТ', '=акт')).toBe(true)
    expect(m('актуально', '=акт')).toBe(false)
    expect(m('Нужен акт', '=акт')).toBe(false)
    expect(m('бот', '=бот')).toBe(true)
    expect(m('работа', '=бот')).toBe(false)
    expect(m('это бот?', '=бот')).toBe(false)
  })

  it('пустое слово после «=» не ловит ничего', () => {
    expect(m('любой текст', '=')).toBe(false)
    expect(m('', '=')).toBe(false)
    expect(m('любой текст', ' = ')).toBe(false)
  })

  it('спецсимволы регулярок в слове не ломают сравнение', () => {
    expect(m('a.b', '=a.b')).toBe(true)
    expect(m('axb', '=a.b')).toBe(false)
  })
})

describe('triggerMatches: «^слово» -- с начала слова, окончание любое', () => {
  it.each(['счёт', 'Счёт на оплату', 'выставьте счёт', 'счёта пришлите', 'нужен счёт-фактура'])('«^счёт» ловит «%s»', text => {
    expect(m(text, '^счёт')).toBe(true)
  })

  it.each(['расчёт', 'пересчёт цен', 'нужен расчёт', '2счёт'])('«^счёт» не ловит «%s»', text => {
    expect(m(text, '^счёт')).toBe(false)
  })

  it('пустое слово после «^» не ловит ничего', () => {
    expect(m('любой текст', '^')).toBe(false)
  })
})

describe('matchers: кодовые слова через = и ^', () => {
  const templates = [
    { id: 'tovar', trigger_words: ['=товар'], reply_text: 'Накладная' },
    { id: 'schet', trigger_words: ['^счёт', '^счет'], reply_text: 'Счёт' },
  ]
  it('Instagram и AI-агент одинаково', () => {
    for (const find of [findMatchingTemplate, findTemplateMatch]) {
      expect(find('Товар', templates)?.id).toBe('tovar')
      expect(find('какой товар у вас?', templates)).toBeNull()
      expect(find('Счет', templates)?.id).toBe('schet')
      expect(find('нужен расчёт', templates)).toBeNull()
    }
  })
})
