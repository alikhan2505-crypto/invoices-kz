// Собирает OG-картинку лендинга Счетов (docs.invoices.kz) из public/og-invoices.svg.
// Запуск: node scripts/build-og-invoices.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'

const svg = readFileSync('public/og-invoices.svg')
await sharp(svg, { density: 144 }).resize(1200, 630).png({ compressionLevel: 9 }).toFile('public/og-invoices.png')
console.log('public/og-invoices.png готов')
