import { describe, it, expect } from 'vitest'
import { personRequestText as T } from './requestText'

// Тексты блока «Запросить справки» не должны обещать того, чего источники не
// подтверждают: см. комментарий в начале requestText.ts.
describe('requestText: без лишних обещаний', () => {
  const all = JSON.stringify(T)

  it('ссылка на услугу ведёт на проверенную страницу gov.kz, а не на неподтверждённый адрес формы', () => {
    expect(T.serviceHref).toBe('https://www.gov.kz/services/3934')
    expect(all).not.toContain('SR.11')
  })

  it('окно ответа человека 2 часа, как на странице услуги', () => {
    expect(T.windowMs).toBe(2 * 3_600_000)
    expect(T.steps.map(s => s.text).join(' ')).toContain('2 часов')
  })

  it('мы ничего не получаем и не храним: сказано прямо', () => {
    expect(T.lead).toMatch(/не получаем, не видим и не храним/)
  })

  it('судимости в личном деле работника нет, «все данные» не обещаем', () => {
    expect(T.enbek.fields.join(' ')).not.toMatch(/судим/i)
    expect(T.enbek.notThere).toMatch(/Судимости в этом списке нет/)
    expect(all).not.toMatch(/видите все данные|все данные работника открыты/i)
  })

  it('запрет на выезд для чужого ИИН не обещается', () => {
    expect(T.exitBan.text).toMatch(/не подтверждают/)
  })

  it('таймер показывает время в Алматы и минуты', () => {
    expect(T.timerLeft('14:30', 90)).toBe('Человек должен ответить до 14:30 (Алматы), осталось 90 мин')
  })
})
