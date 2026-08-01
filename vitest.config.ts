import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'

// Load .env.local manually
const envPath = path.resolve(__dirname, '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8')
  content.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').replace(/^["']|["']$/g, '')
      if (key) {
        process.env[key] = value
      }
    }
  })
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
