import sharp from 'sharp'
import { readFileSync } from 'fs'

const svg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="100" fill="#1C2056"/>
  <text x="256" y="300" font-family="Arial" font-size="180" font-weight="bold" 
    fill="white" text-anchor="middle">IN</text>
  <rect x="80" y="340" width="352" height="20" rx="10" fill="#2DC48D"/>
</svg>`

const svgBuffer = Buffer.from(svg)

await sharp(svgBuffer).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(svgBuffer).resize(512, 512).png().toFile('public/icon-512.png')

console.log('Icons generated!')