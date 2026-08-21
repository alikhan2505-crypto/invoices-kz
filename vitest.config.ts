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
  resolve: {
    // Mirrors tsconfig.json's "@/*": ["./src/*"] -- needed so a test can
    // import a module that transitively pulls in an `@/...` import (e.g.
    // checkCycle.test.ts -> checkCycle.ts -> wallet.ts ->
    // '@/lib/kaspiPay/wallet'). No existing kaspiShop test previously
    // exercised this path (none of them import a file with an `@/` import
    // in its own dependency chain), so the gap went unnoticed until now.
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
