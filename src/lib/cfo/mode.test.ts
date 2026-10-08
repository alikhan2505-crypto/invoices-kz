import { describe, expect, it } from 'vitest'
import { BUSINESS_ARTICLE_NAMES, FAMILY_ARTICLES, familyRegroup, planModeSwitch } from './mode'

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
})

describe('familyRegroup', () => {
  it('moves business groups of live articles into the family scheme, leaves debts out of the report', () => {
    const arts = [
      { id: 'a', kind: 'expense' as const, activity: 'operating' as const, pnlGroup: 'cogs' as const, archived: false },
      { id: 'b', kind: 'income' as const, activity: 'operating' as const, pnlGroup: 'finance' as const, archived: false },
      { id: 'c', kind: 'expense' as const, activity: 'operating' as const, pnlGroup: 'opex' as const, archived: false },
      { id: 'd', kind: 'income' as const, activity: 'financing' as const, pnlGroup: null, archived: false },
      { id: 'e', kind: 'expense' as const, activity: 'operating' as const, pnlGroup: 'tax' as const, archived: true },
    ]
    expect(familyRegroup(arts)).toEqual([{ id: 'a', pnlGroup: 'opex' }, { id: 'b', pnlGroup: 'revenue' }])
  })
})
