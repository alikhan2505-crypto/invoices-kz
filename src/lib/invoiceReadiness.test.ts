import { describe, it, expect } from 'vitest'
import { computeInvoiceReadiness } from './invoiceReadiness'

const item = (name: string, price: number) => ({ name, price })

describe('computeInvoiceReadiness', () => {
  it('пустая форма: ничего не готово, первая проблема — имя клиента', () => {
    const r = computeInvoiceReadiness({ clientName: '', clientBin: '', services: [item('', 0)] })
    expect(r).toEqual({ client: false, items: false, ready: false, firstProblem: 'clientName' })
  })

  it('имя без БИН — клиент не готов (БИН обязателен)', () => {
    const r = computeInvoiceReadiness({ clientName: 'ТОО «Ромашка»', clientBin: '', services: [item('Услуга', 1000)] })
    expect(r.client).toBe(false)
    expect(r.items).toBe(true)
    expect(r.ready).toBe(false)
    expect(r.firstProblem).toBe('clientBin')
  })

  it('БИН без имени — клиент не готов', () => {
    const r = computeInvoiceReadiness({ clientName: '', clientBin: '123456789012', services: [item('Услуга', 1000)] })
    expect(r.client).toBe(false)
    expect(r.firstProblem).toBe('clientName')
  })

  it('без позиций — позиции не готовы', () => {
    const r = computeInvoiceReadiness({ clientName: 'А', clientBin: '1', services: [] })
    expect(r.items).toBe(false)
    expect(r.firstProblem).toBe('itemName')
  })

  it('любая позиция без названия ломает готовность, даже если другие в порядке', () => {
    const r = computeInvoiceReadiness({ clientName: 'А', clientBin: '1', services: [item('Есть', 10), item('', 10)] })
    expect(r.items).toBe(false)
    expect(r.firstProblem).toBe('itemName')
  })

  it('позиция с ценой 0 — не готово, проблема цены идёт после названий', () => {
    const r = computeInvoiceReadiness({ clientName: 'А', clientBin: '1', services: [item('Есть', 10), item('Ещё', 0)] })
    expect(r.items).toBe(false)
    expect(r.firstProblem).toBe('itemPrice')
  })

  it('безымянная позиция с ценой 0 сообщает сначала о названии — как alert в createInvoice()', () => {
    const r = computeInvoiceReadiness({ clientName: 'А', clientBin: '1', services: [item('', 0)] })
    expect(r.firstProblem).toBe('itemName')
  })

  it('клиент проверяется раньше позиций', () => {
    const r = computeInvoiceReadiness({ clientName: '', clientBin: '', services: [item('', 0)] })
    expect(r.firstProblem).toBe('clientName')
  })

  it('всё заполнено — готово', () => {
    const r = computeInvoiceReadiness({
      clientName: 'ТОО «Ромашка»', clientBin: '123456789012',
      services: [item('Разработка', 150000), item('Поддержка', 20000)],
    })
    expect(r).toEqual({ client: true, items: true, ready: true, firstProblem: null })
  })

  it('не добавляет новых правил: количество и знак цены страница не проверяла', () => {
    const r = computeInvoiceReadiness({ clientName: 'А', clientBin: '1', services: [{ name: 'X', price: -5 }] })
    expect(r.ready).toBe(true)
  })
})
