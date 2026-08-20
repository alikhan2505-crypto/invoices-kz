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

  it('maps the book_appointment goal to its own label', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'book_appointment' })).toContain('записать клиента на консультацию')
  })

  it('lists preset collect fields by their Russian labels and custom fields verbatim', () => {
    const line = buildBusinessContextLine({
      name: 'X', tone: 'friendly', description: '', goal: 'qualify_lead',
      collectFields: ['name', 'budget', 'Любимый цвет'],
    })
    expect(line).toContain('имя клиента')
    expect(line).toContain('бюджет')
    expect(line).toContain('Любимый цвет')
    expect(line).toContain('по одному')
  })

  it('omits the collect-fields sentence when the list is empty or absent', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions' })).not.toContain('постарайся естественно узнать')
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions', collectFields: [] })).not.toContain('постарайся естественно узнать')
  })

  it('adds currency and timezone context when provided', () => {
    const line = buildBusinessContextLine({
      name: 'X', tone: 'friendly', description: '', goal: 'answer_questions',
      currency: 'KZT', timezone: 'Asia/Almaty',
    })
    expect(line).toContain('тенге (₸)')
    expect(line).toContain('Asia/Almaty')
  })

  it('skips the currency sentence for an unknown currency code', () => {
    expect(buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions', currency: 'XYZ' })).not.toContain('валюте')
  })

  it('defaults to the Instagram channel wording when channel is omitted (live Instagram path unchanged)', () => {
    const line = buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions' })
    expect(line).toContain('бизнес-аккаунта в Instagram')
    expect(line).not.toContain('Telegram')
  })

  it('uses Telegram wording when channel is telegram', () => {
    const line = buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions', channel: 'telegram' })
    expect(line).toContain('бизнес-аккаунта в Telegram')
    expect(line).not.toContain('Instagram')
  })

  it('uses WhatsApp wording when channel is whatsapp', () => {
    const line = buildBusinessContextLine({ name: 'X', tone: 'friendly', description: '', goal: 'answer_questions', channel: 'whatsapp' })
    expect(line).toContain('бизнес-аккаунта в WhatsApp')
    expect(line).not.toContain('Instagram')
    expect(line).not.toContain('Telegram')
  })
})
