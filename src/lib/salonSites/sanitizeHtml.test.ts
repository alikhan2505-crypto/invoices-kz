import { describe, it, expect } from 'vitest'
import { sanitizeLandingHtml, extractHtmlDocument } from './sanitizeHtml'

describe('sanitizeLandingHtml', () => {
  it('removes a script tag together with its contents', () => {
    const html = sanitizeLandingHtml('<h1>Салон</h1><script>fetch("/steal")</script><p>Цены</p>')
    expect(html).toBe('<h1>Салон</h1><p>Цены</p>')
  })

  it('removes event handler attributes', () => {
    const html = sanitizeLandingHtml('<div onclick="alert(1)" class="card">Маникюр</div>')
    expect(html).toBe('<div class="card">Маникюр</div>')
  })

  it('removes an unquoted event handler too', () => {
    expect(sanitizeLandingHtml('<img src="a.jpg" onerror=alert(1)>')).toBe('<img src="a.jpg">')
  })

  it('defuses javascript: links', () => {
    expect(sanitizeLandingHtml('<a href="javascript:alert(1)">Запись</a>')).toBe('<a href="#">Запись</a>')
  })

  // Форма уходит вместе с полями: лендинг собирает заявки ссылкой на WhatsApp,
  // а форма на чужой action — готовый способ увести данные клиента.
  it('drops iframes and forms with their contents', () => {
    const html = sanitizeLandingHtml('<form action="https://evil.kz"><input></form><iframe src="x"></iframe>ок')
    expect(html).toBe('ок')
  })

  // Без viewport лендинг перестаёт быть мобильным — а это половина клиентов салона.
  it('keeps charset and viewport meta tags', () => {
    const metas = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    expect(sanitizeLandingHtml(metas)).toBe(metas)
  })

  it('removes a meta refresh redirect', () => {
    expect(sanitizeLandingHtml('<meta http-equiv="refresh" content="0;url=https://evil.kz">ок')).toBe('ок')
  })

  it('keeps a Google Fonts stylesheet link — the pages depend on it', () => {
    const link = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik">'
    expect(sanitizeLandingHtml(link)).toBe(link)
  })
})

describe('extractHtmlDocument', () => {
  it('pulls the document out of a markdown fence', () => {
    const text = 'Вот лендинг:\n```html\n<!DOCTYPE html><html><body>Салон</body></html>\n```\nГотово.'
    expect(extractHtmlDocument(text)).toBe('<!DOCTYPE html><html><body>Салон</body></html>')
  })

  it('strips prose around a bare document', () => {
    const text = 'Держите:\n<!DOCTYPE html><html><body>Салон</body></html>\nЕсли нужно — поменяю.'
    expect(extractHtmlDocument(text)).toBe('<!DOCTYPE html><html><body>Салон</body></html>')
  })

  it('returns the text as-is when there is no document at all', () => {
    expect(extractHtmlDocument('  не смог  ')).toBe('не смог')
  })
})
