import { describe, it, expect } from 'vitest'
import {
  buildWaMeUrl, generateLinkToken, generateLoginCode, isPlaceholderEmail, loginConfig, normalizeWaId, parseLoginMessage,
  placeholderEmailFor, sanitizeMeta, LOGIN_CODE_LENGTH,
} from './helpers'
import { realEmailOrNull } from './placeholderEmail'

describe('parseLoginMessage', () => {
  const code = generateLoginCode()
  it('принимает «Вход <код>» в любом регистре и с лишними пробелами', () => {
    expect(parseLoginMessage(`Вход ${code}`)).toBe(code)
    expect(parseLoginMessage(`  вход   ${code.toLowerCase()} \n`)).toBe(code)
    expect(parseLoginMessage(`ВХОД ${code}`)).toBe(code)
  })
  it('обычные сообщения клиентов не трогает (идут к агенту)', () => {
    for (const t of ['Вход', 'Вход в здание где?', 'Здравствуйте, вход ABCD2345 не работает', 'Вход ABCD', 'Вход ABCD2345 спасибо', 'ABCD2345', '', 'login ABCD2345']) {
      expect(parseLoginMessage(t)).toBeNull()
    }
    expect(parseLoginMessage(null)).toBeNull()
    expect(parseLoginMessage(42)).toBeNull()
  })
  it('код не нашей формы (0, O, 1, I, длина) не считается кодом', () => {
    expect(parseLoginMessage('Вход ABCD2340')).toBeNull() // 0 нет в алфавите
    expect(parseLoginMessage('Вход ABCD234I')).toBeNull()
    expect(parseLoginMessage('Вход ABCD23456')).toBeNull() // 9 знаков
  })
})

describe('генераторы', () => {
  it('код нужной длины из безопасного алфавита; токен url-безопасный и длинный', () => {
    for (let i = 0; i < 200; i++) expect(generateLoginCode()).toMatch(new RegExp(`^[A-HJKMNP-Z2-9]{${LOGIN_CODE_LENGTH}}$`))
    const t = generateLinkToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Set(Array.from({ length: 50 }, generateLinkToken)).size).toBe(50)
  })
})

describe('номер, служебный адрес, настройки', () => {
  it('normalizeWaId берёт цифры и отсекает мусор', () => {
    expect(normalizeWaId('77776970406')).toBe('77776970406')
    expect(normalizeWaId('+7 (777) 697-04-06')).toBe('77776970406')
    expect(normalizeWaId('123')).toBeNull()
    expect(normalizeWaId(undefined)).toBeNull()
  })
  it('служебный адрес распознаётся и не выдаётся за настоящий', () => {
    const e = placeholderEmailFor('77776970406')
    expect(e).toBe('wa77776970406@wa.invalid')
    expect(isPlaceholderEmail(e)).toBe(true)
    expect(isPlaceholderEmail('WA1@WA.INVALID')).toBe(true)
    expect(isPlaceholderEmail('user@gmail.com')).toBe(false)
    expect(realEmailOrNull(e)).toBeNull()
    expect(realEmailOrNull('user@gmail.com')).toBe('user@gmail.com')
    expect(realEmailOrNull(null)).toBeNull()
  })
  it('loginConfig выключен, пока не заданы обе переменные', () => {
    expect(loginConfig({})).toBeNull()
    expect(loginConfig({ WHATSAPP_LOGIN_PHONE_NUMBER_ID: '123' })).toBeNull()
    expect(loginConfig({ WHATSAPP_LOGIN_PHONE_NUMBER_ID: '123', WHATSAPP_LOGIN_DISPLAY_NUMBER: '12' })).toBeNull()
    expect(loginConfig({ WHATSAPP_LOGIN_PHONE_NUMBER_ID: ' 123 ', WHATSAPP_LOGIN_DISPLAY_NUMBER: '+7 777 000 00 00' })).toEqual({ phoneNumberId: '123', displayNumber: '+7 777 000 00 00' })
  })
  it('ссылка на чат: только цифры номера, текст закодирован', () => {
    expect(buildWaMeUrl('+7 777 000 00 00', 'ABCD2345')).toBe('https://wa.me/77770000000?text=%D0%92%D1%85%D0%BE%D0%B4%20ABCD2345')
  })
})

describe('sanitizeMeta', () => {
  it('оставляет четыре известных ключа и только строки разумной длины', () => {
    expect(sanitizeMeta({ referral_code: 'abc', first_source: 'ig', pending_bin_watch: '123456789012', post_login_next: '/kaspi', evil: 'x', admin: true }))
      .toEqual({ referral_code: 'abc', first_source: 'ig', pending_bin_watch: '123456789012', post_login_next: '/kaspi' })
    expect(sanitizeMeta({ referral_code: 'x'.repeat(201), first_source: 5, pending_bin_watch: '' })).toEqual({})
    expect(sanitizeMeta(null)).toEqual({})
    expect(sanitizeMeta('str')).toEqual({})
  })
})
