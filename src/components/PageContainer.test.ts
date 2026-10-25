import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PageContainer, { Prose, WIDTH_CLS } from './PageContainer'

// Проекту хватает серверной отрисовки (environment: node, без jsdom): смотрим на HTML.

function cls(html: string): string[] {
  const m = html.match(/class="([^"]*)"/)
  return m ? m[1].split(' ') : []
}

describe('PageContainer', () => {
  it('narrow по умолчанию: 5xl/6xl, отступы p-4 lg:p-6 2xl:px-8, по центру', () => {
    const c = cls(renderToStaticMarkup(createElement(PageContainer, null, 'x')))
    expect(c).toEqual(expect.arrayContaining(['max-w-lg', 'lg:max-w-5xl', 'xl:max-w-6xl', 'mx-auto', 'p-4', 'lg:p-6', '2xl:px-8']))
  })

  it('wide и full без потолка на десктопе, потолок только на сверхшироких, база max-w-lg для телефона', () => {
    const w = cls(renderToStaticMarkup(createElement(PageContainer, { variant: 'wide' })))
    expect(w).toEqual(expect.arrayContaining(['max-w-lg', 'lg:max-w-none', 'min-[2000px]:max-w-[1800px]']))
    const f = cls(renderToStaticMarkup(createElement(PageContainer, { variant: 'full' })))
    expect(f).toEqual(expect.arrayContaining(['max-w-lg', 'lg:max-w-none', 'min-[2240px]:max-w-[2100px]']))
  })

  it('все изменения ширины стоят за lg: (телефон и планшет не меняются)', () => {
    for (const v of Object.values(WIDTH_CLS)) {
      for (const c of v.split(' ')) {
        if (c === 'max-w-lg') continue
        expect(c).toMatch(/^(lg|xl|min-\[\d+px\]):/)
      }
    }
  })

  it('align=start -- устаревший псевдоним центра, align=left прижимает влево', () => {
    expect(cls(renderToStaticMarkup(createElement(PageContainer, { align: 'start' })))).toContain('mx-auto')
    expect(cls(renderToStaticMarkup(createElement(PageContainer, { align: 'left' })))).not.toContain('mx-auto')
  })

  it('Prose ограничивает абзац: max-w-prose, wide -- 75ch', () => {
    expect(cls(renderToStaticMarkup(createElement(Prose, { className: 'mt-2' }, 'x')))).toEqual(expect.arrayContaining(['max-w-prose', 'mt-2']))
    expect(cls(renderToStaticMarkup(createElement(Prose, { wide: true, as: 'p' }, 'x')))).toContain('max-w-[75ch]')
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
