import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { buildWidgetSnippet, WIDGET_SCRIPT_URL } from './widgetSnippet'

describe('buildWidgetSnippet', () => {
  it('points at the apex host, never www', () => {
    const snippet = buildWidgetSnippet('wgt_0123456789abcdef01234567')
    expect(snippet).toBe('<script src="https://invoices.kz/widget.js" data-key="wgt_0123456789abcdef01234567" async></script>')
    expect(snippet).not.toContain('www.')
    expect(WIDGET_SCRIPT_URL.startsWith('https://invoices.kz/')).toBe(true)
  })
})

describe('public/widget.js', () => {
  // The embed script itself must call the apex API: a www API_BASE gets a 308
  // on the CORS preflight, which the browser refuses to follow.
  it('calls the apex API, never www', () => {
    const src = readFileSync(path.join(process.cwd(), 'public', 'widget.js'), 'utf8')
    expect(src).toContain("var API_BASE = 'https://invoices.kz/api/ai-agent/widget';")
    expect(src).not.toMatch(/https:\/\/www\.invoices\.kz/)
  })
})
