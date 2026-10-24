import { describe, it, expect } from 'vitest'
import {
  EXAMPLE_HALF_YEAR_INCOME,
  F910_BASE_RATE_PERCENT,
  F910_CALENDAR,
  F910_CHECKED,
  F910_RATE_MAX_PERCENT,
  F910_RATE_MIN_PERCENT,
  FILING_200_Q3_2026,
  FILING_200_Q4_2026,
  FOLLOWING_FILING_910,
  FOLLOWING_PAYMENT_910,
  FORMA910_GUIDE,
  LATE_FILING_FINE_MEDIUM_MRP,
  LATE_FILING_FINE_MEDIUM_TENGE,
  LATE_FILING_FINE_TENGE,
  NEXT_FILING_910,
  NEXT_PAYMENT_910,
  PAST_FILING_910_H1_2026,
  PAST_PAYMENT_910_H1_2026,
  PAYROLL_DEDUCTION_THRESHOLD_TENGE,
  SMALL_BUSINESS_INCOME_LIMIT_MRP,
  VOSMS_MONTHLY,
  WEEKDAYS_KK,
  WEEKDAYS_RU,
  filing200Deadline,
  filing910Deadline,
  form910Taxes,
  formaExample,
  formatKkDateDative,
  makeDeadline,
  minimumBaseContributionLines,
  minimumBaseMonthly,
  payment910Deadline,
  shiftToWorkday,
  weekdayOf,
} from './forma910'
import { calculateIpTaxes } from './ipTaxes'
import { MRP_2026, MZP_2026, formatTenge } from './mrp'
import { getGuide, GUIDES } from './guides'
import { buildLlmsTxt } from './llmsTxt'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'

const words = (s: string) => s.trim().split(/\s+/).length

describe('форма 910.00: константы', () => {
  it('ставка 4%, вилка маслихата 2-6%, порог вычета 24 000 МРП = 103 800 000 ₸', () => {
    expect(F910_BASE_RATE_PERCENT).toBe(4)
    expect(F910_RATE_MIN_PERCENT).toBe(2)
    expect(F910_RATE_MAX_PERCENT).toBe(6)
    expect(PAYROLL_DEDUCTION_THRESHOLD_TENGE).toBe(103_800_000)
  })

  it('штраф 30 МРП = 129 750 ₸', () => {
    expect(LATE_FILING_FINE_TENGE).toBe(129_750)
    expect(LATE_FILING_FINE_TENGE).toBe(30 * MRP_2026)
  })

  it('штраф 45 МРП для среднего предпринимательства = 194 625 ₸, порог малого 300 000 МРП', () => {
    expect(LATE_FILING_FINE_MEDIUM_MRP).toBe(45)
    expect(LATE_FILING_FINE_MEDIUM_TENGE).toBe(194_625)
    expect(SMALL_BUSINESS_INCOME_LIMIT_MRP).toBe(300_000)
  })

  it('дата проверки 24.10.2026', () => {
    expect(F910_CHECKED).toBe('2026-10-24')
  })
})

describe('дни недели и перенос срока', () => {
  it('weekdayOf не зависит от часового пояса и знает известные даты', () => {
    expect(weekdayOf('2026-08-15')).toBe(6) // суббота
    expect(weekdayOf('2027-02-15')).toBe(1) // понедельник
    expect(weekdayOf('2027-08-15')).toBe(0) // воскресенье
    expect(weekdayOf('2026-10-25')).toBe(0) // День Республики, воскресенье
  })

  it('рабочий день остаётся на месте, суббота и воскресенье уходят на понедельник', () => {
    expect(shiftToWorkday('2027-02-15')).toBe('2027-02-15')
    expect(shiftToWorkday('2026-08-15')).toBe('2026-08-17')
    expect(shiftToWorkday('2027-08-15')).toBe('2027-08-16')
    expect(shiftToWorkday('2026-11-15')).toBe('2026-11-16')
  })

  it('учитывает переданный праздник', () => {
    expect(shiftToWorkday('2027-02-15', ['2027-02-15'])).toBe('2027-02-16')
    expect(shiftToWorkday('2027-02-15', ['2027-02-15', '2027-02-16'])).toBe('2027-02-17')
  })

  it('пересечение месяца и года', () => {
    expect(shiftToWorkday('2022-01-01')).toBe('2022-01-03') // суббота
    expect(shiftToWorkday('2022-12-31')).toBe('2023-01-02') // суббота
  })

  it('makeDeadline помечает перенос', () => {
    const d = makeDeadline('2027-08-15')
    expect(d).toEqual({ nominal: '2027-08-15', effective: '2027-08-16', shifted: true, weekday: 1 })
    expect(makeDeadline('2027-02-25').shifted).toBe(false)
  })
})

describe('ближайшие сроки по форме 910.00', () => {
  it('II полугодие 2026: сдача 15.02.2027 (пн), уплата 25.02.2027 (чт)', () => {
    expect(NEXT_FILING_910.effective).toBe('2027-02-15')
    expect(NEXT_FILING_910.shifted).toBe(false)
    expect(WEEKDAYS_RU[NEXT_FILING_910.weekday]).toBe('понедельник')
    expect(NEXT_PAYMENT_910.effective).toBe('2027-02-25')
    expect(WEEKDAYS_RU[NEXT_PAYMENT_910.weekday]).toBe('четверг')
  })

  it('I полугодие 2027: сдача переносится с вс 15.08 на пн 16.08, уплата 25.08.2027 (ср)', () => {
    expect(FOLLOWING_FILING_910.nominal).toBe('2027-08-15')
    expect(FOLLOWING_FILING_910.effective).toBe('2027-08-16')
    expect(FOLLOWING_FILING_910.shifted).toBe(true)
    expect(FOLLOWING_PAYMENT_910.effective).toBe('2027-08-25')
    expect(WEEKDAYS_KK[FOLLOWING_PAYMENT_910.weekday]).toBe('сәрсенбі')
  })

  it('I полугодие 2026 (прошло): сдача 15.08 была суббота -> 17.08, уплата 25.08.2026 (вт)', () => {
    expect(PAST_FILING_910_H1_2026.nominal).toBe('2026-08-15')
    expect(PAST_FILING_910_H1_2026.effective).toBe('2026-08-17')
    expect(PAST_PAYMENT_910_H1_2026.effective).toBe('2026-08-25')
    expect(WEEKDAYS_RU[PAST_PAYMENT_910_H1_2026.weekday]).toBe('вторник')
  })

  it('форма 200.00: III квартал 2026 до 16.11.2026, IV квартал до 15.02.2027', () => {
    expect(FILING_200_Q3_2026.effective).toBe('2026-11-16')
    expect(FILING_200_Q4_2026.effective).toBe('2027-02-15')
    expect(filing200Deadline(2026, 1).nominal).toBe('2026-05-15')
    expect(filing200Deadline(2026, 2).nominal).toBe('2026-08-15')
  })

  it('генераторы сроков дают те же даты, что константы', () => {
    expect(filing910Deadline(2026, 2)).toEqual(NEXT_FILING_910)
    expect(payment910Deadline(2026, 2)).toEqual(NEXT_PAYMENT_910)
    expect(filing910Deadline(2027, 1)).toEqual(FOLLOWING_FILING_910)
  })

  it('календарь идёт в хронологическом порядке, у каждой строки совпадает день недели', () => {
    const dates = F910_CALENDAR.map(r => r.deadline.effective)
    expect([...dates].sort()).toEqual(dates)
    for (const r of F910_CALENDAR) expect(r.deadline.weekday).toBe(weekdayOf(r.deadline.effective))
    for (const r of F910_CALENDAR) {
      const wd = r.deadline.weekday
      expect(wd === 0 || wd === 6, r.deadline.effective).toBe(false)
    }
  })
})

describe('сторож актуальности: страницы статичные, «ближайший срок» зашит в константы', () => {
  // Сегодня по Алматы (UTC+5), в формате YYYY-MM-DD. Страница от Date не зависит,
  // только этот тест: он падает, когда пора обновить даты.
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  it('ближайший срок сдачи ещё не прошёл (иначе обновить NEXT_FILING_910, календарь и F910_CHECKED)', () => {
    expect(
      today <= NEXT_FILING_910.effective,
      `Срок ${NEXT_FILING_910.effective} уже прошёл (сегодня ${today}): страница показывает его как «ближайший». ` +
        'Обновите NEXT_FILING_910 / NEXT_PAYMENT_910 в forma910.ts, календарь, тексты и дату проверки.',
    ).toBe(true)
  })

  it('календарь ещё не закончился (иначе добавить следующие периоды)', () => {
    const last = F910_CALENDAR[F910_CALENDAR.length - 1].deadline.effective
    expect(last).toBe(FOLLOWING_PAYMENT_910.effective)
    expect(
      today <= last,
      `Последняя строка календаря (${last}) уже прошла (сегодня ${today}). ` +
        'Обновите календарь в forma910.ts: добавьте следующие периоды и пересчитайте «ближайшие» сроки.',
    ).toBe(true)
  })
})

describe('приложение 910.01 и строки 001-004', () => {
  it('одно место: ставка 4%, доход 6 000 000 -> налог 240 000', () => {
    const t = form910Taxes([{ ratePercent: 4, income: 6_000_000 }])
    expect(t.rows).toEqual([{ g: 4, h: 6_000_000, i: 100, j: 0, k: 6_000_000, l: 240_000 }])
    expect(t.line001).toBe(6_000_000)
    expect(t.line002).toBe(0)
    expect(t.line003).toBe(6_000_000)
    expect(t.line004).toBe(240_000)
  })

  it('несколько мест: доли, вычет распределяется пропорционально, итоги сходятся', () => {
    const t = form910Taxes(
      [
        { ratePercent: 4, income: 3_000_000 },
        { ratePercent: 3, income: 1_000_000 },
      ],
      400_000,
    )
    expect(t.rows.map(r => r.i)).toEqual([75, 25])
    expect(t.rows.map(r => r.j)).toEqual([300_000, 100_000])
    expect(t.rows.map(r => r.k)).toEqual([2_700_000, 900_000])
    expect(t.rows.map(r => r.l)).toEqual([108_000, 27_000])
    expect(t.line001).toBe(4_000_000)
    expect(t.line002).toBe(400_000)
    expect(t.line003).toBe(3_600_000)
    expect(t.line004).toBe(135_000)
    expect(t.rows.reduce((s, r) => s + r.j, 0)).toBe(t.line002)
    expect(t.rows.reduce((s, r) => s + r.k, 0)).toBe(t.line003)
  })

  it('нулевой доход не делит на ноль', () => {
    const t = form910Taxes([{ ratePercent: 4, income: 0 }])
    expect(t.line004).toBe(0)
    expect(t.rows[0].i).toBe(0)
  })
})

describe('взносы ИП при минимальной базе', () => {
  it('85 000: ОПВ 8 500, ОПВР 2 975, СО 4 250, ВОСМС 5 950, итого 21 675', () => {
    const m = minimumBaseMonthly()
    expect(m).toEqual({ base: 85_000, opv: 8_500, opvr: 2_975, so: 4_250, vosms: 5_950, total: 21_675 })
    expect(VOSMS_MONTHLY).toBe(5_950)
  })

  it('совпадает с калькулятором налогов ИП (ipTaxes.ts) при той же базе', () => {
    const c = calculateIpTaxes({
      monthlyIncome: 1_000_000,
      contributionBase: MZP_2026,
      bornBefore1975: false,
      taxRatePercent: 4,
    })
    const m = minimumBaseMonthly()
    expect(m.opv).toBe(c.opv)
    expect(m.opvr).toBe(c.opvr)
    expect(m.so).toBe(c.so)
    // на минимальной базе основной расчёт (ГФСС) и вариант «по тексту закона» совпадают
    expect(m.so).toBe(c.soLaw)
    expect(m.total).toBe(c.contributionsLaw)
    expect(c.difference).toBe(0)
    expect(m.vosms).toBe(c.vosms)
    expect(m.total).toBe(c.contributionsMonthly)
    expect(c.taxHalfYear).toBe(240_000)
  })

  it('строки 005-010: шесть месяцев и сумма VII', () => {
    const lines = minimumBaseContributionLines()
    expect(lines.map(l => l.line)).toEqual([
      '910.00.005', '910.00.006', '910.00.007', '910.00.008', '910.00.009', '910.00.010',
    ])
    for (const l of lines) {
      expect(l.months).toHaveLength(6)
      expect(l.total).toBe(l.months.reduce((s, v) => s + v, 0))
    }
    expect(lines.find(l => l.key === 'opv')!.total).toBe(51_000)
    expect(lines.find(l => l.key === 'opvr')!.total).toBe(17_850)
    expect(lines.find(l => l.key === 'so')!.total).toBe(25_500)
    expect(lines.find(l => l.key === 'vosms')!.total).toBe(35_700)
    expect(lines.find(l => l.key === 'soIncome')!.total).toBe(510_000)
  })
})

describe('пример на странице', () => {
  const ex = formaExample()

  it('налог 240 000, взносы 130 050 за полугодие, всего 370 050', () => {
    expect(ex.income).toBe(EXAMPLE_HALF_YEAR_INCOME)
    expect(ex.taxes.line004).toBe(240_000)
    expect(ex.monthly.total).toBe(21_675)
    expect(ex.contributionsHalfYear).toBe(130_050)
    expect(ex.grandTotal).toBe(370_050)
  })

  it('согласован с гайдом nalogi-ip-uproshchenka-2026: 1 000 000 в месяц -> налог 40 000, взносы 21 675', () => {
    expect(ex.monthlyIncome).toBe(1_000_000)
    expect(ex.taxes.line004 / 6).toBe(40_000)
    expect(ex.monthly.total).toBe(21_675)
  })
})

describe('падеж казахских месяцев', () => {
  it('«до» для дат страницы', () => {
    expect(formatKkDateDative('2027-02-15')).toBe('2027 жылғы 15 ақпанға')
    expect(formatKkDateDative('2027-02-25')).toBe('2027 жылғы 25 ақпанға')
    expect(formatKkDateDative('2026-08-17')).toBe('2026 жылғы 17 тамызға')
  })

  it('«дейін» в казахских текстах гайда никогда не стоит после именительного падежа месяца', () => {
    const kk = FORMA910_GUIDE.kk
    const text = [kk.summary!, ...kk.faq!.map(f => f.a)].join(' ')
    expect(text).not.toMatch(/жылғы \d+ (қаңтар|ақпан|наурыз|сәуір|мамыр|маусым|шілде|тамыз|қыркүйек|қазан|қараша|желтоқсан) дейін/)
    expect(kk.faq![1].a).toContain('2026 жылғы 17 тамызға дейін')
  })
})

describe('запись в реестре гайдов', () => {
  const guide = getGuide('forma-910-uproshchenka-2026')!

  it('зарегистрирована один раз и питает sitemap через реестр', () => {
    expect(guide).toBe(FORMA910_GUIDE)
    expect(GUIDES.filter(g => g.slug === 'forma-910-uproshchenka-2026')).toHaveLength(1)
    expect(guide.updated).toBe(F910_CHECKED)
  })

  it('связи: инструмент nalogi, гайды про налоги ИП и МРП существуют', () => {
    expect(guide.relatedTools).toEqual(expect.arrayContaining(['nalogi']))
    for (const t of guide.relatedTools) expect(LOCALIZED_TOOL_SLUGS).toContain(t)
    expect(guide.relatedGuides).toEqual(expect.arrayContaining(['nalogi-ip-uproshchenka-2026', 'mrp-2026']))
    for (const r of guide.relatedGuides) {
      expect(getGuide(r), r).toBeDefined()
      expect(r).not.toBe(guide.slug)
    }
  })

  for (const lang of ['ru', 'kk'] as const) {
    it(`${lang}: title <= 60, description <= 155, summary 40-60 слов, 4-5 FAQ с ответами >= 10 слов`, () => {
      const c = guide[lang]
      expect(c.title.length).toBeLessThanOrEqual(60)
      expect(c.description.length).toBeLessThanOrEqual(155)
      expect(words(c.summary!)).toBeGreaterThanOrEqual(40)
      expect(words(c.summary!)).toBeLessThanOrEqual(60)
      const faq = c.faq!
      expect(faq.length).toBeGreaterThanOrEqual(4)
      expect(faq.length).toBeLessThanOrEqual(5)
      for (const f of faq) {
        expect(f.q.trim().endsWith('?'), f.q).toBe(true)
        expect(words(f.a), f.q).toBeGreaterThanOrEqual(10)
      }
      expect(new Set(faq.map(f => f.q)).size).toBe(faq.length)
    })

    it(`${lang}: без длинных и средних тире и эмодзи, числа и даты берутся из модуля`, () => {
      const c = guide[lang]
      const all = [c.title, c.description, c.shortTitle, c.summary!, ...c.faq!.flatMap(f => [f.q, f.a])]
      const text = all.join(' ')
      expect(text).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
      expect(c.faq!.map(f => f.a).join(' ')).toContain(formatTenge(LATE_FILING_FINE_TENGE))
      expect(c.faq!.map(f => f.a).join(' ')).toContain('2027')
      expect(c.summary!).toContain('2027')
    })
  }

  it('нулевая форма: оговорка про перечень форм в кабинете (ст. 115 п. 2) в ru и kk', () => {
    const ruFaq = guide.ru.faq![3].a
    const kkFaq = guide.kk.faq![3].a
    expect(ruFaq).toContain('перечень форм')
    expect(ruFaq).toContain('пункт 2')
    expect(ruFaq).toContain('полагаться на это не стоит')
    expect(kkFaq).toContain('тізбесіне')
    expect(kkFaq).toContain('2-тармағы')
    expect(kkFaq).toContain('сенбеңіз')
  })

  it('штраф 30 МРП: оговорка про 300 000 МРП и 45 МРП в ru и kk', () => {
    expect(guide.ru.faq![3].a).toMatch(/300.000 МРП в год/)
    expect(guide.ru.faq![3].a).toContain('45 МРП')
    expect(guide.kk.faq![3].a).toMatch(/300.000 АЕК/)
    expect(guide.kk.faq![3].a).toContain('45 АЕК')
  })

  it('нет неподтверждённого способа входа Digital ID', () => {
    for (const lang of ['ru', 'kk'] as const) {
      const c = guide[lang]
      const text = [c.summary!, ...c.faq!.map(f => f.a)].join(' ')
      expect(text).not.toMatch(/Digital ID/i)
    }
  })

  it('ru и kk: одинаковое число вопросов', () => {
    expect(guide.ru.faq!.length).toBe(guide.kk.faq!.length)
  })

  it('llms.txt содержит гайд при любом значении флага', () => {
    expect(buildLlmsTxt(false)).toContain('https://invoices.kz/guides/forma-910-uproshchenka-2026')
    expect(buildLlmsTxt(true)).toContain('https://invoices.kz/guides/forma-910-uproshchenka-2026')
  })
})
