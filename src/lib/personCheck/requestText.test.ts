import { describe, it, expect } from 'vitest'
import { personRequestText as T, REQUESTABLE_CERTIFICATES, buildPersonMessage } from './requestText'

// Тексты блока «Справки о человеке» не должны обещать того, чего источники не
// подтверждают: см. комментарий в начале requestText.ts. Главный урок 30.10.2026: форма
// egov «Справка о несудимости» не даёт заказать справку на другого человека (только «на себя»,
// «на ребёнка», «на опекаемого»), и текст этого не обещает.
describe('requestText: без лишних обещаний', () => {
  const all = JSON.stringify(T)

  it('не обещает заказ на другого человека через egov и мёртвый адрес SR.11', () => {
    expect(T.lead).toMatch(/не может/)
    expect(all).not.toMatch(/выберите другого человека/i)
    expect(all).not.toContain('SR.11')
    expect(T.thirdParty.text).toMatch(/404/)
    expect(T.thirdParty.href).toBe('https://www.gov.kz/services/3934')
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

  it('справки: рабочие адреса страниц egov и уникальные коды', () => {
    expect(REQUESTABLE_CERTIFICATES.length).toBeGreaterThanOrEqual(4)
    for (const c of REQUESTABLE_CERTIFICATES) {
      expect(c.href).toMatch(/^https:\/\/egov\.kz\/ru\/services\/presale\/[A-Za-z0-9]+$/)
    }
    expect(new Set(REQUESTABLE_CERTIFICATES.map(c => c.id)).size).toBe(REQUESTABLE_CERTIFICATES.length)
    expect(new Set(REQUESTABLE_CERTIFICATES.map(c => c.code)).size).toBe(REQUESTABLE_CERTIFICATES.length)
  })

  it('юридическая оговорка про лишние документы на месте', () => {
    expect(T.legal).toMatch(/не вправе требовать лишние документы/)
  })
})

describe('buildPersonMessage', () => {
  const conviction = REQUESTABLE_CERTIFICATES[0]
  const clinics = REQUESTABLE_CERTIFICATES[1]

  it('содержит ссылку и инструкцию «На себя», не содержит ИИН', () => {
    const m = buildPersonMessage([conviction])
    expect(m).toContain(conviction.href)
    expect(m).toContain('«На себя»')
    expect(m).toContain('бесплатно')
    expect(m).not.toMatch(/\d{12}/)
  })

  it('несколько справок идут списком, по одной ссылке на каждую', () => {
    const m = buildPersonMessage([conviction, clinics])
    expect(m).toContain(`• ${conviction.title}: ${conviction.href}`)
    expect(m).toContain(`• ${clinics.title}: ${clinics.href}`)
  })
})
