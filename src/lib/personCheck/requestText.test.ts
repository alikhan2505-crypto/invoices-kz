import { describe, it, expect } from 'vitest'
import { personRequestText as T, REQUESTABLE_CERTIFICATES, OTHER_LISTED_CERTIFICATES } from './requestText'

// Тексты блока «Запросить справки» не должны обещать того, чего источники не
// подтверждают: см. комментарий в начале requestText.ts.
describe('requestText: без лишних обещаний', () => {
  const all = JSON.stringify(T)

  it('ссылка заказа ведёт на рабочую страницу P10.01, а не на мёртвый адрес SR.11', () => {
    expect(T.serviceHref).toBe('https://egov.kz/ru/services/presale/P1001')
    expect(T.serviceHref).not.toContain('SR.11')
    expect(T.infoHref).toBe('https://www.gov.kz/services/3934')
    expect(T.infoNote).toMatch(/404/)
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

  it('справки с проверенным заказом: рабочие адреса страниц egov и уникальные коды', () => {
    expect(REQUESTABLE_CERTIFICATES.length).toBeGreaterThanOrEqual(4)
    for (const c of REQUESTABLE_CERTIFICATES) {
      expect(c.href).toMatch(/^https:\/\/egov\.kz\/ru\/services\/presale\/[A-Za-z0-9]+$/)
      expect(c.href).not.toContain('SR.11')
    }
    expect(new Set(REQUESTABLE_CERTIFICATES.map(c => c.id)).size).toBe(REQUESTABLE_CERTIFICATES.length)
    expect(new Set(REQUESTABLE_CERTIFICATES.map(c => c.code)).size).toBe(REQUESTABLE_CERTIFICATES.length)
    expect(T.serviceHref).toBe(REQUESTABLE_CERTIFICATES[0].href) // по умолчанию открывается несудимость
  })

  it('справки без проверенного заказа не получают ссылку и не выдаются за проверенные', () => {
    expect(OTHER_LISTED_CERTIFICATES.length).toBeGreaterThan(10)
    expect(JSON.stringify(OTHER_LISTED_CERTIFICATES)).not.toContain('http')
    expect(T.certsOtherLead).toMatch(/не проверял/)
  })
})
