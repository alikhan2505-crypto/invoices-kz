import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  isKkUnderReview,
  KK_REVIEW_BIK_SLUGS,
  KK_REVIEW_ENTRIES,
  KK_REVIEW_GUIDE_SLUGS,
  KK_REVIEW_TOOL_SLUGS,
  KK_REVIEWED_PATHS,
} from './kkReview'
import { GUIDES } from './guides'
import { LOCALIZED_TOOL_SLUGS } from './tools-i18n'
import { BIK_BANK_PAGES } from './bikRegistry'

describe('isKkUnderReview', () => {
  it('kk-страницы инструментов, гайдов и банков из реестра на проверке', () => {
    expect(isKkUnderReview('/tools/kk/zarplata')).toBe(true)
    expect(isKkUnderReview('/tools/kk')).toBe(true)
    expect(isKkUnderReview('/guides/kk/mrp-2026')).toBe(true)
    expect(isKkUnderReview('/guides/kk')).toBe(true)
    expect(isKkUnderReview('/bik/kk')).toBe(true)
    expect(isKkUnderReview('/bik/kk/halyk-bank')).toBe(true)
  })

  it('русские и английские версии, кабинет и корень не на проверке', () => {
    expect(isKkUnderReview('/tools/zarplata')).toBe(false)
    expect(isKkUnderReview('/tools/en/zarplata')).toBe(false)
    expect(isKkUnderReview('/guides/mrp-2026')).toBe(false)
    expect(isKkUnderReview('/bik/halyk-bank')).toBe(false)
    expect(isKkUnderReview('/profile/documents')).toBe(false)
    expect(isKkUnderReview('/')).toBe(false)
  })

  it('точное совпадение: похожий адрес с другим слагом не считается', () => {
    // 'komissiya-kaspi' в реестре, а 'komissiya-kaspi-xyz' нет: префикс не должен цеплять лишнее
    expect(isKkUnderReview('/guides/kk/komissiya-kaspi')).toBe(true)
    expect(isKkUnderReview('/guides/kk/komissiya-kaspi-xyz')).toBe(false)
    expect(isKkUnderReview('/tools/kk/unknown-tool')).toBe(false)
    expect(isKkUnderReview('/tools/kk/zarplata/extra')).toBe(false)
  })

  it('слэш в конце, строка запроса и якорь не мешают', () => {
    expect(isKkUnderReview('/tools/kk/zarplata/')).toBe(true)
    expect(isKkUnderReview('/guides/kk/mrp-2026?utm_source=x')).toBe(true)
    expect(isKkUnderReview('/bik/kk/halyk-bank#faq')).toBe(true)
  })

  it('пустой или отсутствующий адрес даёт false', () => {
    expect(isKkUnderReview(null)).toBe(false)
    expect(isKkUnderReview(undefined)).toBe(false)
    expect(isKkUnderReview('')).toBe(false)
  })
})

describe('реестр kkReview', () => {
  const pageEntries = KK_REVIEW_ENTRIES.filter(e => e.scope === 'page')

  it('у каждой страницы реестра есть настоящий page.tsx', () => {
    for (const e of pageEntries) {
      for (const p of e.paths) {
        expect(p.startsWith('/')).toBe(true)
        const file = path.join(process.cwd(), 'src', 'app', ...p.split('/').filter(Boolean), 'page.tsx')
        expect(fs.existsSync(file), `${p} -> ${file}`).toBe(true)
      }
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
    expect(KK_REVIEW_GUIDE_SLUGS.length).toBeGreaterThan(0)
  })

  it('каждый переведённый инструмент либо на проверке, либо утверждён', () => {
    for (const slug of LOCALIZED_TOOL_SLUGS) {
      const p = `/tools/kk/${slug}`
      expect(isKkUnderReview(p) || KK_REVIEWED_PATHS.includes(p), p).toBe(true)
    }
    expect(KK_REVIEW_TOOL_SLUGS.length).toBe(LOCALIZED_TOOL_SLUGS.length)
  })

  it('каждая страница банка /bik/kk либо на проверке, либо утверждена', () => {
    for (const b of BIK_BANK_PAGES) {
      const p = `/bik/kk/${b.slug}`
      expect(isKkUnderReview(p) || KK_REVIEWED_PATHS.includes(p), p).toBe(true)
    }
    expect(KK_REVIEW_BIK_SLUGS.length).toBe(BIK_BANK_PAGES.length)
  })

  it('в тексте записей и в реестре нет длинного тире', () => {
    const text = JSON.stringify(KK_REVIEW_ENTRIES)
    expect(text.includes('—')).toBe(false)
  })
})
