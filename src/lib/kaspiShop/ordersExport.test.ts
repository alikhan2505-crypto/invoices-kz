import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildOrdersWorkbookBuffer } from './ordersExport'

describe('buildOrdersWorkbookBuffer', () => {
  it('writes a header row plus one row per order', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '123',
        cityName: 'Алматы',
        customerFirstName: 'Айнур',
        customerLastName: 'К',
        totalPrice: 5000,
        creationTime: '2026-08-20T10:00:00.000Z',
        plannedDeliveryDate: '2026-08-24T15:00:00.000Z',
        items: [{ name: 'Полотенца Sunlight', quantity: 2 }],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets['Заказы']
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]
    expect(grid[0]).toEqual(['№ заказа', 'Город', 'Покупатель', 'Сумма', 'Дата создания', 'Дата передачи', 'Товары'])
    expect(grid[1]).toEqual(['123', 'Алматы', 'Айнур К', 5000, '20.08.2026', '24.08.2026', 'Полотенца Sunlight ×2'])
  })

  it('renders an empty string for a missing city and planned delivery date', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '999', cityName: null, customerFirstName: 'А', customerLastName: 'Б',
        totalPrice: 1000, creationTime: '2026-08-20T10:00:00.000Z', plannedDeliveryDate: null, items: [],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets['Заказы'], { header: 1 }) as any[][]
    expect(grid[1][1]).toBe('')
    expect(grid[1][5]).toBe('')
    expect(grid[1][6]).toBe('')
  })

  it('joins multiple items with a semicolon', () => {
    const buffer = buildOrdersWorkbookBuffer([
      {
        code: '1', cityName: null, customerFirstName: 'А', customerLastName: '',
        totalPrice: 0, creationTime: '2026-08-20T10:00:00.000Z', plannedDeliveryDate: null,
        items: [{ name: 'Товар A', quantity: 1 }, { name: 'Товар B', quantity: 3 }],
      },
    ])
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const grid = XLSX.utils.sheet_to_json(workbook.Sheets['Заказы'], { header: 1 }) as any[][]
    expect(grid[1][6]).toBe('Товар A ×1; Товар B ×3')
  })

  it('returns a Buffer instance, even for an empty order list', () => {
    expect(Buffer.isBuffer(buildOrdersWorkbookBuffer([]))).toBe(true)
  })
})
