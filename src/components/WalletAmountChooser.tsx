'use client'

// Окно «Как оплатить»: человек сам выбирает, сколько списать с кошелька, а
// остальное уходит на Kaspi. Только отображение и выбор числа: проверку суммы
// (границы, минимальный остаток на Kaspi) делают чистые функции из
// planActivation.ts, те же, что на сервере в /api/payment/create. Здесь число
// лишь приводится к допустимому, окончательное слово всегда за сервером.

import { useRef, useState, type CSSProperties, type FocusEvent, type SyntheticEvent } from 'react'
import type { ProfileBonusContent } from '@/lib/i18n/profileBonus'
import {
  defaultWalletAmount,
  resolveWalletPart,
  snapWalletAmount,
  walletChoiceBounds,
  walletQuickAmounts,
} from '@/lib/plans/planActivation'

const PRESS = 'transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
const BTN_PRIMARY: CSSProperties = { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', border: '1.5px solid transparent' }
const BTN_OUTLINE: CSSProperties = { border: '1.5px solid var(--nav-accent)', color: 'var(--nav-accent)', background: 'transparent' }
const CHIP_BASE: CSSProperties = { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)', border: '1.5px solid var(--nav-border-soft)' }
const CHIP_ACTIVE: CSSProperties = { background: 'var(--nav-accent-soft)', color: 'var(--nav-accent)', border: '1.5px solid var(--nav-accent)' }
// WebkitTextFillColor: globals.css красит буквы всех input через него, в тёмной
// теме от ОС (без data-theme) текст иначе тёмный на тёмном.
const INPUT_STYLE: CSSProperties = {
  background: 'var(--nav-surface-glass)',
  color: 'var(--nav-text-primary)',
  WebkitTextFillColor: 'var(--nav-text-primary)',
}

const fmt = (n: number) => n.toLocaleString('ru-KZ')

interface Props {
  /** Цена тарифа (из ответа сервера). */
  price: number
  /** Баланс кошелька вместе со своими удержаниями (из ответа сервера). */
  balance: number
  tw: ProfileBonusContent
  /** Подтвердили сумму: 0 = только Kaspi, цена = целиком с кошелька, между = частично. */
  onConfirm: (walletAmount: number) => void
  /** Явная кнопка «только через Kaspi». */
  onKaspiOnly: () => void
}

export default function WalletAmountChooser({ price, balance, tw, onConfirm, onKaspiOnly }: Props) {
  const bounds = walletChoiceBounds(price, balance)
  const [amount, setAmount] = useState(() => defaultWalletAmount(price, balance))
  // Пока поле в фокусе, показываем то, что человек печатает (в том числе пусто).
  const [draft, setDraft] = useState<string | null>(null)
  const [capped, setCapped] = useState(false)
  // Защита от двойного нажатия: второй тап до закрытия окна ничего не делает.
  const sent = useRef(false)
  // iOS/Safari сбрасывает выделение на mouseup/touchend сразу после фокуса:
  // первый такой отпуск пальца гасим, иначе цифра допишется к старой сумме.
  const justFocused = useRef(false)
  // Человек уже начал печатать: отложенное выделение не должно съесть первую цифру.
  const typedSinceFocus = useRef(false)

  const resolution = resolveWalletPart(price, balance, amount)
  const quick = walletQuickAmounts(price, balance)
  const shown = draft !== null ? draft : fmt(amount)

  // from: сумма до движения ползунка. Нужна, чтобы стрелки с клавиатуры
  // перепрыгивали «щель» у цены в нужную сторону, а не отскакивали назад.
  const pick = (v: number, from?: number) => {
    setAmount(snapWalletAmount(price, balance, v, from))
    setDraft(null)
    setCapped(false)
  }

  const onInput = (raw: string) => {
    typedSinceFocus.current = true
    const digits = raw.replace(/\D/g, '').slice(0, 9)
    if (!digits) {
      setDraft('')
      setAmount(0)
      setCapped(false)
      return
    }
    const cap = Math.min(bounds.balance, bounds.price)
    let n = parseInt(digits, 10)
    const over = n > cap
    if (over) n = cap
    setAmount(n)
    setDraft(fmt(n))
    // Подсказку «на кошельке столько-то» показываем, только если потолок это
    // именно кошелёк. Если денег хватает на всю цену, лишнее просто отрезаем:
    // строка «Через Kaspi платить не нужно» и так всё объясняет.
    setCapped(over && bounds.balance < bounds.price)
  }

  const onFocusInput = (e: FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    justFocused.current = true
    typedSinceFocus.current = false
    el.select()
    // Повтор после отрисовки: WebKit иначе возвращает курсор в конец.
    setTimeout(() => {
      if (typedSinceFocus.current || document.activeElement !== el) return
      try { el.select(); el.setSelectionRange(0, 9999) } catch { /* поле уже ушло из DOM */ }
    }, 0)
  }
  const keepSelection = (e: SyntheticEvent) => {
    if (justFocused.current) { e.preventDefault(); justFocused.current = false }
  }

  const kaspiOnlyDuplicate = resolution.ok && resolution.mode === 'kaspi_only'
  const kaspiLeft = resolution.ok ? resolution.kaspi : null
  const limitedByMinimum = !bounds.canPayFull && bounds.balance > bounds.maxPartial

  let hint: string | null = null
  if (!resolution.ok && resolution.reason === 'remainder_too_small') {
    hint = bounds.canPayFull
      ? tw.walletGapHint(fmt(bounds.maxPartial), fmt(bounds.price))
      : tw.walletMinRemainderCapHint(fmt(bounds.maxPartial))
  } else if (capped) {
    hint = tw.walletCappedHint(fmt(bounds.balance))
  } else if (limitedByMinimum) {
    hint = tw.walletMinRemainderCapHint(fmt(bounds.maxPartial))
  }

  const primaryLabel = !resolution.ok ? tw.walletAmountInvalidButton
    : resolution.mode === 'kaspi_only' ? tw.payOnlyKaspiButton
    : resolution.mode === 'wallet_full' ? tw.payFullyFromWalletButton(fmt(resolution.wallet))
    : tw.payPartlyFromWalletButton(fmt(resolution.wallet), fmt(resolution.kaspi))

  const chip = (value: number, label: string) => {
    const active = amount === value && draft === null
    return (
      <button key={`${label}-${value}`} type="button" onClick={() => pick(value)}
        aria-pressed={active}
        className={`min-h-[44px] min-w-[64px] rounded-xl px-4 text-sm font-semibold tabular-nums ${PRESS}`}
        style={active ? CHIP_ACTIVE : CHIP_BASE}>
        {label}
      </button>
    )
  }

  return (
    <div>
      <label htmlFor="wallet-amount-input" className="block text-sm font-medium mb-2" style={{ color: 'var(--nav-text-primary)' }}>
        {tw.walletAmountLabel}
      </label>
      <div className="relative">
        <input id="wallet-amount-input" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
          value={shown} placeholder="0"
          aria-label={tw.walletAmountInputAria}
          onChange={e => onInput(e.target.value)}
          onFocus={onFocusInput}
          onMouseUp={keepSelection}
          onTouchEnd={keepSelection}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pick(amount) } }}
          onBlur={() => { justFocused.current = false; pick(amount) }}
          className="w-full min-h-[52px] rounded-xl pl-4 pr-10 text-base font-semibold tabular-nums outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
          style={INPUT_STYLE} />
        <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold"
          style={{ color: 'var(--nav-text-muted)' }}>₸</span>
      </div>

      <div className="flex items-center min-h-[44px] mt-1">
        <input type="range" min={0} max={bounds.max} step={1} value={amount}
          aria-label={tw.walletAmountSliderAria}
          aria-valuetext={`${fmt(amount)} ₸`}
          onChange={e => pick(Number(e.target.value), amount)}
          className="w-full h-11 cursor-pointer"
          style={{ accentColor: 'var(--nav-accent)' }} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {quick.map(v => chip(v, `${Math.round((v / bounds.max) * 100)}%`))}
        {bounds.max > 0 && chip(bounds.max, tw.walletAmountAll)}
      </div>

      <div className="rounded-xl px-4 py-3 mb-4 text-sm" style={{ background: 'var(--nav-surface-glass)' }} aria-live="polite">
        <div className="tabular-nums font-semibold min-h-5" style={{ color: 'var(--nav-text-primary)' }}>
          {kaspiLeft === null ? null : kaspiLeft === 0 ? tw.walletRemainderNone : tw.walletRemainderLine(fmt(kaspiLeft))}
        </div>
        {/* Место под подсказку держим всегда: окно не прыгает при вводе. */}
        <div className="text-xs mt-1 leading-snug min-h-[2.5rem]" style={{ color: 'var(--nav-text-muted)' }}>{hint}</div>
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" disabled={!resolution.ok}
          onClick={() => { if (resolution.ok && !sent.current) { sent.current = true; onConfirm(resolution.wallet) } }}
          className={`w-full min-h-[56px] rounded-xl text-sm font-semibold px-4 py-3 leading-snug disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${PRESS}`}
          style={BTN_PRIMARY}>
          {primaryLabel}
        </button>
        {/* При «0» главная кнопка уже «только Kaspi»: вторую прячем, но место
            оставляем, чтобы окно не меняло высоту. */}
        <button type="button" onClick={() => { if (!sent.current) { sent.current = true; onKaspiOnly() } }}
          disabled={kaspiOnlyDuplicate} tabIndex={kaspiOnlyDuplicate ? -1 : undefined}
          aria-hidden={kaspiOnlyDuplicate || undefined}
          className={`w-full min-h-[48px] rounded-xl text-sm font-semibold px-4 py-3 ${kaspiOnlyDuplicate ? 'invisible' : ''}`}
          style={BTN_OUTLINE}>
          {tw.payOnlyKaspiButton}
        </button>
      </div>
    </div>
  )
}
