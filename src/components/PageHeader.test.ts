import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PageHeader from './PageHeader'

// Серверная отрисовка (environment: node): смотрим на классы выравнивания.

function render(props: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(PageHeader, { title: 'Заголовок', ...props } as never))
}
function classOf(html: string, tag: string): string[] {
  const m = html.match(new RegExp(`<${tag}[^>]*class="([^"]*)"`))
  return m ? m[1].split(' ') : []
}

describe('PageHeader: линия заголовка не прыгает', () => {
  it('строка прижата к верху (items-start), а не отцентрована', () => {
    for (const subtitle of [undefined, 'Подзаголовок']) {
      const html = render({ subtitle })
      const root = classOf(html, 'div')
      expect(root).toContain('items-start')
      expect(root).not.toContain('items-center')
      expect(html).toContain('data-page-header')
    }
  })

  it('h1 занимает блок 44px вверху: py-2 + leading-7 + min-h-11, с подзаголовком и без', () => {
    for (const subtitle of [undefined, 'Подзаголовок']) {
      const h = classOf(render({ subtitle }), 'h1')
      expect(h).toEqual(expect.arrayContaining(['py-2', 'leading-7', 'min-h-11']))
    }
  })

  it('подзаголовок идёт под блоком заголовка и не двигает его', () => {
    const html = render({ subtitle: 'Подзаголовок' })
    expect(html).toMatch(/<\/h1><p class="[^"]*-mt-1\.5/)
  })

  it('стрелка назад остаётся 44x44 и тоже наверху строки', () => {
    const html = render({ backHref: '/profile' })
    expect(html).toMatch(/<a [^>]*class="[^"]*w-11 h-11/)
    expect(classOf(html, 'div')).toContain('items-start')
  })

  it('слот right держит высоту 44px, чтобы кнопки стояли по линии заголовка', () => {
    const html = render({ right: createElement('button', null, 'ok') })
    expect(html).toMatch(/<div class="[^"]*min-h-11[^"]*">\s*<button/)
  })

  it('as=h2 даёт h2', () => {
    expect(render({ as: 'h2' })).toContain('<h2')
  })
})
