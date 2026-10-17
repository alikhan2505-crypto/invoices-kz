import { describe, expect, it } from 'vitest'
import vm from 'node:vm'
import { BOT_UA, LANG_BOOT_SCRIPT, langFromNavigator, resolveLang, routeLang, type Lang } from './langResolve'

describe('langFromNavigator', () => {
  it('kk-KZ -> kk, en-US -> en, ru-RU -> ru', () => {
    expect(langFromNavigator(['kk-KZ'])).toBe('kk')
    expect(langFromNavigator(['en-US'])).toBe('en')
    expect(langFromNavigator(['ru-RU'])).toBe('ru')
  })
  it('bare codes, case and underscore', () => {
    expect(langFromNavigator(['kk'])).toBe('kk')
    expect(langFromNavigator(['ru'])).toBe('ru')
    expect(langFromNavigator(['EN_gb'])).toBe('en')
    expect(langFromNavigator(['en-GB'])).toBe('en')
  })
  it('unknown / empty -> ru', () => {
    expect(langFromNavigator(['de-DE'])).toBe('ru')
    expect(langFromNavigator(['zz'])).toBe('ru')
    expect(langFromNavigator(['uk-UA'])).toBe('ru')
    expect(langFromNavigator(['uk-UA', 'ru'])).toBe('ru')
    expect(langFromNavigator(['ru-UA'])).toBe('ru')
    expect(langFromNavigator([])).toBe('ru')
    expect(langFromNavigator(['', null, undefined])).toBe('ru')
    expect(langFromNavigator(undefined)).toBe('ru')
  })
  it('first recognised language in browser order wins, unknown ones are skipped', () => {
    expect(langFromNavigator(['kk-KZ', 'ru-RU', 'en-US'])).toBe('kk')
    expect(langFromNavigator(['ru-RU', 'en-US'])).toBe('ru')
    expect(langFromNavigator(['en-US', 'ru'])).toBe('en')
    expect(langFromNavigator(['de', 'kk'])).toBe('kk')
  })
})

describe('resolveLang', () => {
  it('stored/cookie preference beats the browser language', () => {
    expect(resolveLang({ stored: 'ru', languages: ['kk-KZ'] })).toBe('ru')
    expect(resolveLang({ stored: 'kk', languages: ['ru-RU'] })).toBe('kk')
    expect(resolveLang({ stored: 'en', languages: ['ru-RU'] })).toBe('en')
    expect(resolveLang({ cookie: 'en', languages: ['kk-KZ'] })).toBe('en')
  })
  it('cookie beats localStorage (freshest choice across subdomains)', () => {
    expect(resolveLang({ cookie: 'kk', stored: 'ru' })).toBe('kk')
  })
  it('invalid stored values are ignored', () => {
    expect(resolveLang({ cookie: 'de', stored: '', languages: ['en-US'] })).toBe('en')
    expect(resolveLang({ stored: 'toString', languages: [] })).toBe('ru')
    expect(resolveLang({ stored: null, cookie: null, languages: ['kk-KZ'] })).toBe('kk')
  })
  it('no preference: navigator decides; nothing -> ru', () => {
    expect(resolveLang({ languages: ['kk-KZ'] })).toBe('kk')
    expect(resolveLang({ languages: ['en-US'] })).toBe('en')
    expect(resolveLang({ languages: ['ru-RU'] })).toBe('ru')
    expect(resolveLang({ languages: ['xx'] })).toBe('ru')
    expect(resolveLang({})).toBe('ru')
  })
  it('bots are never guessed from the browser language, but explicit choice is honoured', () => {
    expect(resolveLang({ languages: ['en-US'], isBot: true })).toBe('ru')
    expect(resolveLang({ stored: 'kk', languages: ['en-US'], isBot: true })).toBe('kk')
    expect(BOT_UA.test('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(BOT_UA.test('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/130.0 Safari/537.36')).toBe(false)
    expect(BOT_UA.test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1')).toBe(false)
  })
})

describe('routeLang', () => {
  it('language-by-address pages', () => {
    expect(routeLang('/tools/kk')).toBe('kk')
    expect(routeLang('/tools/kk/schet')).toBe('kk')
    expect(routeLang('/tools/en/kp')).toBe('en')
    expect(routeLang('/guides/kk/komissiya-kaspi')).toBe('kk')
  })
  it('others are not route-language pages', () => {
    expect(routeLang('/')).toBeNull()
    expect(routeLang('/tools/schet')).toBeNull()
    expect(routeLang('/tools/kkx')).toBeNull()
    expect(routeLang('/guides/komissiya-kaspi')).toBeNull()
    expect(routeLang('/login')).toBeNull()
    expect(routeLang(undefined)).toBeNull()
  })
})

// Встроенный скрипт <head> дублирует логику на «голом» DOM — прогоняем его в vm
// на той же матрице и сверяем с чистыми функциями.
describe('LANG_BOOT_SCRIPT parity', () => {
  interface Env {
    pathname?: string
    cookie?: string
    stored?: string | null
    languages?: string[]
    ua?: string
    storageThrows?: boolean
    language?: string
    ready?: boolean
  }
  function run(env: Env) {
    const attrs: Record<string, string> = { lang: 'ru' }
    if (env.ready) attrs['data-lang-ready'] = ''
    const sandbox = {
      document: {
        cookie: env.cookie ?? '',
        location: { pathname: env.pathname ?? '/' },
        documentElement: {
          setAttribute: (k: string, v: string) => { attrs[k] = v },
          hasAttribute: (k: string) => k in attrs,
        },
      },
      localStorage: {
        getItem: () => {
          if (env.storageThrows) throw new Error('blocked')
          return env.stored ?? null
        },
      },
      navigator: {
        languages: env.languages ?? [],
        language: env.language ?? env.languages?.[0],
        userAgent: env.ua ?? 'Mozilla/5.0 Chrome/130',
      },
    }
    vm.runInNewContext(LANG_BOOT_SCRIPT, sandbox)
    return attrs
  }
  function expected(env: Env): { lang: Lang; hold: boolean } {
    const r = routeLang(env.pathname ?? '/')
    if (r) return { lang: r, hold: false }
    const m = /(?:^|;\s*)lang=([^;]*)/.exec(env.cookie ?? '')
    const lang = resolveLang({
      cookie: m?.[1],
      stored: env.storageThrows ? null : env.stored,
      languages: env.languages?.length ? env.languages : [env.language],
      isBot: BOT_UA.test(env.ua ?? ''),
    })
    return { lang, hold: lang !== 'ru' }
  }

  const cases: Env[] = [
    {},
    { languages: ['ru-RU'] },
    { languages: ['kk-KZ'] },
    { languages: ['en-US'] },
    { languages: ['en-US', 'ru'] },
    { languages: ['de-DE'] },
    { languages: ['de', 'kk'] },
    { languages: [] },
    { languages: ['kk-KZ'], stored: 'ru' },
    { languages: ['ru-RU'], stored: 'kk' },
    { languages: ['ru-RU'], stored: 'en' },
    { languages: ['ru-RU'], cookie: 'lang=kk' },
    { languages: ['ru-RU'], cookie: 'a=1; lang=en; b=2' },
    { languages: ['kk-KZ'], cookie: 'lang=ru', stored: 'kk' },
    { languages: ['kk-KZ'], cookie: 'lang=xx' },
    { languages: ['kk-KZ'], stored: 'toString' },
    { languages: ['kk-KZ'], storageThrows: true },
    { languages: ['en-US'], ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    { languages: ['en-US'], ua: 'Mozilla/5.0 (compatible; YandexBot/3.0)', stored: 'kk' },
    { languages: ['kk-KZ'], pathname: '/tools/kk/schet' },
    { languages: ['ru-RU'], pathname: '/tools/en' , stored: 'ru' },
    { languages: ['en-US'], pathname: '/guides/kk/komissiya-kaspi' },
    { languages: ['kk-KZ'], pathname: '/tools/schet' },
    { languages: ['en-GB'] },
    { languages: ['uk-UA'] },
    { languages: ['uk-UA', 'ru'] },
    { languages: [], language: 'kk-KZ' },
    { languages: [], language: 'en-US' },
  ]
  it('script that runs after hydration (data-lang-ready) sets lang but never holds the page', () => {
    const attrs = run({ languages: ['kk-KZ'], ready: true })
    expect(attrs.lang).toBe('kk')
    expect('data-lang-hold' in attrs).toBe(false)
  })
  it.each(cases.map((c, i) => [i, c] as const))('case %i matches resolveLang', (_i, env) => {
    const attrs = run(env)
    const exp = expected(env)
    expect(attrs.lang).toBe(exp.lang)
    expect('data-lang-hold' in attrs).toBe(exp.hold)
  })
})
