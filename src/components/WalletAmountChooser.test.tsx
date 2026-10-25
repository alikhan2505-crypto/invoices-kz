import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WalletAmountChooser from './WalletAmountChooser'
import { profileBonusDict } from '@/lib/i18n/profileBonus'

// Серверная отрисовка (environment: node): начальное состояние окна выбора.
// Интерактив (ввод, ползунок) покрыт тестами чистых функций в walletChoice.test.ts.

const nbsp = (s: string) => s.replace(/\s/g, ' ')

function render(lang: 'ru' | 'kk' | 'en', price: number, balance: number) {
  const html = renderToStaticMarkup(createElement(WalletAmountChooser, {
    price, balance, tw: profileBonusDict[lang], onConfirm: () => {}, onKaspiOnly: () => {},
  }))
  return nbsp(html.replace(/<!-- -->/g, ''))
}

describe('WalletAmountChooser: first paint', () => {
  it('partial wallet: the maximum is preselected and the buttons say how much goes where', () => {
    const html = render('ru', 5990, 1164)
    expect(html).toContain('Сколько списать с кошелька')
    expect(html).toContain('value="1 164"')
    expect(html).toContain('Остаток через Kaspi: 4 826 ₸')
    expect(html).toContain('Списать 1 164 ₸ с кошелька, остальное 4 826 ₸ через Kaspi')
    expect(html).toContain('Оплатить только через Kaspi')
    expect(html).toContain('Всё')
    expect(html).toContain('25%')
    expect(html).toContain('50%')
  })

  it('wallet covers the price: preselects the full amount, no Kaspi step', () => {
    const html = render('ru', 5990, 20000)
    expect(html).toContain('value="5 990"')
    expect(html).toContain('Через Kaspi платить не нужно')
    expect(html).toContain('Оплатить с кошелька — 5 990 ₸')
  })

  it('wallet almost covers the price: explains the 100 ₸ Kaspi minimum', () => {
    const html = render('ru', 5990, 5950)
    expect(html).toContain('value="5 890"')
    expect(html).toContain('Больше 5 890 ₸ списать нельзя: на Kaspi должно остаться не меньше 100 ₸.')
    expect(html).toContain('Остаток через Kaspi: 100 ₸')
  })

  it('keeps the Kaspi-only button in place (hidden) when it would duplicate the primary one', () => {
    // 0 списать нельзя выбрать при первой отрисовке, а вот кошелёк 0 даёт kaspi_only
    const html = render('ru', 5990, 0)
    expect(html).toContain('invisible')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('Укажите другую сумму')
  })

  it('reserves room for the hint so the dialog does not jump', () => {
    expect(render('ru', 5990, 1164)).toContain('min-h-[2.5rem]')
  })

  it('is a phone-friendly numeric field with accessible names', () => {
    const html = render('ru', 5990, 1164)
    expect(html).toContain('inputMode="numeric"')
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Сумма списания с кошелька, тенге"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('min-h-[48px]')
    expect(html).toContain('min-h-[56px]')
  })

  it('uses only theme tokens, no hard-coded colours', () => {
    const html = render('ru', 5990, 1164)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toMatch(/rgb\(/)
    expect(html).toContain('var(--nav-accent)')
  })

  it('every language has every string and fills the numbers', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const html = render(lang, 5990, 1164)
      const tw = profileBonusDict[lang]
      expect(html).toContain(tw.walletAmountLabel)
      expect(html).toContain(tw.walletAmountAll)
      expect(html).toContain(nbsp(tw.walletRemainderLine('4 826')))
      expect(html).toContain(nbsp(tw.payPartlyFromWalletButton('1 164', '4 826')))
      expect(html).not.toContain('undefined')
    }
  })

  it('new strings in all languages have no em dashes in prose', () => {
    const tw = profileBonusDict.kk
    const strings = [
      tw.walletAmountLabel, tw.walletAmountAll, tw.walletRemainderNone, tw.walletAmountInputAria,
      tw.walletGapHint('5 890', '5 990'), tw.walletMinRemainderCapHint('5 890'), tw.walletCappedHint('1 164'),
      tw.walletAmountInvalidButton,
    ]
    for (const s of strings) expect(s).not.toContain('—')
    for (const lang of ['ru', 'kk', 'en'] as const) {
      const t = profileBonusDict[lang]
      for (const s of [t.walletAmountLabel, t.walletAmountInvalidButton, t.walletRemainderNone, t.walletGapHint('1', '2'), t.walletMinRemainderCapHint('1'), t.walletCappedHint('1')]) {
        expect(s).not.toContain('—')
      }
    }
  })
})
