import { describe, expect, it } from 'vitest'
import { BOT_START_SOURCES, BOT_USERNAME, botStartLink, parseStartSource } from './links'

describe('ссылки и метки бота', () => {
  it('ссылка несёт имя бота и метку', () => {
    expect(botStartLink('ig_bio')).toBe(`https://t.me/${BOT_USERNAME}?start=ig_bio`)
    for (const s of BOT_START_SOURCES) expect(botStartLink(s)).toContain(`start=${s}`)
  })

  it('метка из /start берётся только из белого списка', () => {
    expect(parseStartSource('/start ig_bio')).toBe('ig_bio')
    expect(parseStartSource('/start@invoices_bin_bot site_kontragent')).toBe('site_kontragent')
    expect(parseStartSource('/start IG_STORY')).toBe('ig_story')
    expect(parseStartSource('/start')).toBeNull()
    expect(parseStartSource('/start evil_source')).toBeNull()
    expect(parseStartSource('/start ig_bio; drop table')).toBeNull()
    expect(parseStartSource('привет')).toBeNull()
    expect(parseStartSource(undefined)).toBeNull()
  })
})
