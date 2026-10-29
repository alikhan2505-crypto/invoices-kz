import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BIN_CHECK_CHECKED,
  BIN_CHECK_GUIDE,
  BIN_CHECK_SLUG,
  BIN_CHECK_URL_RU,
  BIN_REGISTERS,
  COVERAGE_LABEL,
  FREE_CHECKS_PER_QUARTER,
  RESULT_CACHE_HOURS,
  registersByCoverage,
  type RegisterId,
} from './binCheck'
import { kontragentDict } from '@/app/tools/kontragent/dict'
import {
  KGD_DEBT_URL,
  KGD_LIQUIDATION_URL,
  KGD_SNR_URL,
  KGD_TAXPAYER_URL,
  KGD_UNRELIABLE_URL,
  KGD_VAT_URL,
  parseTaxpayer,
} from './kgdTaxpayer'
import { toLookupResult } from './binLookup'
import { getGuide, GUIDES, guideAlternates, guideJsonLdData } from './guides'
import { buildLlmsTxt } from './llmsTxt'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'

const words = (s: string) => s.trim().split(/\s+/).length
const root = process.cwd()

describe('гайд «проверка компании по БИН»: константы', () => {
  it('slug и дата проверки', () => {
    expect(BIN_CHECK_SLUG).toBe('proverka-kompanii-po-bin-chto-mozhno-uznat')
    expect(BIN_CHECK_CHECKED).toBe('2026-10-25')
    expect(BIN_CHECK_GUIDE.updated).toBe(BIN_CHECK_CHECKED)
    expect(BIN_CHECK_URL_RU).toBe(`/guides/${BIN_CHECK_SLUG}`)
  })

  it('не повторяет slug гайда proverka-kontragenta', () => {
    expect(BIN_CHECK_SLUG).not.toBe('proverka-kontragenta')
    expect(BIN_CHECK_GUIDE.relatedGuides).toContain('proverka-kontragenta')
  })
})

describe('реестры: данные', () => {
  it('id уникальны, адреса https, тексты на двух языках непустые', () => {
    expect(new Set(BIN_REGISTERS.map(r => r.id)).size).toBe(BIN_REGISTERS.length)
    for (const r of BIN_REGISTERS) {
      for (const lang of ['ru', 'kk'] as const) {
        expect(r.question[lang].trim().length, `${r.id} question ${lang}`).toBeGreaterThan(5)
        expect(r.where[lang].trim().length, `${r.id} where ${lang}`).toBeGreaterThan(5)
        expect(r.toolNote[lang].trim().length, `${r.id} note ${lang}`).toBeGreaterThan(5)
        expect(r.url[lang], `${r.id} url ${lang}`).toMatch(/^https:\/\//)
      }
      expect(Object.keys(COVERAGE_LABEL)).toContain(r.coverage)
    }
  })

  it('покрытие (25.10.2026): три проверяются, шесть частично, две нет', () => {
    const ids = (c: 'yes' | 'partial' | 'no') => registersByCoverage(c).map(r => r.id)
    expect(ids('yes')).toEqual(['liquidation', 'unreliable', 'tax-regime'])
    // debtors: только открытые данные Минюста; bankruptcy: только суд-банкротство из списка КГД, реабилитации нет.
    expect(ids('partial')).toEqual(['legal-entities', 'taxpayer', 'tax-debt', 'vat', 'debtors', 'bankruptcy'])
    expect(ids('no')).toEqual(['permits', 'false-deals'])
  })

  it('адреса КГД ведут на страницы сервисов портала, kk-адрес на kk-версию', () => {
    for (const r of BIN_REGISTERS.filter(x => x.url.ru.includes('portal.kgd.gov.kz'))) {
      expect(r.url.ru, r.id).toContain('/ru/pages/')
      expect(r.url.kk, r.id).toContain('/kk/pages/')
    }
  })

  it('лицензии и сделки без выполнения работ в таблице есть и помечены «Нет»', () => {
    for (const id of ['permits', 'false-deals'] as RegisterId[]) {
      const r = BIN_REGISTERS.find(x => x.id === id)!
      expect(r.coverage).toBe('no')
      expect(r.toolNote.ru).toContain('Не проверяет')
      expect(r.toolNote.kk).toContain('Тексермейді')
    }
  })

  it('реестр должников и банкротство помечены «Частично» и честно называют границу', () => {
    const debtors = BIN_REGISTERS.find(x => x.id === 'debtors')!
    expect(debtors.coverage).toBe('partial')
    expect(debtors.toolNote.ru).toContain('без имён')
    expect(debtors.toolNote.ru).toContain('открытых данных')
    const bankruptcy = BIN_REGISTERS.find(x => x.id === 'bankruptcy')!
    expect(bankruptcy.coverage).toBe('partial')
    expect(bankruptcy.toolNote.ru).toContain('Реабилитационную процедуру проверяет по списку КГД')
    expect(bankruptcy.toolNote.kk).toContain('Оңалту рәсімін МКК тізімі бойынша тексереді')
  })

  it('налоговый режим помечен «Да», но с оговоркой про даты с 1 января 2026 и про «не удалось проверить»', () => {
    const r = BIN_REGISTERS.find(x => x.id === 'tax-regime')!
    expect(r.coverage).toBe('yes')
    expect(r.toolNote.ru).toContain('1 января 2026')
    expect(r.toolNote.ru).toContain('не удалось проверить')
  })
})

describe('утверждения о покрытии соответствуют коду инструмента', () => {
  it('инструмент ходит в сервисы КГД для ликвидации, неблагонадёжных, долга и НДС', () => {
    expect(KGD_LIQUIDATION_URL).toContain('find-liquidated-taxpayer')
    expect(KGD_UNRELIABLE_URL).toContain('taxpayer-data/search')
    expect(KGD_DEBT_URL).toContain('tax-debt-info')
    expect(KGD_VAT_URL).toContain('search-payer-data')
    expect(KGD_TAXPAYER_URL).toContain('taxpayer-data')
  })

  it('новые проверки ходят в сервис режимов и в SOAP-сервис Минюста', () => {
    expect(KGD_SNR_URL).toContain('snr-search')
    const extra = readFileSync(join(root, 'src/lib/binExtraChecks.ts'), 'utf8')
    expect(extra).toContain('?uin=')
    const aisoip = readFileSync(join(root, 'src/lib/aisoip.ts'), 'utf8')
    expect(aisoip).toContain('ODWebServiceImpl')
    expect(aisoip).toContain('<indexName>aisoip</indexName>')
  })

  it('на экране есть вердикты для неблагонадёжных, банкротства, ликвидации, долга, НДС, режима и производств; лицензии только ссылкой; судов и штрафов нет', () => {
    const t = kontragentDict.ru
    for (const part of [t.unreliable, t.bankruptcy, t.liquidation, t.arrear, t.vat, t.regime, t.enforcement, t.permits]) {
      expect(part.label).toBeTruthy()
    }
    // У лицензий нет «ok»/«bad»: состояния «проверено, чисто» быть не может, только ссылка.
    expect(Object.keys(t.permits).sort()).toEqual(['label', 'link', 'text'])
    const text = JSON.stringify(Object.keys(t)).toLowerCase()
    for (const word of ['fine', 'court', 'falsedeal']) {
      expect(text, word).not.toContain(word)
    }
  })

  it('реабилитация: строка рисуется только при наличии поля rehabilitation в ответе (без таблицы поле не приходит)', () => {
    // С 29.10.2026 таблица kgd_rehabilitation_debtors применена и заполнена, тексты гайда и инструмента
    // говорят, что реабилитацию проверяем. Без таблицы API по-прежнему не отдаёт поле и строка не рисуется.
    const tool = readFileSync(join(root, 'src/app/tools/kontragent/KontragentTool.tsx'), 'utf8')
    expect(tool).toContain('c.rehabilitation !== undefined')
    const lib = readFileSync(join(root, 'src/lib/kgdRehabilitation.ts'), 'utf8')
    expect(lib).toContain('isMissingRehabTable(fresh.error)')
  })

  it('у всех проверок с результатом есть третье состояние «не удалось проверить» на всех языках', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = kontragentDict[lang]
      expect(t.unknown.length, lang).toBeGreaterThan(10)
      expect(t.bankruptcy.unknown.length, lang).toBeGreaterThan(10)
      expect(t.regime.unknown.length, lang).toBeGreaterThan(10)
      expect(t.enforcement.unknown.length, lang).toBeGreaterThan(10)
      expect(t.arrear.unknown.length, lang).toBeGreaterThan(10)
      expect(t.vat.unknown.length, lang).toBeGreaterThan(10)
    }
  })

  it('исполнительные производства: ссылка на источник data.egov.kz (условие портала) и ни одного имени', () => {
    const t = kontragentDict.ru.enforcement
    expect(t.sourceLink).toContain('data.egov.kz')
    expect(t.sourcePrefix).toBeTruthy()
    const bad = t.bad('2', '1', '1 000 ₸', '01.01.2026')
    expect(bad).toContain('2')
    expect(bad).toContain('без даты окончания: 1')
    expect(bad).toContain('1 000 ₸')
    expect(bad).toContain('01.01.2026')
    // сумму и дату можно не знать
    expect(t.bad('1', '1', null, null)).not.toMatch(/null|undefined/)
  })

  it('исполнительные производства и режим: строки не содержат тире, в строках словаря нет эмодзи (кроме уже существовавшей замочка)', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = kontragentDict[lang]
      const fresh = [
        t.bankruptcy.label, t.bankruptcy.ok, t.bankruptcy.bad, t.bankruptcy.unknown,
        t.regime.label, t.regime.unknown, t.regime.datesNote, t.regime.since('X'), t.regime.until('X'),
        t.enforcement.label, t.enforcement.ok, t.enforcement.bad('1', '1', '2 ₸', 'X'), t.enforcement.unknown,
        t.enforcement.asOfNote, t.enforcement.ipNote,
        t.enforcement.sourcePrefix, t.enforcement.sourceLink, t.enforcement.manualLink,
        t.permits.label, t.permits.text, t.permits.link, t.unreliable.reasons('X'),
      ].join(' ')
      expect(fresh, lang).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(fresh), lang).toBe(false)
    }
  })

  it('НДС: только «плательщик с даты» и «не плательщик», без даты и причины снятия', () => {
    expect(Object.keys(kontragentDict.ru.vat).sort()).toEqual(['label', 'notPayer', 'payer', 'unknown'])
    expect(kontragentDict.ru.vat.notPayer.toLowerCase()).not.toContain('снят')
  })

  it('долг: одна сумма и часть «из них налоги», без пени и штрафа', () => {
    const bad = kontragentDict.ru.arrear.bad('1 000 ₸', '400 ₸').toLowerCase()
    expect(bad).toContain('1 000 ₸')
    expect(bad).not.toContain('штраф')
    expect(bad).not.toContain('пен')
  })

  it('ИП из КГД: берутся только наименование и дата начала, конец регистрации отбрасывается', () => {
    const parsed = parseTaxpayer({
      taxpayerPortalSearchResponses: [
        {
          messageResult: 'SUCCESS',
          name: 'ИП Тест',
          beginDate: '2020-01-01',
          endDate: '2025-01-01',
          endReasonCode: '101',
          taxpayerType: 'IP',
        },
      ],
    })
    expect(parsed).toEqual({ name: 'ИП Тест', registeredAt: '2020-01-01', taxpayerType: 'IP' })
  })

  it('результат реестра юрлиц не содержит полей про лицензии, штрафы, суды', () => {
    const r = toLookupResult('971240001315', [
      { bin: '971240001315', nameru: 'Тест', statusru: 'Зарегистрирован', datereg: '1997-12-04+06:00' },
    ])!
    const keys = Object.keys(r).join(' ').toLowerCase()
    for (const word of ['licen', 'fine', 'court', 'debtor', 'bankrupt']) expect(keys, word).not.toContain(word)
  })
})

describe('данные: источники и даты в комментарии', () => {
  const src = readFileSync(join(root, 'src/lib/binCheck.ts'), 'utf8')

  it('в комментарии файла есть статьи и дата проверки', () => {
    expect(src).toContain('25.10.2026')
    for (const ref of ['ст. 108', 'ст. 287', 'ст. 480', 'ст. 482', 'ст. 483', 'ст. 137', 'ст. 716', 'ст. 1, п. 21', 'ст. 7, п. 3', 'ст. 28']) {
      expect(src, ref).toContain(ref)
    }
    expect(src).toContain('UNVERIFIED')
  })

  it('первая строка вычитки kk-страницы и файла данных', () => {
    const kk = readFileSync(
      join(root, 'src/app/guides/kk/proverka-kompanii-po-bin-chto-mozhno-uznat/page.tsx'),
      'utf8',
    )
    expect(kk.split('\n')[0]).toBe('// kk: вычитка носителем ждёт основателя')
    expect(src).toContain('kk: вычитка носителем ждёт основателя')
  })

  it('МРП и МЗП в тексты не зашиты (только из mrp.ts)', () => {
    const c = [BIN_CHECK_GUIDE.ru, BIN_CHECK_GUIDE.kk]
    const text = c.flatMap(x => [x.title, x.description, x.summary!, ...x.faq!.flatMap(f => [f.q, f.a])]).join(' ')
    expect(text).not.toMatch(/4[\s ]?325|85[\s ]?000/)
  })
})

describe('лимиты бесплатной проверки совпадают с кодом инструмента', () => {
  it('3 проверки в квартал на IP (route.ts) и кэш 24 часа (binLookupServer.ts)', () => {
    const route = readFileSync(join(root, 'src/app/api/tools/kontragent/route.ts'), 'utf8')
    const lookup = readFileSync(join(root, 'src/lib/binLookupServer.ts'), 'utf8')
    expect(Number(/const QUARTER_PER_IP = (\d+)/.exec(route)![1])).toBe(FREE_CHECKS_PER_QUARTER)
    expect(/const CACHE_TTL_MS = (\d+) \* 60 \* 60 \* 1000/.exec(lookup)![1]).toBe(String(RESULT_CACHE_HOURS))
  })

  it('обе страницы называют лимит и кэш из констант', () => {
    for (const p of [
      `src/app/guides/${BIN_CHECK_SLUG}/page.tsx`,
      `src/app/guides/kk/${BIN_CHECK_SLUG}/page.tsx`,
    ]) {
      const text = readFileSync(join(root, p), 'utf8')
      expect(text, p).toContain('{FREE_CHECKS_PER_QUARTER}')
      expect(text, p).toContain('{RESULT_CACHE_HOURS}')
    }
  })

  it('на страницах нет ошибочного «29 сервисов, из них 15 с API» и общего обещания про молчание реестров', () => {
    const ru = readFileSync(join(root, `src/app/guides/${BIN_CHECK_SLUG}/page.tsx`), 'utf8')
    const kk = readFileSync(join(root, `src/app/guides/kk/${BIN_CHECK_SLUG}/page.tsx`), 'utf8')
    expect(ru).not.toContain('из них 15')
    expect(kk).not.toContain('оның 15-і')
    expect(ru).not.toContain('Если реестр не')
    expect(ru.replace(/\s+/g, ' ')).toContain('снимали с учёта и ставили снова')
    expect(kk.replace(/\s+/g, ' ')).toContain('қайта қойылған болса')
  })
})

describe('страницы существуют в обоих языках', () => {
  it('ru и kk page.tsx на месте', () => {
    expect(existsSync(join(root, `src/app/guides/${BIN_CHECK_SLUG}/page.tsx`))).toBe(true)
    expect(existsSync(join(root, `src/app/guides/kk/${BIN_CHECK_SLUG}/page.tsx`))).toBe(true)
  })

  it('страницы не содержат тире, эмодзи и цифр спроса', () => {
    for (const p of [
      `src/app/guides/${BIN_CHECK_SLUG}/page.tsx`,
      `src/app/guides/kk/${BIN_CHECK_SLUG}/page.tsx`,
    ]) {
      const text = readFileSync(join(root, p), 'utf8')
      expect(text, p).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(text), p).toBe(false)
      expect(text.toLowerCase(), p).not.toContain('вордстат')
      expect(text.toLowerCase(), p).not.toContain('wordstat')
    }
  })
})

describe('запись гайда: качество по реестру', () => {
  const guide = BIN_CHECK_GUIDE

  it('связи: инструменты kontragent и schet, связанные гайды существуют', () => {
    expect(guide.relatedTools).toEqual(['kontragent', 'schet'])
    for (const t of guide.relatedTools) expect(LOCALIZED_TOOL_SLUGS).toContain(t)
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

    it(`${lang}: без длинных и средних тире и эмодзи`, () => {
      const c = guide[lang]
      const text = [c.title, c.description, c.shortTitle, c.summary!, ...c.faq!.flatMap(f => [f.q, f.a])].join(' ')
      expect(text).not.toMatch(/[–—]/)
      expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false)
    })
  }

  it('ru и kk: одинаковое число вопросов', () => {
    expect(guide.ru.faq!.length).toBe(guide.kk.faq!.length)
  })

  it('честность: в ответе про инструмент названо, что он делает и что НЕ проверяет (ru и kk)', () => {
    const ru = guide.ru.faq![3].a
    for (const w of ['налоговый режим', 'исполнительные производства', 'причиной', 'лицензии', 'реабилитационную процедуру', 'суды']) {
      expect(ru, w).toContain(w)
    }
    expect(ru).toContain('не проверяет')
    const kk = guide.kk.faq![3].a
    for (const w of ['салық режимін', 'атқарушылық өндірісті', 'себебімен', 'лицензияларды', 'оңалту рәсімін', 'соттарды']) {
      expect(kk, w).toContain(w)
    }
    expect(kk).toContain('тексермейді')
  })

  it('честность: в резюме сказано, что лицензии и суды инструмент не проверяет, а реабилитацию проверяет', () => {
    expect(guide.ru.summary).toContain('лицензии и суды не проверяет')
    expect(guide.kk.summary).toContain('соттарды тексермейді')
  })

  it('резюме и описание ведут с штрафов, лицензий, долга и НДС, а не пересказывают список из гайда proverka-kontragenta', () => {
    expect(guide.ru.summary).toContain('штрафы по БИН')
    expect(guide.ru.summary).not.toContain('первые пять пунктов')
    expect(guide.kk.summary).not.toContain('алғашқы бес тармақты')
  })

  it('честность: «не удалось проверить» обещано только для проверок КГД и Минюста, при сбое регистрации сказано про «ничего не нашлось»', () => {
    expect(guide.ru.faq![3].a).toContain('сервис КГД или Минюста')
    expect(guide.ru.faq![3].a).toContain('ничего не нашлось')
    expect(guide.kk.faq![3].a).toContain('МКК немесе Әділет министрлігі қызметі')
    expect(guide.kk.faq![3].a).toContain('ештеңе табылмады')
  })

  it('страницы гайда описывают новые проверки (категории, режим, открытые данные Минюста) и не говорят «не проверяет» про них', () => {
    const ru = readFileSync(join(root, `src/app/guides/${BIN_CHECK_SLUG}/page.tsx`), 'utf8').replace(/\s+/g, ' ')
    expect(ru).toContain('Инструмент его использует')
    expect(ru).toContain('reestr_dolzh_po_isp_pr')
    expect(ru).toContain('по открытым данным Минюста')
    expect(ru).not.toContain('Инструмент этот реестр не проверяет')
    expect(ru).not.toContain('Инструмент его не использует')
    const kk = readFileSync(join(root, `src/app/guides/kk/${BIN_CHECK_SLUG}/page.tsx`), 'utf8').replace(/\s+/g, ' ')
    expect(kk).toContain('Құрал оны пайдаланады')
    expect(kk).toContain('reestr_dolzh_po_isp_pr')
    expect(kk).not.toContain('Құрал бұл тізілімді тексермейді')
    expect(kk).not.toContain('Құрал оны пайдаланбайды')
  })

  it('НДС: в ответе есть оговорка про повторную постановку на учёт (инструмент читает последние даты КГД)', () => {
    expect(guide.ru.faq![2].a).toContain('повторной постановке на учёт')
    expect(guide.kk.faq![2].a).toContain('қайта қойылса')
  })

  it('штрафы: вывод «единого реестра нет» и ссылка на долг КГД в ru и kk', () => {
    expect(guide.ru.faq![0].a).toContain('Единого публичного реестра')
    expect(guide.ru.faq![0].a).toContain('налоговой задолженности')
    expect(guide.kk.faq![0].a).toContain('Бірыңғай ашық')
    expect(guide.kk.faq![0].a).toContain('салық берешегіне')
  })

  it('НДС: зачёт по дате выписки, статья 480 пункт 6', () => {
    expect(guide.ru.faq![2].a).toContain('статья 480, пункт 6')
    expect(guide.kk.faq![2].a).toContain('480-бап, 6-тармақ')
  })
})

describe('разметка и ссылки', () => {
  it('FAQ JSON-LD повторяет видимые вопросы и ответы', () => {
    for (const lang of ['ru', 'kk'] as const) {
      const graph = guideJsonLdData(BIN_CHECK_GUIDE, lang)['@graph'] as Record<string, unknown>[]
      const faq = graph.find(n => n['@type'] === 'FAQPage') as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[]
      }
      expect(faq.mainEntity.map(q => q.name)).toEqual(BIN_CHECK_GUIDE[lang].faq!.map(f => f.q))
      expect(faq.mainEntity.map(q => q.acceptedAnswer.text)).toEqual(BIN_CHECK_GUIDE[lang].faq!.map(f => f.a))
    }
  })

  it('hreflang: ru, kk и x-default', () => {
    const a = guideAlternates(BIN_CHECK_SLUG)
    expect(a.ru).toBe(`https://invoices.kz/guides/${BIN_CHECK_SLUG}`)
    expect(a.kk).toBe(`https://invoices.kz/guides/kk/${BIN_CHECK_SLUG}`)
    expect(a['x-default']).toBe(a.ru)
  })
})

describe('подключение к реестру (после того, как контроллер добавит запись)', () => {
  const registered = getGuide(BIN_CHECK_SLUG)

  it.skipIf(!registered)('зарегистрирован один раз и это тот же объект', () => {
    expect(registered).toBe(BIN_CHECK_GUIDE)
    expect(GUIDES.filter(g => g.slug === BIN_CHECK_SLUG)).toHaveLength(1)
  })

  it.skipIf(!registered)('llms.txt содержит гайд при любом значении флага', () => {
    expect(buildLlmsTxt(false)).toContain(`https://invoices.kz/guides/${BIN_CHECK_SLUG}`)
    expect(buildLlmsTxt(true)).toContain(`https://invoices.kz/guides/${BIN_CHECK_SLUG}`)
  })
})
