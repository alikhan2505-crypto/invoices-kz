'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/components/LanguageProvider'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import { useAppDialog } from '@/components/AppDialog'
import { checkNextNumber, digitsOnly, highestIssuedNumber } from '@/lib/docNumbering'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import Skeleton from '@/components/Skeleton'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

// Same rounded-bordered field treatment used by src/app/create/page.tsx's form
// inputs -- adopted here instead of this page's old underline-only style so
// every text field in the app now shares one visual language.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

type Settings = {
  invoice_prefix: string
  invoice_next_number: string
  default_due_days: string
  default_note: string
  vat_type: string
  kp_prefix: string
  kp_next_number: string
  avr_prefix: string
  avr_next_number: string
  nakladnaya_prefix: string
  nakladnaya_next_number: string
}

// «Валюта по умолчанию» убрана (15.10.2026): её нигде не применяли — счёт
// всегда в тенге. Колонка profiles.default_currency в базе осталась как есть.
const DEFAULT_SETTINGS: Settings = {
  invoice_prefix: 'INV-',
  invoice_next_number: '0001',
  default_due_days: '3',
  default_note: '',
  vat_type: 'no_vat',
  kp_prefix: 'КП-',
  kp_next_number: '1',
  avr_prefix: 'АВР-',
  avr_next_number: '1',
  nakladnaya_prefix: 'НАК-',
  nakladnaya_next_number: '1',
}

// Четыре вида документов с собственной нумерацией. Номера выдают функции в
// базе: claim_invoice_number (invoice_next_number — текст, ширина номера
// задаётся длиной: 0001 → 0002) и claim_doc_number (kp/avr/nakladnaya —
// int, номер дополняется нулями до 4 знаков). Проверка — src/lib/docNumbering.ts.
type NumberedDoc = {
  prefixField: 'invoice_prefix' | 'kp_prefix' | 'avr_prefix' | 'nakladnaya_prefix'
  numberField: 'invoice_next_number' | 'kp_next_number' | 'avr_next_number' | 'nakladnaya_next_number'
  table: 'invoices' | 'kp_documents' | 'avr_documents' | 'nakladnaya_documents'
  // invoice_next_number в базе — текст (ведущие нули важны), остальные — int.
  storedAsText: boolean
}
const NUMBERED_DOCS: NumberedDoc[] = [
  { prefixField: 'invoice_prefix', numberField: 'invoice_next_number', table: 'invoices', storedAsText: true },
  { prefixField: 'kp_prefix', numberField: 'kp_next_number', table: 'kp_documents', storedAsText: false },
  { prefixField: 'avr_prefix', numberField: 'avr_next_number', table: 'avr_documents', storedAsText: false },
  { prefixField: 'nakladnaya_prefix', numberField: 'nakladnaya_next_number', table: 'nakladnaya_documents', storedAsText: false },
]

/**
 * Номера уже выданных документов этого вида с таким префиксом. Постранично:
 * PostgREST отдаёт не больше 1000 строк за раз, а пропущенная страница
 * означала бы пропущенный «уже выданный» номер.
 */
async function fetchIssuedNumbers(table: NumberedDoc['table'], userId: string, prefix: string): Promise<string[]> {
  const PAGE = 1000
  const numbers: string[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('number').eq('user_id', userId)
    // Без экранирования: % и _ из префикса здесь только расширяют выборку,
    // точное сравнение делает highestIssuedNumber. С обратной косой чертой
    // (символ экранирования LIKE) фильтр не ставим вовсе — тоже лишь шире.
    if (prefix && !prefix.includes('\\')) query = query.like('number', `${prefix}%`)
    const { data, error } = await query.order('id').range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data || []) if (typeof row.number === 'string') numbers.push(row.number)
    if (!data || data.length < PAGE) break
  }
  return numbers
}

export default function InvoiceSettings() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  // Shadows window.alert for this component -- see src/components/AppDialog.tsx.
  const { alert, dialogElement } = useAppDialog()
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  // Что было в базе при открытии страницы. Номер и префикс документа
  // записываются, только если человек их менял: claim_* в базе двигает
  // номер с каждым выпущенным документом, и сохранение «как было при
  // открытии» откатило бы его назад — к уже выданному номеру.
  const initialRef = useRef<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      // Только поля этой страницы — раньше select('*') + upsert всей строки.
      const { data } = await supabase
        .from('profiles')
        .select('invoice_prefix, invoice_next_number, default_due_days, default_note, vat_type, kp_prefix, kp_next_number, avr_prefix, avr_next_number, nakladnaya_prefix, nakladnaya_next_number')
        .eq('id', user.id)
        .single()
      if (data) {
        const next: Settings = {
          invoice_prefix: data.invoice_prefix || 'INV-',
          invoice_next_number: String(data.invoice_next_number || '0001'),
          default_due_days: data.default_due_days || '3',
          default_note: data.default_note || '',
          vat_type: data.vat_type || 'no_vat',
          kp_prefix: data.kp_prefix || 'КП-',
          kp_next_number: String(data.kp_next_number || 1),
          avr_prefix: data.avr_prefix || 'АВР-',
          avr_next_number: String(data.avr_next_number || 1),
          nakladnaya_prefix: data.nakladnaya_prefix || 'НАК-',
          nakladnaya_next_number: String(data.nakladnaya_next_number || 1),
        }
        initialRef.current = next
        setSettings(next)
      }
      setLoaded(true)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sectionLabels: Record<NumberedDoc['numberField'], string> = {
    invoice_next_number: t.invoiceNumberingSectionLabel,
    kp_next_number: t.kpNumberingSectionLabel,
    avr_next_number: t.avrNumberingSectionLabel,
    nakladnaya_next_number: t.nakladnayaNumberingSectionLabel,
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const patch: Record<string, string | number> = {
        default_due_days: settings.default_due_days,
        default_note: settings.default_note,
        vat_type: settings.vat_type,
      }

      for (const doc of NUMBERED_DOCS) {
        const prefix = settings[doc.prefixField]
        const raw = settings[doc.numberField]
        const initial = initialRef.current
        if (prefix === initial[doc.prefixField] && raw === initial[doc.numberField]) continue

        const section = sectionLabels[doc.numberField]
        // Сначала форма (цифры, не ноль) — без запроса в базу.
        const shape = checkNextNumber(raw, 0)
        if (!shape.ok) { await alert(t.nextNumberInvalidAlert(section)); return }

        let issued: string[]
        try {
          issued = await fetchIssuedNumbers(doc.table, user.id, prefix)
        } catch {
          await alert(t.issuedNumbersCheckFailedAlert)
          return
        }
        const check = checkNextNumber(raw, highestIssuedNumber(issued, prefix))
        if (!check.ok) {
          await alert(check.reason === 'below_issued'
            ? t.nextNumberTooLowAlert(section, check.minimum)
            : t.nextNumberInvalidAlert(section))
          return
        }
        patch[doc.prefixField] = prefix
        patch[doc.numberField] = doc.storedAsText ? check.value : check.numeric
      }

      // update только своих полей, не upsert всей строки: строка profiles
      // всегда есть (её создаёт триггер при регистрации), а всё, чего эта
      // страница не касается (telegram_chat_id, уведомления, тариф), остаётся
      // как есть.
      const { data: updated, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('id')
      if (error || !updated || updated.length === 0) {
        await alert(t.errorPrefix(error?.message || t.profileNotSavedMessage))
        return
      }
      initialRef.current = settings
      await alert(t.savedAlert)
      router.push('/profile')
    } catch (e: any) {
      await alert(t.errorPrefix(e?.message || String(e)))
    } finally {
      setSaving(false)
    }
  }

  const vatLabels: Record<string, { label: string; desc: string }> = {
    no_vat: { label: t.vatNoLabel, desc: t.vatNoDesc },
    vat_0: { label: t.vat0Label, desc: t.vat0Desc },
    vat_16: { label: t.vat16Label, desc: t.vat16Desc },
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  // Пока грузится: шапка и название вкладки уже на месте, поля -- заглушками.
  if (!loaded) return (
    <PageContainer className="space-y-4" aria-busy="true">
      <PageHeader title={t.invoiceSettingsLabel} backHref="/profile" animate={false} />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </PageContainer>
  )

  return (
    <>
      <PageContainer className="space-y-4">

        <PageHeader title={t.invoiceSettingsLabel} backHref="/profile" animate={false} />

        <div className="space-y-4 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-4 xl:items-start">
        {/* Нумерация счетов */}
        <motion.div {...fadeIn(1)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.invoiceNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="INV-" value={settings.invoice_prefix}
                onChange={e => setSettings({ ...settings, invoice_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input className={INPUT_CLS}
                inputMode="numeric" pattern="[0-9]*"
                placeholder="0001" value={settings.invoice_next_number}
                onChange={e => setSettings({ ...settings, invoice_next_number: digitsOnly(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.defaultDueDaysFieldLabel}</label>
            <input type="number" className={INPUT_CLS}
              placeholder="3" value={settings.default_due_days}
              onChange={e => setSettings({ ...settings, default_due_days: e.target.value })} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.defaultNoteFieldLabel}</label>
            <textarea className={`${INPUT_CLS} resize-none`}
              rows={3} placeholder={t.defaultNotePlaceholder}
              value={settings.default_note}
              onChange={e => setSettings({ ...settings, default_note: e.target.value })} />
          </div>
        </motion.div>

        {/* Нумерация КП */}
        <motion.div {...fadeIn(2)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.kpNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="КП-" value={settings.kp_prefix}
                onChange={e => setSettings({ ...settings, kp_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input className={INPUT_CLS}
                inputMode="numeric" pattern="[0-9]*"
                placeholder="1" value={settings.kp_next_number}
                onChange={e => setSettings({ ...settings, kp_next_number: digitsOnly(e.target.value) })} />
            </div>
          </div>
        </motion.div>

        {/* Нумерация АВР */}
        <motion.div {...fadeIn(3)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.avrNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="АВР-" value={settings.avr_prefix}
                onChange={e => setSettings({ ...settings, avr_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input className={INPUT_CLS}
                inputMode="numeric" pattern="[0-9]*"
                placeholder="1" value={settings.avr_next_number}
                onChange={e => setSettings({ ...settings, avr_next_number: digitsOnly(e.target.value) })} />
            </div>
          </div>
        </motion.div>

        {/* Нумерация Накладной */}
        <motion.div {...fadeIn(4)} className="nav-glass rounded-2xl p-4 space-y-4">
          <div className="text-[11px] font-extrabold uppercase" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.nakladnayaNumberingSectionLabel}</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.prefixFieldLabel}</label>
              <input className={INPUT_CLS}
                placeholder="НАК-" value={settings.nakladnaya_prefix}
                onChange={e => setSettings({ ...settings, nakladnaya_prefix: e.target.value })} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.nextNumberFieldLabel}</label>
              <input className={INPUT_CLS}
                inputMode="numeric" pattern="[0-9]*"
                placeholder="1" value={settings.nakladnaya_next_number}
                onChange={e => setSettings({ ...settings, nakladnaya_next_number: digitsOnly(e.target.value) })} />
            </div>
          </div>
        </motion.div>

        {/* НДС */}
        <motion.div {...fadeIn(5)} className="nav-glass rounded-2xl p-4">
          <div className="text-[11px] font-extrabold uppercase mb-3" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.vatStatusSectionLabel}</div>
          <div className="space-y-2">
            {Object.entries(vatLabels).map(([key, val]) => (
              <div key={key} onClick={() => setSettings({ ...settings, vat_type: key })}
                className="flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-colors"
                style={settings.vat_type === key
                  ? { background: 'var(--nav-accent-soft)', borderColor: 'var(--nav-accent)' }
                  : { borderColor: 'var(--nav-border-soft)' }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: settings.vat_type === key ? 'var(--nav-accent)' : 'var(--nav-text-secondary)' }}>
                    {val.label}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{val.desc}</div>
                </div>
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={settings.vat_type === key
                    ? { borderColor: 'var(--nav-accent)', background: 'var(--nav-accent)' }
                    : { borderColor: 'var(--nav-border)' }}>
                  {settings.vat_type === key && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--nav-accent-ink)' }}></div>}
                </div>
              </div>
            ))}
          </div>
          {settings.vat_type === 'vat_16' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.vat16InfoText}
            </div>
          )}
          {settings.vat_type === 'vat_0' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-accent-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.vat0InfoText}
            </div>
          )}
          {settings.vat_type === 'no_vat' && (
            <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
              {t.noVatInfoText}
            </div>
          )}
        </motion.div>

        <motion.button {...fadeIn(6)} onClick={save} disabled={saving}
          className="w-full lg:w-fit lg:px-16 xl:col-span-2 rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
          style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
          {saving ? t.savingEllipsis : t.saveSettingsButton}
        </motion.button>
        </div>

      </PageContainer>
      {dialogElement}
    </>
  )
}
