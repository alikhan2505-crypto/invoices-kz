import { describe, it, expect } from 'vitest'
import { buildBusinessContextLine } from './promptContext'

describe('buildBusinessContextLine', () => {
  it('includes the business name, description, tone label, and goal label', () => {
    const line = buildBusinessContextLine({ name: 'Cvety.kz', tone: 'friendly', description: 'доставка цветов', goal: 'answer_questions' })
    expect(line).toContain('Cvety.kz')
    expect(line).toContain('доставка цветов')
    expect(line).toContain('дружелюбный и тёплый')
    expect(line).toContain('отвечать на вопросы')
  })

  it('omits the description dash when description is empty', () => {
    const line = buildBusinessContextLine({ name: 'Cvety.kz', tone: 'professional', description: '', goal: 'qualify_lead' })
    expect(line).not.toContain(' — .')
    expect(line).toContain('(Cvety.kz)')
  })

  it('maps each tone preset to its own label', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'energetic', description: '', goal: 'answer_questions' })).toContain('мотивирующий и энергичный')
    expect(buildBusinessContextLine({ name: 'X', tone: 'caring', description: '', goal: 'answer_questions' })).toContain('заботливый и внимательный')
  })

  it('maps the qualify_lead goal to its own label', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'qualify_lead' })).toContain('квалифицировать заявку')
  })
})
