import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  isKkUnderReview,
  KK_REVIEW_ENTRIES,
  KK_REVIEWED_BIK_SLUGS,
  KK_REVIEWED_GUIDE_SLUGS,
  KK_REVIEWED_PATHS,
  KK_REVIEWED_TOOL_SLUGS,
  makeKkReviewChecker,
  type KkReviewEntry,
} from './kkReview'
import { GUIDES } from './guides'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'
import { BIK_BANK_PAGES } from './bikRegistry'
import { KK_DOC_UNDER_REVIEW } from './kpI18n'

describe('makeKkReviewChecker', () => {
  const entries: KkReviewEntry[] = [
    { id: 'a', scope: 'page', paths: ['/tools/kk/zarplata', '/guides/kk/mrp-2026'], note: '' },
    { id: 'b', scope: 'ui', paths: ['src/lib/i18n'], note: '' },
  ]
  const check = makeKkReviewChecker(entries)

  it('страницы из реестра на проверке, остальное нет', () => {
    expect(check('/tools/kk/zarplata')).toBe(true)
    expect(check('/guides/kk/mrp-2026')).toBe(true)
    expect(check('/tools/zarplata')).toBe(false)
    expect(check('/tools/en/zarplata')).toBe(false)
    expect(check('/')).toBe(false)
    expect(check('src/lib/i18n')).toBe(false)
  })

  it('точное совпадение: похожий адрес с другим слагом не считается', () => {
    expect(check('/tools/kk/zarplata-x')).toBe(false)
    expect(check('/tools/kk/zarplata/extra')).toBe(false)
  })

  it('слэш в конце, строка запроса и якорь не мешают', () => {
    expect(check('/tools/kk/zarplata/')).toBe(true)
    expect(check('/guides/kk/mrp-2026?utm_source=x')).toBe(true)
    expect(check('/guides/kk/mrp-2026#faq')).toBe(true)
  })

  it('пустой или отсутствующий адрес даёт false', () => {
    expect(check(null)).toBe(false)
    expect(check(undefined)).toBe(false)
    expect(check('')).toBe(false)
  })
})

describe('реестр kkReview', () => {
  it('на проверке только калькулятор маржи (новые строки 05.11.2026), остальное вычитано', () => {
    expect(KK_REVIEW_ENTRIES.map(e => e.id)).toEqual(['tool-margin'])
    expect(KK_REVIEW_ENTRIES[0].scope).toBe('page')
    expect(KK_REVIEW_ENTRIES[0].paths).toEqual(['/tools/kk/margin'])
    expect(KK_DOC_UNDER_REVIEW).toBe(false)
    expect(isKkUnderReview('/tools/kk/margin')).toBe(true)
    expect(isKkUnderReview('/tools/kk/margin/')).toBe(true)
    // Русская и английская версии и соседние страницы плашки не получают.
    expect(isKkUnderReview('/tools/margin')).toBe(false)
    expect(isKkUnderReview('/tools/en/margin')).toBe(false)
    expect(isKkUnderReview('/guides/kk/komissiya-kaspi')).toBe(false)
    for (const p of KK_REVIEWED_PATHS) expect(isKkUnderReview(p), p).toBe(false)
  })

  it('страница на проверке не числится и вычитанной, и у неё есть настоящий page.tsx', () => {
    for (const e of KK_REVIEW_ENTRIES.filter(x => x.scope === 'page')) {
      for (const p of e.paths) {
        expect(KK_REVIEWED_PATHS.includes(p), p).toBe(false)
        const file = path.join(process.cwd(), 'src', 'app', ...p.split('/').filter(Boolean), 'page.tsx')
        expect(fs.existsSync(file), `${p} -> ${file}`).toBe(true)
      }
    }
  })

  it('у каждого вычитанного адреса есть настоящий page.tsx', () => {
    for (const p of KK_REVIEWED_PATHS) {
      expect(p.startsWith('/')).toBe(true)
      const file = path.join(process.cwd(), 'src', 'app', ...p.split('/').filter(Boolean), 'page.tsx')
      expect(fs.existsSync(file), `${p} -> ${file}`).toBe(true)
    }
  })

  it('id записей уникальны', () => {
    const ids = KK_REVIEW_ENTRIES.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('каждый гайд из реестра гайдов либо на проверке, либо утверждён (его не забыли)', () => {
    for (const g of GUIDES) {
      const p = `/guides/kk/${g.slug}`
      expect(isKkUnderReview(p) || KK_REVIEWED_PATHS.includes(p), p).toBe(true)
    }
    expect(KK_REVIEWED_GUIDE_SLUGS.length).toBeGreaterThan(0)
  })

  it('каждый переведённый инструмент либо на проверке, либо утверждён', () => {
    for (const slug of LOCALIZED_TOOL_SLUGS) {
      const p = `/tools/kk/${slug}`
      expect(isKkUnderReview(p) || KK_REVIEWED_PATHS.includes(p), p).toBe(true)
    }
    // Вычитанные и ждущие вычитки вместе дают весь список инструментов, без пересечения.
    const underReview = LOCALIZED_TOOL_SLUGS.filter(slug => isKkUnderReview(`/tools/kk/${slug}`))
    expect(underReview).toEqual(['margin'])
    expect(KK_REVIEWED_TOOL_SLUGS.length + underReview.length).toBe(LOCALIZED_TOOL_SLUGS.length)
    for (const slug of underReview) expect(KK_REVIEWED_TOOL_SLUGS).not.toContain(slug)
  })

  it('каждая страница банка /bik/kk либо на проверке, либо утверждена', () => {
    for (const b of BIK_BANK_PAGES) {
      const p = `/bik/kk/${b.slug}`
      expect(isKkUnderReview(p) || KK_REVIEWED_PATHS.includes(p), p).toBe(true)
    }
    expect(KK_REVIEWED_BIK_SLUGS.length).toBe(BIK_BANK_PAGES.length)
  })

  // Механизм оставлен на будущее: плашка стоит под шапкой, над заголовком страницы (а не над
  // логотипом): тот же порядок на инструментах, в гайдах и на страницах банков.
  it('плашка везде после шапки и до заголовка h1, общего layout над логотипом нет', () => {
    const root = process.cwd()
    expect(fs.existsSync(path.join(root, 'src', 'app', 'tools', 'kk', 'layout.tsx'))).toBe(false)
    const files = [
      ...LOCALIZED_TOOL_SLUGS.map(slug => `src/app/tools/${slug}/${slug === 'kp' ? 'Kp' : slug[0].toUpperCase() + slug.slice(1)}Tool.tsx`),
      'src/lib/tools-i18n/ToolsIndexView.tsx',
      'src/app/guides/GuideShell.tsx',
      'src/app/guides/kk/page.tsx',
      'src/app/bik/BikShell.tsx',
    ]
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8')
      const notice = src.indexOf('<KkReviewNotice')
      const header = Math.max(src.indexOf('<ToolLangSwitch'), src.indexOf('<BrandWordmark'))
      const h1 = src.indexOf('<h1')
      expect(notice, `${f}: плашки нет`).toBeGreaterThan(-1)
      expect(notice, `${f}: плашка выше шапки`).toBeGreaterThan(header)
      expect(notice, `${f}: плашка ниже заголовка`).toBeLessThan(h1)
    }
  })

  it('в тексте реестра нет длинного тире', () => {
    expect(JSON.stringify(KK_REVIEW_ENTRIES).includes('—')).toBe(false)
  })
})
