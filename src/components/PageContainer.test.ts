import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PageContainer from './PageContainer'

// Проекту хватает серверной отрисовки (environment: node, без jsdom): смотрим на HTML.

function cls(html: string): string[] {
  const m = html.match(/class="([^"]*)"/)
  return m ? m[1].split(' ') : []
}

describe('PageContainer', () => {
  it('narrow по умолчанию: max-w-3xl, отступы p-4 lg:p-6, по центру окна как у страниц кабинета', () => {
    const c = cls(renderToStaticMarkup(createElement(PageContainer, null, 'x')))
    expect(c).toEqual(expect.arrayContaining(['max-w-lg', 'lg:max-w-3xl', 'mx-auto', 'p-4', 'lg:p-6']))
  })

  it('wide и full дают 5xl и 7xl', () => {
    expect(cls(renderToStaticMarkup(createElement(PageContainer, { variant: 'wide' })))).toContain('lg:max-w-5xl')
    expect(cls(renderToStaticMarkup(createElement(PageContainer, { variant: 'full' })))).toContain('lg:max-w-7xl')
  })

  it('align=start убирает mx-auto', () => {
    const c = cls(renderToStaticMarkup(createElement(PageContainer, { align: 'start' })))
    expect(c).not.toContain('mx-auto')
  })

  it('className и атрибуты проходят, дети внутри, лишних пробелов нет', () => {
    const html = renderToStaticMarkup(createElement(PageContainer, { className: 'space-y-4', 'aria-busy': true }, createElement('span', null, 'внутри')))
    expect(html).toContain('space-y-4')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('<span>внутри</span>')
    expect(html).not.toMatch(/class="[^"]*  /)
  })

  it('зазор под PageHeader ровно mb-5: правила обнуляют верхний отступ первого соседа', () => {
    const html = renderToStaticMarkup(createElement(PageContainer, { className: 'space-y-6' }))
    const c = cls(html.replace(/&amp;/g, '&').replace(/&gt;/g, '>'))
    expect(c).toContain('space-y-6')
    expect(c).toContain('[&>[data-page-header]]:mb-5')
    expect(c).toContain('[&>[data-page-header]+*]:mt-0')
  })
})
