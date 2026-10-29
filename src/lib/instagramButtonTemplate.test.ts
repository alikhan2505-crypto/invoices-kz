import { describe, it, expect } from 'vitest'
import {
  parseTemplateReplyText, buildButtonTemplateMessage, buttonTemplateText, IG_TEMPLATE_LIMITS, type ButtonTemplate,
} from './instagramButtonTemplate'

const OLD_TEXT = 'Вот проверка по БИН 👇 https://invoices.kz/go/dm-kontragent\n\nПокажет неблагонадёжность, ликвидацию, налоговый долг и НДС по данным КГД. 3 проверки в квартал бесплатно.'
const BLOCK = [
  '@@button',
  'title: Вот проверка по БИН 👇',
  'subtitle: Неблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал',
  'button: Открыть проверку',
  'url: https://invoices.kz/go/dm-kontragent-btn',
].join('\n')
const ROW = `${OLD_TEXT}\n\n${BLOCK}`

describe('parseTemplateReplyText: разбор пометки', () => {
  it('строка без блока не меняется ни на символ', () => {
    for (const raw of [OLD_TEXT, ' пробелы \n', '', 'Ссылка @@ в середине', 'текст\n@@buttons\ntitle: x']) {
      expect(parseTemplateReplyText(raw)).toEqual({ plainText: raw, button: null, hasBlock: false, cardOnTyped: false })
    }
  })

  it('строка с блоком: чистый текст без разметки + карточка', () => {
    const p = parseTemplateReplyText(ROW)
    expect(p.hasBlock).toBe(true)
    expect(p.plainText).toBe(OLD_TEXT)
    expect(p.plainText).not.toContain('@@button')
    expect(p.button).toEqual({
      title: 'Вот проверка по БИН 👇',
      subtitle: 'Неблагонадёжность, ликвидация, налоговый долг, НДС. 3 проверки в квартал',
      buttonTitle: 'Открыть проверку',
      url: 'https://invoices.kz/go/dm-kontragent-btn',
    })
  })

  it('маркер без учёта регистра, CRLF, двоеточие в url не мешает', () => {
    const p = parseTemplateReplyText(ROW.replace('@@button', '  @@BUTTON ').replace(/\n/g, '\r\n'))
    expect(p.button?.url).toBe('https://invoices.kz/go/dm-kontragent-btn')
    expect(p.plainText.includes('\r')).toBe(false)
  })

  it('без текста до блока запасной текст собирается из карточки', () => {
    const p = parseTemplateReplyText(BLOCK)
    expect(p.plainText).toBe(buttonTemplateText(p.button!))
    expect(p.plainText).toContain('https://invoices.kz/go/dm-kontragent-btn')
  })

  it('подзаголовок необязателен', () => {
    const p = parseTemplateReplyText('Текст\n@@button\ntitle: Т\nbutton: Открыть\nurl: https://invoices.kz/x')
    expect(p.button).toEqual({ title: 'Т', subtitle: '', buttonTitle: 'Открыть', url: 'https://invoices.kz/x' })
  })

  it.each([
    ['нет title', BLOCK.replace(/title: Вот.*\n/, '')],
    ['нет button', BLOCK.replace(/button: .*\n/, '')],
    ['нет url', BLOCK.replace(/\nurl: .*/, '')],
    ['url не https', BLOCK.replace('https://', 'http://')],
    ['url не адрес', BLOCK.replace(/url: .*/, 'url: invoices.kz/go/x')],
    ['javascript: в url', BLOCK.replace(/url: .*/, 'url: javascript:alert(1)')],
    ['title длиннее 80', BLOCK.replace(/title: .*/, `title: ${'а'.repeat(81)}`)],
    ['subtitle длиннее 80', BLOCK.replace(/subtitle: .*/, `subtitle: ${'а'.repeat(81)}`)],
    ['кнопка длиннее 20', BLOCK.replace(/button: .*/, `button: ${'а'.repeat(21)}`)],
  ])('некорректный блок (%s): карточки нет, клиенту уходит чистый текст', (_n, block) => {
    const p = parseTemplateReplyText(`${OLD_TEXT}\n\n${block}`)
    expect(p.hasBlock).toBe(true)
    expect(p.button).toBeNull()
    expect(p.plainText).toBe(OLD_TEXT)
  })

  it('ровно на лимитах -- принимается', () => {
    const L = IG_TEMPLATE_LIMITS
    const p = parseTemplateReplyText(`x\n@@button\ntitle: ${'а'.repeat(L.title)}\nsubtitle: ${'б'.repeat(L.subtitle)}\nbutton: ${'в'.repeat(L.buttonTitle)}\nurl: https://invoices.kz/go/a`)
    expect(p.button).not.toBeNull()
  })

  it('лимиты соответствуют документации Meta (title 80, subtitle 80)', () => {
    expect(IG_TEMPLATE_LIMITS.title).toBe(80)
    expect(IG_TEMPLATE_LIMITS.subtitle).toBe(80)
  })
})

describe('buildButtonTemplateMessage: формат тела', () => {
  const b: ButtonTemplate = { title: 'Заголовок', subtitle: 'Подзаголовок', buttonTitle: 'Открыть проверку', url: 'https://invoices.kz/go/dm-kontragent-btn' }
  it('generic: один элемент, одна кнопка web_url', () => {
    expect(buildButtonTemplateMessage(b)).toEqual({
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: [{
            title: 'Заголовок',
            subtitle: 'Подзаголовок',
            buttons: [{ type: 'web_url', url: 'https://invoices.kz/go/dm-kontragent-btn', title: 'Открыть проверку' }],
          }],
        },
      },
    })
  })
  it('пустой подзаголовок не отправляется', () => {
    const el = buildButtonTemplateMessage({ ...b, subtitle: '' }).attachment.payload.elements[0]
    expect('subtitle' in el).toBe(false)
  })
  it('текст журнала: заголовок, подзаголовок и ссылка, не JSON', () => {
    const t = buttonTemplateText(b)
    expect(t).toBe('Заголовок\nПодзаголовок\nhttps://invoices.kz/go/dm-kontragent-btn')
    expect(t).not.toContain('{')
  })
})

describe('typed: yes -- разрешение карточки на набранное слово', () => {
  const base = 'Текст\n\n@@button\ntitle: Т\nbutton: Открыть\nurl: https://invoices.kz/x'
  it('по умолчанию выключено', () => {
    expect(parseTemplateReplyText(base).cardOnTyped).toBe(false)
  })
  it.each(['yes', 'YES', 'да', 'true', '1'])('typed: %s включает', v => {
    expect(parseTemplateReplyText(`${base}\ntyped: ${v}`).cardOnTyped).toBe(true)
  })
  it.each(['no', 'нет', ''])('typed: "%s" не включает', v => {
    expect(parseTemplateReplyText(`${base}\ntyped: ${v}`).cardOnTyped).toBe(false)
  })
  it('при некорректной карточке typed не действует, клиент не видит строку typed', () => {
    const p = parseTemplateReplyText('Текст\n\n@@button\ntitle: Т\nurl: http://x.kz\ntyped: yes')
    expect(p.button).toBeNull()
    expect(p.cardOnTyped).toBe(false)
    expect(p.plainText).toBe('Текст')
  })
})
