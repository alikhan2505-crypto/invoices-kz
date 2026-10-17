import { describe, expect, it } from 'vitest'
import { BUSINESS_ARTICLE_NAMES, BUSINESS_STARTER_PNL_GROUP, FAMILY_ARTICLES, displayName, familyPnlGroup, planModeSwitch, reportPnlGroup, vocab } from './mode'

const a = (id: string, name: string, archived = false, kind: 'income' | 'expense' = 'expense') => ({ id, name, kind, archived })

describe('planModeSwitch', () => {
  it('to family: adds missing family articles, archives unused business ones, keeps used and shared names', () => {
    const articles = [a('1', 'Выручка от услуг', false, 'income'), a('2', 'Аренда'), a('3', 'Зарплата'), a('4', 'Прочие доходы', false, 'income'), a('5', 'Моя статья')]
    const plan = planModeSwitch(articles, new Set(['2']), 'family', BUSINESS_ARTICLE_NAMES)
    // аренда используется — остаётся; бизнес-«Зарплата» (расход) уходит в архив; «Прочие доходы» общие; своя статья не трогается
    expect(plan.archive).toEqual(['1', '3'])
    expect(plan.add.find((x) => x.name === 'Зарплата')?.kind).toBe('income') // семейная зарплата — доход, добавляется
    expect(plan.add.map((x) => x.name)).toContain('Продукты')
    expect(plan.add).toHaveLength(FAMILY_ARTICLES.length - 1) // уже есть только «Прочие доходы»
  })
  it('back to business: restores archived business articles and archives unused family-only ones', () => {
    const articles = [a('1', 'Выручка от услуг', true, 'income'), a('2', 'Продукты'), a('3', 'Кафе и доставка еды'), a('4', 'Зарплата', false, 'income')]
    const plan = planModeSwitch(articles, new Set(['3']), 'business', BUSINESS_ARTICLE_NAMES)
    expect(plan.restore).toEqual(['1'])
    expect(plan.archive).toEqual(['2', '4']) // семейная «Зарплата» — доход, а в бизнесе «Зарплата» — расход: в архив
    expect(plan.add).toEqual([])
  })
  it('to family: does not duplicate the owner own similar articles, but replaces archived starter ones', () => {
    const articles = [a('1', 'Продукты питания'), a('2', 'Оплата за школу'), a('3', 'Связь и интернет'), a('4', 'Заработная плата', false, 'income')]
    const names = planModeSwitch(articles, new Set(['1']), 'family', BUSINESS_ARTICLE_NAMES).add.map((x) => x.name)
    expect(names).not.toContain('Продукты')
    expect(names).not.toContain('Дети и образование')
    expect(names).not.toContain('Зарплата')
    expect(names).toContain('Связь и подписки') // бизнес-«Связь и интернет» не используется и уходит в архив
  })
  it('to family again: archives earlier-added family starters that duplicate the owner own articles', () => {
    const articles = [a('1', 'Продукты питания'), a('2', 'Продукты'), a('3', 'Кафе'), a('4', 'Кафе и доставка еды'), a('5', 'Транспорт и такси')]
    const plan = planModeSwitch(articles, new Set(['1', '3', '4']), 'family', BUSINESS_ARTICLE_NAMES)
    expect(plan.archive).toEqual(['2']) // «Кафе и доставка еды» уже используется — не трогаем
  })
  it('a business starter kept only because it is in use does not count as the owner own article (QA P2-9: «Налоги и сборы» was archived)', () => {
    // «Налог на доход» — стартовая бизнес-статья с операциями; раньше её слово «налог» «съедало» семейную «Налоги и сборы».
    const articles = [a('tax', 'Налог на доход (ИПН ИП / КПН)'), a('fam', 'Налоги и сборы'), a('rent', 'Аренда')]
    const plan = planModeSwitch(articles, new Set(['tax']), 'family', BUSINESS_ARTICLE_NAMES)
    expect(plan.archive).toEqual(['rent'])
    expect(plan.archive).not.toContain('fam')
    // И при первом переходе семейная «Налоги и сборы» добавляется, несмотря на используемый «Налог на доход».
    const first = planModeSwitch([a('tax', 'Налог на доход (ИПН ИП / КПН)')], new Set(['tax']), 'family', BUSINESS_ARTICLE_NAMES)
    expect(first.add.map((x) => x.name)).toContain('Налоги и сборы')
  })
  it('never archives an article that is in use, in either direction', () => {
    const toFamily = planModeSwitch([a('x', 'Реклама и маркетинг')], new Set(['x']), 'family', BUSINESS_ARTICLE_NAMES)
    expect(toFamily.archive).toEqual([])
    const toBusiness = planModeSwitch([a('y', 'Продукты')], new Set(['y']), 'business', BUSINESS_ARTICLE_NAMES)
    expect(toBusiness.archive).toEqual([])
  })
})

describe('report-level family grouping (P1-1: stored pnl_group is never rewritten)', () => {
  it('maps every income to revenue and every expense to opex, debts stay out', () => {
    expect(familyPnlGroup({ kind: 'expense', pnlGroup: 'cogs' })).toBe('opex')
    expect(familyPnlGroup({ kind: 'expense', pnlGroup: 'tax' })).toBe('opex')
    expect(familyPnlGroup({ kind: 'expense', pnlGroup: 'finance' })).toBe('opex')
    expect(familyPnlGroup({ kind: 'income', pnlGroup: 'finance' })).toBe('revenue')
    expect(familyPnlGroup({ kind: 'income', pnlGroup: 'revenue' })).toBe('revenue')
    expect(familyPnlGroup({ kind: 'income', pnlGroup: null })).toBeNull()
  })
  it('business mode reads the stored group as is', () => {
    expect(reportPnlGroup({ kind: 'expense', pnlGroup: 'cogs' }, 'business')).toBe('cogs')
    expect(reportPnlGroup({ kind: 'expense', pnlGroup: 'cogs' }, undefined)).toBe('cogs')
    expect(reportPnlGroup({ kind: 'expense', pnlGroup: 'cogs' }, 'family')).toBe('opex')
  })
  it('repair map covers exactly the groups the old switch used to overwrite', () => {
    expect(BUSINESS_STARTER_PNL_GROUP).toEqual({
      'закупка товаров и материалов': 'cogs',
      'налог на доход (ипн ип / кпн)': 'tax',
      'ндс к уплате': 'tax',
      'прочие доходы': 'finance',
      'проценты по кредитам': 'finance',
    })
    for (const name of Object.keys(BUSINESS_STARTER_PNL_GROUP)) expect(BUSINESS_ARTICLE_NAMES.has(name)).toBe(true)
  })
})

describe('vocab and displayName', () => {
  it('family words replace business ones', () => {
    expect(vocab('family').counterparty).toBe('Кому или от кого')
    expect(vocab('business').counterparty).toBe('Контрагент')
    expect(vocab(undefined).pnl).toBe('БДР')
    expect(vocab('family').nameEmpty).toBe('Введите название')
    expect(vocab('family').gap).not.toContain('Кассовый')
  })
  it('default company name becomes «Семейный бюджет» only in family mode', () => {
    expect(displayName({ companyName: 'Моя компания', mode: 'family' })).toBe('Семейный бюджет')
    expect(displayName({ companyName: 'Моя компания', mode: 'business' })).toBe('Моя компания')
    expect(displayName({ companyName: 'Бюджет Ахметовых', mode: 'family' })).toBe('Бюджет Ахметовых')
  })
})
