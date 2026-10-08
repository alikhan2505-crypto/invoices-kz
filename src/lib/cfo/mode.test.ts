import { describe, expect, it } from 'vitest'
import { BUSINESS_ARTICLE_NAMES, FAMILY_ARTICLES, planModeSwitch } from './mode'

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
})
