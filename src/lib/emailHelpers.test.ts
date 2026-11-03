import { describe, expect, it } from 'vitest'
import { mailProviderLink, suggestEmailFix } from './emailHelpers'

describe('suggestEmailFix', () => {
  it('fixes the usual typos of the big providers and keeps the local part', () => {
    expect(suggestEmailFix('ali@gmial.com')).toBe('ali@gmail.com')
    expect(suggestEmailFix('ali@gmail.con')).toBe('ali@gmail.com')
    expect(suggestEmailFix('Ali.K@gmail.ru')).toBe('Ali.K@gmail.com')
    expect(suggestEmailFix('ali@mail.ry')).toBe('ali@mail.ru')
    expect(suggestEmailFix('ali@yadex.ru')).toBe('ali@yandex.ru')
  })

  it('catches a one-letter slip in a long domain through the distance rule', () => {
    expect(suggestEmailFix('ali@gmaail.com')).toBe('ali@gmail.com')
    expect(suggestEmailFix('ali@outlookk.com')).toBe('ali@outlook.com')
  })

  it('leaves known domains and company domains alone', () => {
    for (const e of ['ali@gmail.com', 'ali@mail.ru', 'ali@yandex.kz', 'ali@kaspi.kz', 'info@romashka.kz', 'a@b.kz', 'ali@bk.ru']) {
      expect(suggestEmailFix(e), e).toBeNull()
    }
  })

  it('does not match short domains by distance and ignores malformed input', () => {
    expect(suggestEmailFix('ali@mal.ru')).toBeNull()
    expect(suggestEmailFix('')).toBeNull()
    expect(suggestEmailFix('no-at-sign')).toBeNull()
    expect(suggestEmailFix('ali@')).toBeNull()
    expect(suggestEmailFix('@gmail.com')).toBeNull()
  })
})

describe('mailProviderLink', () => {
  it('maps the common providers to their web inbox', () => {
    expect(mailProviderLink('a@gmail.com')).toEqual({ name: 'Gmail', href: 'https://mail.google.com/' })
    expect(mailProviderLink('a@bk.ru')?.name).toBe('Mail.ru')
    expect(mailProviderLink('a@yandex.kz')?.name).toBe('Яндекс Почта')
    expect(mailProviderLink('a@ya.ru')?.name).toBe('Яндекс Почта')
    expect(mailProviderLink('a@hotmail.com')?.name).toBe('Outlook')
    expect(mailProviderLink('a@icloud.com')?.name).toBe('iCloud')
  })

  it('returns null for a company or unknown domain and for junk', () => {
    expect(mailProviderLink('a@romashka.kz')).toBeNull()
    expect(mailProviderLink('nope')).toBeNull()
  })
})
