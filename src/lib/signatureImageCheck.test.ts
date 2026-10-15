import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { checkSignatureImageBuffer } from './signatureImageCheck'

// Холст подписи на /profile/signature — 600×200, прозрачный фон, линия 2 px
// цвета #1C2056. Рисуем то же самое SVG-ом и гоним через тот же конвейер.
async function canvasPng(strokeLength: number): Promise<Buffer> {
  const line = strokeLength > 0
    ? `<line x1="100" y1="100" x2="${100 + strokeLength}" y2="100" stroke="#1C2056" stroke-width="2" stroke-linecap="round"/>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">${line}</svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function photoPng(background: string, ink: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="${background}"/>
    <circle cx="200" cy="200" r="120" fill="none" stroke="${ink}" stroke-width="10"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('checkSignatureImageBuffer', () => {
  it('accepts a short real signature (one 120 px stroke on the 600×200 canvas)', async () => {
    expect(await checkSignatureImageBuffer(await canvasPng(120))).toBe('ok')
    expect(await checkSignatureImageBuffer(await canvasPng(100))).toBe('ok')
  })

  it('accepts a normal signature', async () => {
    expect(await checkSignatureImageBuffer(await canvasPng(300))).toBe('ok')
  })

  it('refuses an empty canvas and a dot', async () => {
    expect(await checkSignatureImageBuffer(await canvasPng(0))).toBe('blank')
    expect(await checkSignatureImageBuffer(await canvasPng(1))).toBe('blank')
  })

  it('reports a stamp photographed in the dark as dark, not blank', async () => {
    expect(await checkSignatureImageBuffer(await photoPng('#555555', '#1a1a6a'))).toBe('dark')
  })

  it('accepts a stamp on a light background', async () => {
    expect(await checkSignatureImageBuffer(await photoPng('#ffffff', '#1a1a6a'))).toBe('ok')
  })

  it('refuses garbage bytes', async () => {
    expect(await checkSignatureImageBuffer(Buffer.alloc(1000, 7))).toBe('invalid')
  })
})
