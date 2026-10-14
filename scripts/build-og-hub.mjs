// Собирает OG-картинку хаба продуктов (invoices.kz и /products) из public/og-hub.svg.
// Запуск: node scripts/build-og-hub.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/og-hub.svg')
await sharp(svg, { density: 144 }).resize(1200, 630).png({ compressionLevel: 9 }).toFile('public/og-hub.png')
console.log('public/og-hub.png готов')
