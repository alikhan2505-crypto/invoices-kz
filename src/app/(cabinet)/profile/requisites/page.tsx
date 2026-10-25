'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import { useAppDialog } from '@/components/AppDialog'
import { useBinLookup } from '@/components/useBinLookup'
import { returnPathFromSearch, type ReturnPath } from '@/lib/returnPath'
import { validateBinIin, digitsOnly } from '@/lib/kzIdentifiers'
import { profileBonusDict } from '@/lib/i18n/profileBonus'
import { claimAndAnnounceBonus } from '@/lib/profileBonusClient'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

// Same input treatment as src/app/create/page.tsx's form fields -- token
// borders/focus ring, no remount-on-keystroke (plain controlled input).
const inputClass = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

function Field({
  label, value, onChange, placeholder, type = 'text', maxLength, className,
}: {
  className?: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  maxLength?: number
}) {
  return (
    <div className={className}>
      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{label}</label>
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        type={type}
        maxLength={maxLength}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

export default function Requisites() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const tb = profileBonusDict[lang]
  // Same shadowing as /create: see src/components/AppDialog.tsx.
  const { alert, dialogElement } = useAppDialog()
  const { binLookup, lookupBin, resetBinLookup } = useBinLookup()

  /**
   * Fills the user's own requisites from the register.
   *
   * Same rule as the counterparty form: only empty fields are touched. A
   * company's registered name and the name it wants printed on its invoices
   * are not always the same thing, and the person editing this page knows
   * which they want.
   */
  async function lookUpOwnBin(force = false) {
    const company = await lookupBin(profile.bin_iin, { force })
    if (!company) return
    // Empty fields are filled straight away -- that is the whole point on a
    // blank form. Fields that already hold something are left alone and
    // offered through applyRegistryData instead: on your OWN requisites the
    // form is usually already filled in, so silently changing nothing made
    // the button look broken, and saying "Заполнено из реестра" when nothing
    // had been filled was simply untrue.
    setProfile(current => ({
      ...current,
      company_name: current.company_name?.trim() ? current.company_name : company.name,
      address: current.address?.trim() ? current.address : (company.address || ''),
      director_name: current.director_name?.trim() ? current.director_name : (company.director || ''),
    }))
  }

  /** Overwrites the fields with what the register says, on explicit request. */
  function applyRegistryData() {
    const company = binLookup.company
    if (!company) return
    setProfile(current => ({
      ...current,
      company_name: company.name || current.company_name,
      address: company.address || current.address,
      director_name: company.director || current.director_name,
    }))
  }

  /** What the register holds that differs from what is in the form now. */
  function registryDifferences() {
    const company = binLookup.company
    if (!company) return []
    const rows: { label: string; value: string }[] = []
    const add = (label: string, value: string | null, current: string | undefined) => {
      if (value && value.trim() !== (current || '').trim()) rows.push({ label, value })
    }
    add(t.companyNameFieldLabel, company.name, profile.company_name)
    add(t.legalAddressFieldLabel, company.address, profile.address)
    add(t.directorNameFieldLabel, company.director, profile.director_name)
    return rows
  }
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [saving, setSaving] = useState(false)
  // Ошибку БИН показываем, когда набрано 12 цифр или после попытки сохранить —
  // не на каждой первой цифре.
  const [binTouched, setBinTouched] = useState(false)
  const [profile, setProfile] = useState({
    company_name: '', bin_iin: '', address: '', email: '', phone: '',
    director_name: '', accountant_name: ''
  })
  // ?next=/create — сюда прислал /create, где ждёт черновик счёта; после
  // сохранения возвращаем туда же, а не в /profile. См. src/lib/returnPath.ts.
  const [returnTo, setReturnTo] = useState<ReturnPath | null>(null)

  useEffect(() => {
    // Адрес есть только в браузере; прочитать его при рендере — расхождение гидратации.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnTo(returnPathFromSearch(window.location.search))
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Только поля этой формы. Раньше грузилась вся строка profiles, а
      // сохранялась она же целиком через upsert — и откатывала всё, что
      // успело измениться, пока страница была открыта: номер следующего
      // счёта, telegram_chat_id, настройки уведомлений (а у админов, кого
      // триггер пропускает, — и тариф с балансом).
      const { data } = await supabase
        .from('profiles')
        .select('company_name, bin_iin, address, email, phone, director_name, accountant_name')
        .eq('id', user.id)
        .single()
      if (data) {
        setProfile({
          company_name: data.company_name || '',
          bin_iin: data.bin_iin || '',
          address: data.address || '',
          email: data.email || '',
          phone: data.phone || '',
          director_name: data.director_name || '',
          accountant_name: data.accountant_name || '',
        })
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 9)
    if (digits.length > 9) result += ' ' + digits.slice(9, 11)
    return result
  }

  async function save() {
    // /create refuses to issue an invoice without a company name AND a БИН.
    // This page used to accept either one missing, answer "Сохранено!", and
    // send the user back to an invoice that bounced them here again with the
    // same message -- a loop with no exit, since nothing ever said which
    // field was the problem. Checked here so the answer is given where the
    // fields are.
    const missing = [
      !profile.company_name?.trim() && t.companyNameFieldLabel,
      !profile.bin_iin?.trim() && t.binIinFieldLabel,
    ].filter(Boolean) as string[]
    if (missing.length > 0) {
      alert(t.requisitesMissingAlert(missing.map(m => m.replace(' *', '')).join(', ')))
      return
    }
    // Контрольная цифра БИН/ИИН (15.10.2026): опечатка в своём БИН уходит в
    // каждый счёт. Старые сохранённые значения не трогаются — проверка только
    // при следующем сохранении.
    const binError = validateBinIin(profile.bin_iin)
    if (binError) {
      setBinTouched(true)
      alert(tb.binErrors[binError])
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // update, не upsert: строка profiles всегда есть (её создаёт триггер
      // при регистрации), а меняются ровно поля этой формы.
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          company_name: profile.company_name,
          bin_iin: digitsOnly(profile.bin_iin),
          address: profile.address,
          email: profile.email,
          phone: profile.phone,
          director_name: profile.director_name,
          accountant_name: profile.accountant_name,
        })
        .eq('id', user.id)
        .select('id')
      // PostgREST отвечает «успехом» и на update без единой строки — без
      // этой проверки человек увидел бы «Сохранено!», а сохранено ничего.
      if (error || !updated || updated.length === 0) {
        await alert(t.errorPrefix(error?.message || t.profileNotSavedMessage))
        return
      }
      // Бонус за реквизиты — сервер сам перепроверит БИН по реестру (бывает
      // небыстро), поэтому не ждём: всплывашка живёт в document.body и
      // покажется и после перехода обратно в /create.
      // Банковский счёт мог быть сохранён раньше реквизитов (путь из /create:
      // сначала банк не засчитался — БИН был пустой). Реквизиты теперь
      // в порядке — пробуем и банк; повторный запрос безопасен.
      void claimAndAnnounceBonus('requisites', lang).then(r => {
        if (r?.credited || r?.alreadyClaimed) return claimAndAnnounceBonus('bank', lang)
      })
      await alert(t.savedAlert)
      router.push(returnTo || '/profile')
    } catch (e: any) {
      await alert(t.errorPrefix(e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
      <>
        <PageContainer>
          <PageHeader
            title={t.requisitesHeaderLabel}
            backHref={returnTo || '/profile'}
          />

          {returnTo && (
            <div className="mb-4 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-primary)' }}>
              {t.returnToInvoiceHint}
            </div>
          )}

          <motion.div
            className={`nav-glass nav-card-accent rounded-2xl p-5 space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-4 md:items-start ${CARD_HOVER}`}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.06 }}
          >
            {/* БИН first here too: it is the field that fills the others.
                Unlike the counterparty form this one can also fill in the
                director, because the register publishes it for legal
                entities. */}
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.binIinFieldLabel}</label>
              <div className="flex gap-2">
                <input
                  className={inputClass.replace('w-full', 'flex-1')}
                  placeholder={t.binIinPlaceholder}
                  value={profile.bin_iin}
                  onChange={async e => {
                    const value = e.target.value
                    setProfile({ ...profile, bin_iin: value })
                    if (value.replace(/\D/g, '').length !== 12) { resetBinLookup(); return }
                  }}
                />
                <button
                  type="button"
                  onClick={() => lookUpOwnBin(true)}
                  disabled={(profile.bin_iin || '').replace(/\D/g, '').length !== 12 || binLookup.status === 'loading'}
                  className="px-3 rounded-lg text-sm font-medium flex-shrink-0 disabled:opacity-40 transition-colors"
                  style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-accent)' }}>
                  {binLookup.status === 'loading' ? '…' : t.binLookupCheckButton}
                </button>
              </div>
              {(() => {
                const err = validateBinIin(profile.bin_iin)
                const show = err && err !== 'empty' && (binTouched || digitsOnly(profile.bin_iin).length >= 12)
                return show ? (
                  <div role="alert" className="text-xs mt-1" style={{ color: 'var(--nav-critical)' }}>{tb.binErrors[err]}</div>
                ) : null
              })()}
              {binLookup.status === 'notfound' && (
                <div className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.binLookupNotFound}</div>
              )}
              {binLookup.status === 'found' && (() => {
                const diffs = registryDifferences()
                return (
                  <div className="text-xs mt-2 leading-snug rounded-lg p-3" style={{ background: 'var(--nav-surface-glass)' }}>
                    {diffs.length === 0 ? (
                      <div style={{ color: 'var(--nav-text-secondary)' }}>{t.binLookupMatches}</div>
                    ) : (
                      <>
                        <div className="mb-1.5" style={{ color: 'var(--nav-text-secondary)' }}>{t.binLookupRegistrySays}</div>
                        {diffs.map(row => (
                          <div key={row.label} style={{ color: 'var(--nav-text-primary)' }}>
                            <span style={{ color: 'var(--nav-text-muted)' }}>{row.label}: </span>{row.value}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={applyRegistryData}
                          className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                          {t.binLookupApplyButton}
                        </button>
                      </>
                    )}
                    <div className="mt-2" style={{ color: 'var(--nav-text-muted)' }}>
                      {binLookup.company?.source === 'kgd' ? t.binLookupSourceKgd : t.binLookupSourceEgov}
                    </div>
                  </div>
                )
              })()}
            </div>

            <Field label={t.companyNameFieldLabel} placeholder={t.companyNamePlaceholder}
              value={profile.company_name} onChange={v => setProfile({ ...profile, company_name: v })} />

            <Field className="md:col-span-2" label={t.legalAddressFieldLabel} placeholder={t.legalAddressPlaceholder}
              value={profile.address} onChange={v => setProfile({ ...profile, address: v })} />

            <Field label={t.emailFieldLabel} placeholder={t.emailPlaceholder}
              value={profile.email} onChange={v => setProfile({ ...profile, email: v })} />

            <Field label={t.phoneFieldLabel} placeholder={t.phonePlaceholder} type="tel" maxLength={16}
              value={profile.phone} onChange={v => setProfile({ ...profile, phone: formatPhone(v) })} />

            <Field label={t.directorNameFieldLabel} placeholder={t.personNamePlaceholder}
              value={profile.director_name} onChange={v => setProfile({ ...profile, director_name: v })} />

            <Field label={t.accountantNameFieldLabel} placeholder={t.personNamePlaceholder}
              value={profile.accountant_name} onChange={v => setProfile({ ...profile, accountant_name: v })} />
          </motion.div>

          <motion.button
            onClick={save}
            disabled={saving}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.14 }}
            className="w-full lg:w-fit lg:px-16 rounded-xl py-3.5 text-sm font-semibold mt-4 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)', boxShadow: '0 10px 24px -10px var(--nav-accent)' }}
          >
            {saving ? t.savingEllipsis : t.saveChangesButton}
          </motion.button>
        </PageContainer>
        {dialogElement}
      </>
  )
}
