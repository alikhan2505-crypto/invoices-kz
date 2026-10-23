import { describe, it, expect } from 'vitest'
import { suggestKbe, autoKbe, detectLegalForm, isIinLike, isDraftKbeManual, needsManualKbe, KBE_DEFAULT } from './kbe'

describe('suggestKbe: ИП, КХ, физлицо -> 19', () => {
  const cases = [
    'ИП Иванов Иван',
    'ип иванов',
    'ИП «Альфа»',
    'ИП "Альфа Трейд"',
    '  «ИП Сеитов»  ',
    'ИП-Сеитов',
    'ИП«Сеитов»',
    'И.П. Иванов',
    'Индивидуальный предприниматель Иванов И.И.',
    'ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ПЕТРОВА',
    'ЖК Нұрлан',
    'Ж.К. Нұрлан',
    'Жеке кәсіпкер Серіков',
    'ЖЕКЕ КӘСІПКЕР «Алма»',
    'Крестьянское хозяйство «Береке»',
    'КХ Береке',
    'К(Ф)Х Береке',
    'КФХ Береке',
    'ФХ Нур',
    'Фермерское хозяйство Алтын',
    'Шаруа қожалығы «Мереке»',
    'Физическое лицо Петров',
    'IP Ivanov',
    'ip ivanov',
    'Individual Entrepreneur Ivanov',
    '«Иванов» ИП',
    'Иванов Иван ИП',
  ]
  it.each(cases)('%s', name => expect(suggestKbe(name)).toBe('19'))
})

describe('suggestKbe: ТОО -> 17', () => {
  const cases = [
    'ТОО «Альфа»',
    'ТОО "Альфа"',
    'тоо альфа',
    'ТОО«Альфа»',
    'ТОО-Альфа',
    'Т.О.О. Альфа',
    '«Альфа» ТОО',
    'Альфа ТОО',
    'ЖШС «Альфа»',
    'жшс альфа',
    '«Алма» ЖШС',
    'LLP Alfa',
    'Alfa LLP',
    '"Alfa" LLP',
    'TOO Alfa',
    'ТOО Альфа', // латинская O внутри кириллицы
    'TОО Альфа', // латинская T
    'Товарищество с ограниченной ответственностью «Альфа»',
    'ТОВАРИЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ Альфа',
    'Жауапкершілігі шектеулі серіктестігі «Альфа»',
    'Limited Liability Partnership Alfa',
  ]
  it.each(cases)('%s', name => expect(suggestKbe(name)).toBe('17'))
})

describe('suggestKbe: АО -> null и needsManualKbe (код зависит от сектора)', () => {
  const cases = [
    'АО «Казахтелеком»',
    'АО Казахтелеком',
    'АҚ «Қазпошта»',
    'НАО «Альфа»',
    'JSC Alfa',
    'Акционерное общество «Альфа»',
    'Акционерлік қоғам «Альфа»',
    'Joint Stock Company Alfa',
  ]
  it.each(cases)('%s', name => {
    expect(suggestKbe(name)).toBeNull()
    expect(needsManualKbe(name)).toBe(true)
  })
  it('ТОО и ИП ручного ввода не требуют', () => {
    expect(needsManualKbe('ТОО «Альфа»')).toBe(false)
    expect(needsManualKbe('ИП Иванов')).toBe(false)
    expect(needsManualKbe('')).toBe(false)
  })
})

describe('suggestKbe: государственные формы -> null, не гадаем', () => {
  const cases = [
    'ГУ «Управление образования»',
    'ГКП на ПХВ «Поликлиника №1»',
    'КГП на ПХВ «Больница»',
    'РГП «Казгидромет»',
    'Государственное учреждение «Акимат»',
    'Республиканское государственное предприятие «Альфа»',
    'Коммунальное государственное учреждение «Школа»',
    'Мемлекеттік мекеме «Білім»',
  ]
  it.each(cases)('%s', name => expect(suggestKbe(name)).toBeNull())
})

describe('suggestKbe: неизвестное и ложные срабатывания', () => {
  const cases = [
    '',
    '   ',
    'Альфа',
    'Рога и копыта',
    'Иванов Иван Иванович',
    // «тоо», «ип», «ао» внутри слова — не форма
    'Тоотекс',
    'Тооморроу',
    'Ипподром Астана',
    'Ипотека Плюс',
    'Магнитоо',
    'Каолин',
    'Ключ ао1',
    // латинское слово «Too», «Ipad» — не ТОО/IP
    'Too Good Foods',
    'Ipad Store',
    'Kazakh Telecom',
    // «Ақ» — слово («белый»), АҚ — только заглавными
    'Ақ Жол',
    // инициалы в конце — не форма
    'Петров А.О.',
    'Сидоров И.П. Алматы',
  ]
  it.each(cases)('%j', name => expect(suggestKbe(name)).toBeNull())

  it('null и undefined', () => {
    expect(suggestKbe(null)).toBeNull()
    expect(suggestKbe(undefined)).toBeNull()
    expect(suggestKbe({})).toBeNull()
    expect(suggestKbe({ name: null, bin: null })).toBeNull()
  })
})

describe('suggestKbe: ИИН', () => {
  // 900101300123: 90-01-01, пятая цифра 3... (день 01), седьмая 3 -> ИИН
  const iin = '900101300123'
  // БИН юрлица: 4-я..5-я позиции 4 (регистрация + тип)
  const bin = '210140012345'

  it('ИИН без названия -> 19', () => {
    expect(suggestKbe({ bin: iin })).toBe('19')
    expect(suggestKbe({ name: '', bin: iin })).toBe('19')
  })
  it('БИН юрлица без названия -> null, не гадаем', () => {
    expect(suggestKbe({ bin })).toBeNull()
  })
  it('название главнее ИИН', () => {
    expect(suggestKbe({ name: 'ТОО «Альфа»', bin: iin })).toBe('17')
    expect(suggestKbe({ name: 'ГУ «Школа»', bin: iin })).toBeNull()
    expect(suggestKbe({ name: 'ИП Иванов', bin: bin })).toBe('19')
  })
  it('неизвестная форма в названии -> решает ИИН', () => {
    expect(suggestKbe({ name: 'Иванов Иван Иванович', bin: iin })).toBe('19')
  })
  it('isIinLike', () => {
    expect(isIinLike(iin)).toBe(true)
    expect(isIinLike('900101 300123')).toBe(true)
    expect(isIinLike(bin)).toBe(false)
    expect(isIinLike('90010130012')).toBe(false)
    expect(isIinLike('901301300123')).toBe(false) // месяц 13
    expect(isIinLike('900101900123')).toBe(false) // признак века/пола 9
    expect(isIinLike(null)).toBe(false)
  })
})

describe('detectLegalForm', () => {
  it('формы', () => {
    expect(detectLegalForm('ИП Иванов')).toBe('individual')
    expect(detectLegalForm('ТОО «Альфа»')).toBe('company')
    expect(detectLegalForm('ГУ «Школа»')).toBe('state')
    expect(detectLegalForm('Альфа')).toBeNull()
    expect(detectLegalForm(undefined)).toBeNull()
  })
  it('начало названия важнее конца', () => {
    expect(detectLegalForm('ТОО Иванов ИП')).toBe('company')
    expect(detectLegalForm('Ақ Бота ИП')).toBe('individual')
  })
})

describe('autoKbe', () => {
  it('подсказка или обычное 19', () => {
    expect(autoKbe('ТОО «Альфа»')).toBe('17')
    expect(autoKbe('ИП Иванов')).toBe('19')
    expect(autoKbe('Альфа')).toBe('19')
    expect(autoKbe('ГУ «Школа»')).toBe(KBE_DEFAULT)
    expect(autoKbe(null)).toBe('19')
  })
})

describe('isDraftKbeManual', () => {
  it('флаг из этой версии', () => {
    expect(isDraftKbeManual('1', '19')).toBe(true)
    expect(isDraftKbeManual('1', '17')).toBe(true)
  })
  it("флаг '0': автоподставленное 17 после перезагрузки остаётся подсказкой", () => {
    expect(isDraftKbeManual('0', '17')).toBe(false)
    expect(isDraftKbeManual('0', '19')).toBe(false)
  })
  it('флага нет (null) и КБе 17: старый черновик, вводили руками', () => {
    expect(isDraftKbeManual(null, '17')).toBe(true)
  })
  it('старый черновик: 19 — значение по умолчанию, другое — вводил человек', () => {
    expect(isDraftKbeManual(null, '19')).toBe(false)
    expect(isDraftKbeManual(null, '17')).toBe(true)
    expect(isDraftKbeManual(null, '')).toBe(false)
    expect(isDraftKbeManual(null, undefined)).toBe(false)
  })
})
