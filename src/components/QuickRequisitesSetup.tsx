'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { useBinLookup } from '@/components/useBinLookup'
import { quickRequisitesDict } from '@/lib/i18n/quickRequisites'
import { profileBonusDict } from '@/lib/i18n/profileBonus'
import { KAZAKHSTAN_BANKS } from '@/lib/kazakhstanBanks'
import { digitsOnly, normalizeIik, validateBinIin, validateIik } from '@/lib/kzIdentifiers'
import { loadRequisites } from '@/lib/tools-i18n/requisites'
import { hasToolOffer, planToolRequisites, saveToolRequisites, type ProfileLike } from '@/lib/tools-i18n/saveToolRequisites'
import { claimAndAnnounceBonus } from '@/lib/profileBonusClient'

// «Заполните реквизиты за минуту» в /create (03.11.2026), мастер из шагов со сдвигом влево и вправо.
// Статистика: из 10 регистраций за 45 дней 7 так и не заполнили реквизиты и не выставили ни одного счёта,
// а путь был двумя страницами профиля с окнами. Здесь компания (БИН с автозаполнением по кнопке, как на
// странице реквизитов) и банк (банк и ИИК) идут шагами в одной карточке; «Далее» уводит текущий шаг влево,
// «Назад» возвращает вправо, полоса сверху показывает, сколько осталось.
// Требования к счёту не смягчены: те же проверки БИН и ИИК и тот же КБе, что в профиле (saveToolRequisites.ts).
// Показывается, пока в кабинете нет реквизитов или банка и нечего предложить из бесплатного документа (для
// этого есть ToolRequisitesOffer); показываются только недостающие шаги.

const EASE = [0.16, 1, 0.3, 1] as const
const input = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-colors min-h-12 focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
const inputStyle = { background: 'var(--nav-bg)', color: 'var(--nav-text-primary)', border: '1px solid var(--nav-border)' } as const

type Step = 'company' | 'bank'

export default function QuickRequisitesSetup({ profile, profileLoaded, bankCount, banksLoaded, onSaved }: {
  profile: ProfileLike
  profileLoaded: boolean
  bankCount: number
  banksLoaded: boolean
  onSaved: () => void
}) {
  const { lang } = useLanguage()
  const t = quickRequisitesDict[lang]
  const tb = profileBonusDict[lang]
  const reduceMotion = !!useReducedMotion()
  const { binLookup, lookupBin, resetBinLookup } = useBinLookup()
  // null: localStorage ещё не прочитан (после монтирования); не показываем, чтобы карточка не мигала.
  const [toolOffer, setToolOffer] = useState<boolean | null>(null)
  const [index, setIndex] = useState(0)
  // 1: вперёд (текущий шаг уходит влево), -1: назад (уходит вправо).
  const [dir, setDir] = useState<1 | -1>(1)
  const [bin, setBin] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [director, setDirector] = useState('')
  const [bik, setBik] = useState('')
  const [iik, setIik] = useState('')
  const [iikTouched, setIikTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  // Какие шаги нужны, запоминаем при первом показе: после сохранения профиля первый шаг не должен
  // исчезнуть из-под человека посреди мастера.
  const stepsRef = useRef<Step[] | null>(null)

  useEffect(() => {
    if (!profileLoaded || !banksLoaded) return
    const plan = planToolRequisites(profile, bankCount, loadRequisites())
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToolOffer(hasToolOffer(plan, profile))
  }, [profile, profileLoaded, bankCount, banksLoaded])

  // Фокус на первое поле нового шага (после сдвига), чтобы можно было сразу печатать.
  useEffect(() => {
    if (!stepsRef.current || done) return
    const id = window.setTimeout(() => rootRef.current?.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true }), reduceMotion ? 0 : 240)
    return () => window.clearTimeout(id)
  }, [index, done, reduceMotion, toolOffer])

  if (!profileLoaded || !banksLoaded || toolOffer !== false) return null
  const needProfile = !(profile?.company_name || '').trim() || !(profile?.bin_iin || '').trim()
  const needBank = bankCount === 0
  if (!stepsRef.current) {
    const list: Step[] = []
    if (needProfile) list.push('company')
    if (needBank) list.push('bank')
    stepsRef.current = list
  }
  const steps = stepsRef.current
  if (steps.length === 0) return null
  // Данные перечитаны после сохранения: «готово» своё показало, карточка уходит.
  if (done && !needProfile && !needBank) return null
  const step = steps[Math.min(index, steps.length - 1)]
  const total = steps.length
  const last = index >= total - 1

  const binError = validateBinIin(bin)
  const iikError = validateIik(iik)
  const showIikError = iikError && iikError !== 'empty' && (iikTouched || normalizeIik(iik).length >= 20)

  async function lookUp() {
    const company = await lookupBin(bin, { force: true })
    if (!company) return
    // Как на странице реквизитов: подставляем только в пустые поля.
    setName(cur => cur.trim() ? cur : company.name)
    setAddress(cur => cur.trim() ? cur : (company.address || ''))
    setDirector(cur => cur.trim() ? cur : (company.director || ''))
  }

  // Проверка текущего шага; ошибка показывается на нём же и дальше не пускает.
  function stepError(): string {
    if (step === 'company') {
      if (binError) return tb.binErrors[binError]
      if (!name.trim()) return t.errCompany
    } else {
      if (!bik || !iik.trim()) return t.errBank
      if (iikError) { setIikTouched(true); return tb.iikErrors[iikError] }
    }
    return ''
  }

  function goNext() {
    const err = stepError()
    setError(err)
    if (err) return
    setDir(1)
    setIndex(i => Math.min(i + 1, total - 1))
  }

  function goBack() {
    setError('')
    setDir(-1)
    setIndex(i => Math.max(i - 1, 0))
  }

  async function save() {
    const err = stepError()
    setError(err)
    if (err) return
    setBusy(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError(t.errGeneric); return }
      const result = await saveToolRequisites(supabase, user.id, profile, bankCount, {
        ...(needProfile ? { companyName: name, binIin: digitsOnly(bin), address, director } : {}),
        ...(needBank ? { bankBik: bik, iik } : {}),
      })
      if (!result.ok) {
        setError(result.reason === 'bin' && binError ? tb.binErrors[binError] : t.errGeneric)
        return
      }
      void claimAndAnnounceBonus('requisites', lang).then(r => {
        if (r?.credited || r?.alreadyClaimed) return claimAndAnnounceBonus('bank', lang)
      })
      // Короткое «готово» со сдвигом, затем карточка сама уходит: профиль перечитывается и условия показа пропадают.
      setDir(1)
      setDone(true)
      window.setTimeout(onSaved, reduceMotion ? 0 : 1100)
    } catch {
      setError(t.errGeneric)
    } finally {
      setBusy(false)
    }
  }

  const slide = {
    enter: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * 36 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * -36 }),
  }
  const transition = { duration: reduceMotion ? 0.01 : 0.22, ease: EASE }
  const label = 'text-xs mb-1 block'
  const stepNames: Record<Step, string> = { company: t.stepCompanyName, bank: t.stepBankName }
  const progress = done ? 1 : (index + 1) / total

  return (
    <div ref={rootRef} className="mb-4 rounded-xl overflow-hidden" style={{ background: 'var(--nav-accent-soft)', border: '1px solid var(--nav-border)' }}>
      {/* Полоса хода: растёт с каждым шагом */}
      <div className="h-1" style={{ background: 'var(--nav-border-soft)' }} aria-hidden="true">
        <motion.div className="h-full" style={{ background: 'var(--nav-accent)', transformOrigin: 'left' }}
          initial={false} animate={{ scaleX: progress }} transition={{ duration: reduceMotion ? 0.01 : 0.3, ease: EASE }} />
      </div>
      <form onSubmit={e => { e.preventDefault(); if (busy || done) return; if (last) void save(); else goNext() }} className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</div>
          {total > 1 && !done && (
            <div className="text-[11px] whitespace-nowrap" style={{ color: 'var(--nav-text-muted)' }} aria-live="polite">
              {t.stepLabel(index + 1, total)} · {stepNames[step]}
            </div>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          {done ? (
            <motion.div key="done" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={transition}
              className="flex items-center gap-3 py-2" role="status">
              <motion.div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--nav-success-solid)', color: 'var(--nav-success-ink)' }}
                initial={reduceMotion ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              </motion.div>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.doneTitle}</div>
                <div className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.doneHint}</div>
              </div>
            </motion.div>
          ) : step === 'company' ? (
            <motion.div key="company" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={transition} className="space-y-3">
              <div>
                <label htmlFor="qr-bin" className={label} style={{ color: 'var(--nav-text-secondary)' }}>{t.binLabel}</label>
                <div className="flex gap-2">
                  <input id="qr-bin" className={`${input} flex-1 min-w-0`} style={inputStyle} inputMode="numeric" pattern="[0-9]*"
                    autoComplete="off" spellCheck={false} placeholder="123456789012" value={bin}
                    onChange={e => { const v = digitsOnly(e.target.value).slice(0, 12); setBin(v); setError(''); if (v.length !== 12) resetBinLookup() }} />
                  <button type="button" onClick={() => void lookUp()} disabled={bin.length !== 12 || binLookup.status === 'loading'}
                    className="px-3 rounded-xl text-sm font-medium flex-shrink-0 min-h-12 disabled:opacity-40"
                    style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-accent)', border: '1px solid var(--nav-border)' }}>
                    {binLookup.status === 'loading' ? '…' : t.lookupButton}
                  </button>
                </div>
                {binError && binError !== 'empty' && bin.length >= 12 && (
                  <div role="alert" className="text-xs mt-1" style={{ color: 'var(--nav-critical)' }}>{tb.binErrors[binError]}</div>
                )}
                {binLookup.status === 'found' && binLookup.company && (
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-success)' }}>{t.lookupFound(binLookup.company.name)}</div>
                )}
                {binLookup.status === 'notfound' && (
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.lookupNotFound}</div>
                )}
                {binLookup.status === 'idle' && !bin && (
                  <div className="text-xs mt-1" style={{ color: 'var(--nav-text-secondary)' }}>{t.hint}</div>
                )}
              </div>
              <div>
                <label htmlFor="qr-name" className={label} style={{ color: 'var(--nav-text-secondary)' }}>{t.companyLabel}</label>
                <input id="qr-name" className={input} style={inputStyle} placeholder={t.companyPlaceholder} value={name}
                  onChange={e => { setName(e.target.value); setError('') }} />
              </div>
            </motion.div>
          ) : (
            <motion.div key="bank" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={transition} className="space-y-3">
              <div>
                <label htmlFor="qr-bank" className={label} style={{ color: 'var(--nav-text-secondary)' }}>{t.bankLabel}</label>
                <select id="qr-bank" className={input} style={inputStyle} value={bik} onChange={e => { setBik(e.target.value); setError('') }}>
                  <option value="">{t.bankPlaceholder}</option>
                  {KAZAKHSTAN_BANKS.map(b => <option key={b.bik} value={b.bik}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="qr-iik" className={label} style={{ color: 'var(--nav-text-secondary)' }}>{t.iikLabel}</label>
                <input id="qr-iik" className={input} style={inputStyle} placeholder={t.iikPlaceholder} value={iik}
                  autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
                  onChange={e => { setIik(e.target.value); setError('') }} onBlur={() => { if (iik.trim()) setIikTouched(true) }} />
                {showIikError && <div role="alert" className="text-xs mt-1" style={{ color: 'var(--nav-critical)' }}>{tb.iikErrors[iikError]}</div>}
                <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>
                  {t.otherBank} <Link href="/profile/banks?next=/create" className="underline">{t.otherBankLink}</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!done && (
          <>
            <div className="mt-4 flex items-center gap-2">
              {index > 0 && (
                <button type="button" onClick={goBack} disabled={busy}
                  className="rounded-xl px-4 min-h-12 text-[13px] font-semibold" style={{ color: 'var(--nav-accent)', border: '1px solid var(--nav-border)' }}>
                  {t.backButton}
                </button>
              )}
              <button type="submit" disabled={busy}
                className="flex-1 rounded-xl px-4 min-h-12 text-[13px] font-semibold transition-colors disabled:opacity-60"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {busy ? t.saving : last ? t.saveButton : t.nextButton}
              </button>
            </div>
            <div aria-live="polite">
              {error && <div className="text-[12px] mt-2" style={{ color: 'var(--nav-critical)' }} role="alert">{error}</div>}
            </div>
          </>
        )}
      </form>
    </div>
  )
}
