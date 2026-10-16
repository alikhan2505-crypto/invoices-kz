'use client'
import { useState, useEffect, useLayoutEffect, useRef, useCallback, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { generateInvoicePDF } from '@/lib/generatePDF'
import InvoiceLivePreview, { type PreviewHighlight } from '@/components/InvoiceLivePreview'
import { useTweenedNumber } from '@/components/useTweenedNumber'
import { computeInvoiceReadiness } from '@/lib/invoiceReadiness'
import { cacheGet, cacheSet } from '@/lib/cache'
import { getActivePlan } from '@/lib/plan'
import { almatyMonthStart, invoiceLimitWindow, checkInvoiceLimit, invoicesLeft, isInvoiceLimitError, invoiceLimitFromError } from '@/lib/invoiceLimit'
import { formatDate, formatDateSafe } from '@/lib/date'
import { computeDefaultDueDate, todayDateString } from '@/lib/dueDate'
import { useLanguage } from '@/components/LanguageProvider'
import { closeLabel, deleteLabel } from '@/lib/a11yLabels'
import { invoiceFlowDict } from '@/lib/i18n/invoiceFlow'
import { saveInvoiceDraft, takeInvoiceDraft, clearInvoiceDraft, type InvoiceDraft } from '@/lib/invoiceDraft'
import { withReturnPath } from '@/lib/returnPath'
import { useAppDialog } from '@/components/AppDialog'
import { useBinLookup } from '@/components/useBinLookup'

const UNIT_OPTIONS = ['шт', 'кг', 'л', 'м', 'м²', 'м³', 'час', 'день', 'месяц', 'услуга', 'работа']

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

const CARD_HOVER = 'transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--nav-card-glow)]'

function XIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--nav-accent)' }}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" />
      <path d="M16 4.3c1.5.4 2.6 1.7 2.6 3.3 0 1.6-1.1 2.9-2.6 3.3" />
      <path d="M15 13.7c2.7.5 4.5 2.4 4.5 5.3" />
    </svg>
  )
}

function CheckIcon({ size = 12, strokeWidth = 3 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11" /><path d="m7 10.5 5 5 5-5" /><path d="M5 19.5h14" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 19.6l1.2-4A8 8 0 1 1 20 11.5Z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  )
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" /><path d="M14 3.5v5h5" /><path d="M9 13h6M9 16.5h4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** A money figure on the app's own surfaces that counts to each new value. */
function TweenedMoney({ value }: { value: number }) {
  const shown = useTweenedNumber(value)
  // At rest it prints the value exactly as this block always did (no rounding
  // of a fractional quantity's kopecks); only in-between frames are whole.
  return <>{(shown === value ? value : Math.round(shown)).toLocaleString('ru-KZ')} ₸</>
}

/**
 * The company name the register just put into the field, "typed" in letter by
 * letter over the real input for a moment. Purely an overlay: the field's
 * value is already the full name from the first frame (so a submit mid-way, a
 * draft or the preview all see the real text), the input's own text is only
 * made transparent underneath while this plays.
 *
 * The overlay copies the input's computed text colour, font and left inset
 * instead of assuming them: globals.css paints input text with
 * -webkit-text-fill-color (with !important in the dark theme) and floors
 * inputs at 16px on phones, so a hard-coded copy would jump on hand-off.
 * For the same reason the input is hidden with an inline !important, the
 * only thing that outranks those rules; both are undone on unmount.
 */
function RegistryTypeIn({ text, inputRef, onDone }: { text: string; inputRef: RefObject<HTMLInputElement | null>; onDone: () => void }) {
  const chars = Array.from(text)
  const step = Math.min(0.018, 0.42 / Math.max(chars.length, 1))
  const overlayRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const input = inputRef.current
    const overlay = overlayRef.current
    if (!input || !overlay) return
    const cs = getComputedStyle(input)
    overlay.style.color = cs.getPropertyValue('-webkit-text-fill-color') || cs.color
    overlay.style.font = cs.font
    overlay.style.fontSize = cs.fontSize
    overlay.style.fontFamily = cs.fontFamily
    overlay.style.left = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0) + 'px'
    input.style.setProperty('-webkit-text-fill-color', 'transparent', 'important')
    input.style.setProperty('color', 'transparent', 'important')
    return () => {
      input.style.removeProperty('-webkit-text-fill-color')
      input.style.removeProperty('color')
    }
  }, [inputRef])
  return (
    <span ref={overlayRef} aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-[13px] right-9 flex items-center overflow-hidden whitespace-pre text-sm">
      {chars.map((ch, i) => (
        <motion.span key={i}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.12, delay: i * step }}
          onAnimationComplete={i === chars.length - 1 ? onDone : undefined}>
          {ch}
        </motion.span>
      ))}
    </span>
  )
}

/**
 * «Клиент → Позиции → Готово»: each step's circle fills with a check as the
 * form's own required fields become valid (see computeInvoiceReadiness).
 * Fixed-size circles and connectors -- filling them never moves anything.
 */
function ReadinessSteps({ client, items, ready, reduceMotion, labels }: {
  client: boolean; items: boolean; ready: boolean; reduceMotion: boolean
  labels: { aria: string; client: string; items: string; ready: string; done: string; todo: string }
}) {
  const steps = [
    { label: labels.client, done: client },
    { label: labels.items, done: items },
    { label: labels.ready, done: ready },
  ]
  const tween = { duration: reduceMotion ? 0 : 0.28, ease: EASE }
  // Polite announcement of whichever steps just flipped («Клиент: заполнено»).
  // Derived during render from the previous flags (React's "adjust state when
  // a prop changes" pattern) -- nothing is said on mount, and the list itself
  // stays non-live so it does not chatter on every keystroke.
  const [prevFlags, setPrevFlags] = useState({ client, items, ready })
  const [announcement, setAnnouncement] = useState('')
  if (prevFlags.client !== client || prevFlags.items !== items || prevFlags.ready !== ready) {
    const before = [prevFlags.client, prevFlags.items, prevFlags.ready]
    const changed = steps.filter((step, i) => before[i] !== step.done)
    setPrevFlags({ client, items, ready })
    setAnnouncement(changed.map(step => `${step.label}: ${step.done ? labels.done : labels.todo}`).join('. '))
  }
  return (
    <>
    <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
    <ol aria-label={labels.aria} className="flex items-center gap-2 mb-3 px-1">
      {steps.map((step, i) => (
        <li key={i} className={'flex items-center gap-2 min-w-0 ' + (i < steps.length - 1 ? 'flex-1' : '')}>
          <span className="relative w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold"
            style={{ border: '1.5px solid var(--nav-border)', color: 'var(--nav-text-secondary)' }}>
            {i + 1}
            <motion.span aria-hidden="true"
              className="absolute -inset-[1.5px] rounded-full flex items-center justify-center"
              style={{ background: 'var(--nav-success-solid, var(--nav-success))', color: 'var(--nav-success-ink, #fff)' }}
              initial={false}
              animate={step.done ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
              transition={tween}>
              <CheckIcon size={11} strokeWidth={3.2} />
            </motion.span>
          </span>
          <span className="text-xs font-medium whitespace-nowrap transition-colors"
            style={{ color: step.done ? 'var(--nav-text-primary)' : 'var(--nav-text-secondary)', transitionDuration: reduceMotion ? '0ms' : '200ms' }}>
            {step.label}
            <span className="sr-only">: {step.done ? labels.done : labels.todo}</span>
          </span>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="relative flex-1 min-w-3 h-[2px] rounded-full overflow-hidden" style={{ background: 'var(--nav-border-soft)' }}>
              <motion.span className="absolute inset-0 origin-left rounded-full" style={{ background: 'var(--nav-success)' }}
                initial={false}
                animate={{ scaleX: step.done ? 1 : 0 }}
                transition={tween} />
            </span>
          )}
        </li>
      ))}
    </ol>
    </>
  )
}

/**
 * Keyboard handling for this page's own modal dialogs (success card,
 * signature choice): Tab / Shift+Tab wrap inside the dialog instead of
 * walking out to the form behind the backdrop, and Escape runs `onEscape`.
 * Bound with onKeyDown on the dialog, so AppDialog's alerts -- their own
 * portal, not children of these dialogs in the React tree -- are untouched.
 */
function dialogKeyDown(e: React.KeyboardEvent<HTMLElement>, onEscape: () => void) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEscape(); return }
  if (e.key !== 'Tab') return
  const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
  if (!nodes.length) return
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement
  const inside = !!active && e.currentTarget.contains(active)
  if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus() }
}

export default function CreateInvoicePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = invoiceFlowDict[lang]
  // Shadows window.alert / window.confirm for this whole component, so every
  // dialog on the page becomes an in-app one and none can be forgotten. Both
  // confirms below are awaited -- a bare `if (confirm(...))` would now always
  // be true, since a Promise is truthy.
  const { alert, confirm, dialogElement } = useAppDialog()
  const KNP_OPTIONS = t.knpOptions
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [loading, setLoading] = useState(false)
  const [lastCreated, setLastCreated] = useState<number | null>(null)
  const [clients, setClients] = useState<any[]>([])
  const [savedServices, setSavedServices] = useState<any[]>([])
  const [showServicePicker, setShowServicePicker] = useState(false)
  const [clientSelected, setClientSelected] = useState(false)
  const [showSaveClient, setShowSaveClient] = useState(false)
  const [lastInvoiceClient, setLastInvoiceClient] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  // Distinct from `profile` itself being truthy: a cache hit sets `profile`
  // to last-known-good data almost immediately, but a user with no cache yet
  // (new device, cleared storage, or simply first load of the session) saw
  // the invoice-number preview fall back to a hardcoded "INV-0001" for the
  // brief window before the real fetch resolved -- indistinguishable from a
  // genuine, freshly-reset counter. This flag lets the preview show nothing
  // instead of that misleading default until the real profile has loaded at
  // least once.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [monthCount, setMonthCount] = useState(0)
  // Until the month's count arrives, the Free banner must not claim «осталось
  // 3 из 3» (a cached profile renders it before the count query resolves).
  const [monthCountLoaded, setMonthCountLoaded] = useState(false)
  const [monthStats, setMonthStats] = useState({ paid: 0, total: 0, amount: 0 })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [showBankPicker, setShowBankPicker] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [pendingInvoice, setPendingInvoice] = useState<any>(null)
  const [pendingBank, setPendingBank] = useState<any>(null)
  const [showVatHint, setShowVatHint] = useState(false)
  // null while unknown (fetch pending) so the hint below never flashes on
  // for an already-connected founder before the check resolves.
  const [kaspiCashierConnected, setKaspiCashierConnected] = useState<boolean | null>(null)
  const vatHintRef = useRef<HTMLSpanElement>(null)
  // Ref для хранения открытого окна PDF
 
  const [clientName, setClientName] = useState('')
  const [clientBin, setClientBin] = useState('')
  const { binLookup, lookupBin, resetBinLookup } = useBinLookup()

  // The name the state register last put into «Название», for the БИН it
  // belongs to. Drives the green check beside the field: it shows only while
  // the field still holds exactly that name under exactly that БИН, so editing
  // either one takes the check away -- it vouches for the register's text,
  // not for whatever is typed there afterwards.
  const [registryName, setRegistryName] = useState<{ bin: string; name: string } | null>(null)
  // A fresh registry fill to "type in" over the field once (see RegistryTypeIn).
  // `n` re-keys the overlay so a second «Проверить» replays it.
  const [typeIn, setTypeIn] = useState<{ name: string; n: number } | null>(null)
  const clientNameInputRef = useRef<HTMLInputElement>(null)
  // Backstop: the overlay hides the input's own text while it plays, so it
  // must end even if its completion callback never arrives.
  useEffect(() => {
    if (!typeIn) return
    const id = setTimeout(() => setTypeIn(null), 1500)
    return () => clearTimeout(id)
  }, [typeIn])
  function markRegistryFill(bin: string, name: string) {
    setRegistryName({ bin, name })
    if (!reduceMotion && name) setTypeIn(prev => ({ name, n: (prev?.n ?? 0) + 1 }))
  }

  // The БИН these client fields currently describe. Empty when they were
  // typed by hand rather than filled from a lookup.
  const appliedBinRef = useRef('')

  /**
   * Clears the client fields, because the БИН they belong to has changed.
   *
   * Without this the form quietly mixed two counterparties: fill in one
   * company, type a different БИН, and the register's answer was ignored --
   * the fill-only-empty rule saw a name already there and left the previous
   * company's name sitting under the new number. Nothing on screen said the
   * two disagreed.
   *
   * Only fields that a lookup had filled are cleared. Anything typed by hand
   * is left alone: appliedBinRef is empty in that case, and wiping someone's
   * own typing because they corrected a digit would be worse than the bug.
   */
  function clearClientFields() {
    if (!appliedBinRef.current) return
    appliedBinRef.current = ''
    setClientName('')
    setClientAddress('')
    setClientEmail('')
    setClientPhone('')
  }

  /**
   * Fills the client fields from a registry answer, overwriting.
   *
   * For the button only. Pressing «Проверить» is an explicit request for
   * what the state says, so it wins over whatever is in the fields —
   * including a name typed by hand, which is exactly what someone pressing
   * it is asking to replace.
   */
  function applyCompanyOverwrite(bin: string, company: { name: string; address: string | null } | null) {
    if (!company) return
    appliedBinRef.current = bin
    setClientName(company.name)
    setClientAddress(company.address || '')
    markRegistryFill(bin, company.name)
  }

  /** Fills the client fields from a registry answer. */
  function applyCompany(bin: string, company: { name: string; address: string | null } | null) {
    if (!company) return
    appliedBinRef.current = bin
    // Still fill-only-empty, but the fields were just cleared for a new БИН,
    // so in practice this writes -- while a name the user typed themselves
    // survives, which is the case the rule was written for.
    setClientName(prev => prev.trim() ? prev : company.name)
    setClientAddress(prev => prev.trim() ? prev : (company.address || ''))
    // Check mark and type-in render only while the field equals this name,
    // so a hand-typed name that survived the rule above gets neither.
    markRegistryFill(bin, company.name)
  }
  const [clientEmail, setClientEmail] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [contractNumber, setContractNumber] = useState('')
  const [contractDate, setContractDate] = useState('')
  const [noContract, setNoContract] = useState(false)
  const [dueDate, setDueDate] = useState('')
  // A ref, not state: load() is a useCallback([router]), so it captures the
  // first render's value forever. As state this flag read `false` inside
  // load() no matter how many times the inputs below set it -- and load()
  // re-runs on every window focus, so picking a due date and switching tabs
  // silently reset it to the default (and would undo a restored draft's date
  // the same way).
  const dueDateTouched = useRef(false)
  const [clientKnp, setClientKnp] = useState('849')
  const [note, setNote] = useState('')
  const [services, setServicesState] = useState<any[]>([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
  // A stable React key per line, kept beside `services` rather than inside
  // it: `services` is inserted into the invoice row verbatim, and a UI-only id
  // must not end up in the database. Positional keys made the enter animation
  // (form and live preview alike) play on the last row when «+ Добавить»
  // inserted a new line at the top.
  const keySeq = useRef(1)
  const [serviceKeys, setServiceKeys] = useState<string[]>(['svc-0'])
  const newServiceKey = () => 'svc-' + keySeq.current++
  /** Replaces the whole list (prefill, draft, reset): every line gets a fresh key. */
  const setServices = useCallback((next: typeof services) => {
    setServicesState(next)
    setServiceKeys(next.map(() => 'svc-' + keySeq.current++))
  }, [])
  // Which part of the live preview mirrors the field in focus.
  const [previewFocus, setPreviewFocus] = useState<PreviewHighlight>(null)
  const focusPreview = (h: PreviewHighlight) => () => setPreviewFocus(h)
  const blurPreview = () => setPreviewFocus(null)

  // load() re-runs on every window focus, not just on mount, so a parked draft
  // has to be restored exactly once -- otherwise switching to another tab and
  // back would re-apply it over whatever the user has since typed.
  const draftRestored = useRef(false)
  // A restore must be visible. Since 15.10.2026 the gates below send the user
  // to /profile/requisites and /profile/banks with ?next=/create, and those
  // pages bring them straight back here after saving -- but the return trip
  // can still be an ordinary menu click days later (the draft lives 24h), by
  // someone starting a different invoice, and a form that silently fills
  // itself with a previous client's name, BIN and prices is how the wrong
  // line items reach a real customer.
  const [draftRestoredNotice, setDraftRestoredNotice] = useState(false)

  // Snapshot of everything a person can type into this form, for the two gates
  // below that send them away to fill in something else. See src/lib/invoiceDraft.ts.
  const currentDraft = useCallback((): InvoiceDraft => ({
    clientName, clientBin, clientEmail, clientAddress, clientPhone,
    contractNumber, contractDate, noContract, dueDate, clientKnp, note, services,
  }), [clientName, clientBin, clientEmail, clientAddress, clientPhone,
       contractNumber, contractDate, noContract, dueDate, clientKnp, note, services])

  const total = services.reduce((s, i) => s + i.qty * i.price, 0)
  const vatType = profile?.vat_type || 'no_vat'
  const vatAmount = vatType === 'vat_16' ? Math.round(total - total / 1.16) : 0
  const totalWithoutVat = vatType === 'vat_16' ? Math.round(total / 1.16) : total
  // Same rules createInvoice() enforces, from the same function -- the
  // indicator can never call a form ready that the button would then refuse.
  const readiness = computeInvoiceReadiness({ clientName, clientBin, services })

  // After creation: the success card, and the button inside it that copied
  // the public link (shows «Ссылка скопирована» for a moment).
  const [showCreatedCard, setShowCreatedCard] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const createdCardRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const cachedProfile = cacheGet('profile_' + user.id)
    if (cachedProfile) setProfile(cachedProfile)

    const [{ data: p }, { data: c }, { data: s }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('*').eq('user_id', user.id).order('name'),
      supabase.from('services').select('*').eq('user_id', user.id).order('name'),
      supabase.from('invoices').select('client_name, client_bin, client_email')
        .eq('user_id', user.id)
        .not('client_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setProfile(p)
    setProfileLoaded(true)
    if (p) cacheSet('profile_' + user.id, p)
    if (!dueDateTouched.current) setDueDate(computeDefaultDueDate(todayDateString(), p?.default_due_days))

    supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', user.id).then(() => {})

    const { data: banks } = await supabase
      .from('bank_accounts').select('*').eq('user_id', user.id).order('is_main', { ascending: false })
    setBankAccounts(banks || [])

    // Kaspi Cashier connection status, for the "connect for exact-amount
    // tracked payments" hint next to the live preview (desktop only, per
    // founder request) -- fire-and-forget, doesn't block the rest of the
    // form loading. kaspi_connections has no client-facing RLS policy, so
    // this goes through the same /api/kaspi/status route /kaspi-api itself
    // uses rather than querying the table directly.
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch('/api/kaspi/status', { headers: { Authorization: `Bearer ${session?.access_token}` } })
        .then(res => (res.ok ? res.json() : null))
        .then(data => setKaspiCashierConnected(!!data?.connected))
        .catch(() => setKaspiCashierConnected(false))
    })

    // monthCount = счета в окне лимита — том же, по которому считает триггер
    // в базе (invoiceLimitWindow ↔ invoice_limit_window): пробный — с начала
    // пробного периода, Free — с 1-го числа по Алматы, но не раньше конца
    // последнего пробного/бонусного/платного периода. Без лимита — не считаем.
    const limitWindow = invoiceLimitWindow(p)
    let count: number | null = 0
    let countError: unknown = null
    if (limitWindow.windowStart) {
      const res = await supabase
        .from('invoices').select('*', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('created_at', limitWindow.windowStart.toISOString())
      count = res.count
      countError = res.error
    }
    setMonthCount(count || 0)
    // A failed count is not «0 used»: keep the Free banner on its neutral text
    // instead of promising the full quota.
    if (!countError && count !== null) setMonthCountLoaded(true)

    // Month stats below stay on the calendar month (Almaty) — they are
    // statistics, not the quota.
    const monthStart = almatyMonthStart()
    const { data: monthInvoices } = await supabase
      .from('invoices').select('amount, status')
      .eq('user_id', user.id).gte('created_at', monthStart.toISOString())
    const paid = (monthInvoices || []).filter((i: any) => i.status === 'paid').length
    const amount = (monthInvoices || [])
      .filter((i: any) => i.status === 'paid')
      .reduce((sum: number, i: any) => sum + Number(i.amount), 0)
    setMonthStats({ paid, total: monthInvoices?.length || 0, amount })

    if ((monthInvoices?.length ?? 0) === 0 && !p?.company_name) setShowOnboarding(true)

    setSavedServices(s || [])

    const fromHistory = (inv || []).reduce((acc: any[], inv: any) => {
      if (inv.client_name && !acc.find((c: any) => c.name === inv.client_name)) {
        acc.push({ name: inv.client_name, bin_iin: inv.client_bin, email: inv.client_email, id: inv.client_name })
      }
      return acc
    }, [])

    const fromDirectory = (c || []).map((cl: any) => ({ ...cl, id: cl.id }))
    const merged = [...fromDirectory]
    fromHistory.forEach((h: any) => {
      if (!merged.find((m: any) => m.name === h.name)) merged.push(h)
    })
    setClients(merged)

    const params = new URLSearchParams(window.location.search)
    const templateId = params.get('template')
    if (templateId) {
      const { data: tmpl } = await supabase.from('templates').select('*').eq('id', templateId).single()
      if (tmpl) {
        setClientName(tmpl.client_name || '')
        setClientBin(tmpl.client_bin || '')
        setClientEmail(tmpl.client_email || '')
        if (tmpl.services && tmpl.services.length > 0) setServices(tmpl.services)
        if (tmpl.client_name) setClientSelected(true)
      }
    }

    // "Повторить счёт" from history/the invoice detail page -- prefills this
    // form from a past invoice's client+services+contract, same as a
    // template, but due date/note stay on their own today-based defaults
    // (already computed above) rather than copying the old invoice's dates.
    const repeatId = params.get('repeat')
    if (repeatId) {
      const { data: src } = await supabase.from('invoices').select('*').eq('id', repeatId).eq('user_id', user.id).single()
      if (src) {
        setClientName(src.client_name || '')
        setClientBin(src.client_bin || '')
        setClientEmail(src.client_email || '')
        setClientAddress(src.client_address || '')
        setClientPhone(src.client_phone || '')
        setContractNumber(src.contract_number || '')
        setContractDate(src.contract_date || '')
        if (src.services && src.services.length > 0) setServices(src.services)
        if (src.client_name) setClientSelected(true)
      }
    }

    // «Открыть в конструкторе» from an AI-agent invoice draft
    // (/ai-agent/review) -- prefills client + positions from the draft
    // for manual correction. Fire-and-forget: issuing from here does NOT
    // touch the draft's status (the owner rejects the draft card
    // themselves, as its own hint says).
    const agentDraftId = params.get('agentDraft')
    if (agentDraftId) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/ai-agent/invoice-drafts?id=${encodeURIComponent(agentDraftId)}`, {
          headers: { 'Authorization': `Bearer ${session?.access_token}` },
        })
        if (res.ok) {
          const data = await res.json()
          const draft = (data.drafts || [])[0]
          if (draft) {
            setClientName(draft.customer_name || '')
            setClientPhone(draft.customer_phone || '')
            if (Array.isArray(draft.items) && draft.items.length > 0) {
              setServices(draft.items.map((i: any) => ({
                name: i.name, qty: i.qty, price: i.unitPrice, unit: 'шт', code: '', type: 'service',
              })))
            }
            if (draft.customer_name) setClientSelected(true)
          }
        }
      } catch {
        // Prefill is best-effort -- a fetch failure just leaves the empty form.
      }
    }

    // Strip ?template=/?repeat=/?agentDraft= once consumed -- otherwise
    // clearing the client (clearClient) doesn't stick: browser back
    // navigation, or even just switching tabs and back (the focus listener
    // below re-runs load()), re-reads the same still-present query param and
    // silently reapplies the prefill the user just removed. router.replace()
    // (next/navigation) was tried first but silently didn't touch
    // window.location.search here -- going straight to the History API
    // instead, which is all this needs (no server re-fetch, just a
    // client-side URL cleanup).
    if (templateId || repeatId || agentDraftId) window.history.replaceState(null, '', '/create')

    // Restore an invoice parked by one of createInvoice()'s gates. Runs here,
    // at the end of load(), rather than in its own mount effect, because
    // load() sets the default due date on the way through and would otherwise
    // overwrite the restored one when its awaits resolve.
    //
    // Skipped entirely when the user arrived with an explicit prefill
    // (?template=/?repeat=/?agentDraft=): that is a deliberate choice about
    // what this invoice should contain, and it wins over a parked one. The
    // draft is left in storage in that case, for whenever they come back
    // without a prefill.
    const firstLoad = !draftRestored.current
    draftRestored.current = true
    if (firstLoad && !templateId && !repeatId && !agentDraftId) {
      const draft = takeInvoiceDraft(user.id)
      if (draft) {
        setDraftRestoredNotice(true)
        setClientName(draft.clientName)
        setClientBin(draft.clientBin)
        setClientEmail(draft.clientEmail)
        setClientAddress(draft.clientAddress)
        setClientPhone(draft.clientPhone)
        setContractNumber(draft.contractNumber)
        setContractDate(draft.contractDate)
        setNoContract(draft.noContract)
        if (draft.dueDate) { setDueDate(draft.dueDate); dueDateTouched.current = true }
        if (draft.clientKnp) setClientKnp(draft.clientKnp)
        setNote(draft.note)
        if (draft.services.length > 0) setServices(draft.services)
        // Deliberately NOT setClientSelected(true), unlike the ?template= and
        // ?repeat= prefills above. There the client is a saved record the user
        // picked, so the read-only "selected client" card is right. A draft is
        // unfinished typing -- possibly a client that doesn't exist yet, half
        // spelled -- and that card would make the user hit × to clear it before
        // they could carry on with the name. Leaving it false restores the same
        // editable fields they were last looking at.
      }
    }
  }, [router, setServices])

  useEffect(() => {
    load()
    const handleFocus = () => load()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [load])

  // Примечание всегда отражает выбранный срок оплаты -- вместо статичного
  // "оплата в течение N дней" показываем конкретную дату (2026-08-20, founder request).
  useEffect(() => {
    if (dueDate) setNote(invoiceFlowDict[lang].paymentDueNote(formatDate(dueDate)))
  }, [dueDate, lang])

  useEffect(() => {
    if (!showVatHint) return
    function onOutsideClick(e: MouseEvent) {
      if (vatHintRef.current && !vatHintRef.current.contains(e.target as Node)) setShowVatHint(false)
    }
    document.addEventListener('click', onOutsideClick)
    return () => document.removeEventListener('click', onOutsideClick)
  }, [showVatHint])

  function toggleNoContract(checked: boolean) {
    setNoContract(checked)
    if (checked) { setContractNumber(t.noContractValue); setContractDate('') }
    else { setContractNumber('') }
  }

  function selectClient(client: any) {
    setClientName(client.name)
    setClientBin(client.bin_iin || '')
    setClientEmail(client.email || '')
    setClientAddress(client.address || '')
    setClientPhone(client.phone || '')
    setClientSelected(true)
    // A quick-pick client may not match whichever БИН was last manually
    // typed and looked up -- that stale lookup (isVatPayer included) must
    // not ride along onto this client. See resetBinLookup() in the
    // manual-БИН onChange handler below for the same guard.
    resetBinLookup()
  }

  function formatPhone(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 0) return ''
    let result = '+7'
    if (digits.length > 1) result += ' ' + digits.slice(1, 4)
    if (digits.length > 4) result += ' ' + digits.slice(4, 7)
    if (digits.length > 7) result += ' ' + digits.slice(7, 11)
    return result
  }

  // Empties the whole form, not just the client. clearClient() below leaves
  // services, note and the contract fields alone -- deliberate there, since it
  // means "different client, same order" -- but that is the wrong shape for
  // "this restored draft is not what I came here to do": stale line items and
  // prices would ride along into a completely different invoice.
  function discardRestoredDraft() {
    clearClient()
    setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
    setNote('')
    setNoContract(false)
    setDraftRestoredNotice(false)
  }

  function clearClient() {
    setClientName('')
    setClientBin('')
    setClientEmail('')
    setClientAddress('')
    setClientPhone('')
    setContractNumber('')
    setContractDate('')
    setClientKnp('849')
    setClientSelected(false)
    // The БИН field is empty now, so no lookup describes these fields any
    // more. Left set, the first digit typed into the empty БИН would make
    // clearClientFields() wipe a name/email/phone typed by hand after this.
    appliedBinRef.current = ''
    setDueDate(computeDefaultDueDate(todayDateString(), profile?.default_due_days))
    dueDateTouched.current = false
    // Same reason as in selectClient(): the БИН field is now empty, so any
    // manually-typed-BIN lookup result (isVatPayer included) is stale.
    resetBinLookup()
  }

  function selectService(svc: any) {
    const exists = services.find(s => s.name === svc.name)
    if (exists) { setShowServicePicker(false); return }
    const dropFirst = services[0].name === ''
    const updated = dropFirst ? [] : [...services]
    setServicesState([...updated, { name: svc.name, qty: 1, price: svc.price, unit: svc.unit || 'шт', code: svc.code || '', type: 'service' }])
    setServiceKeys(prev => [...(dropFirst ? [] : prev), newServiceKey()])
    setShowServicePicker(false)
  }

  function addService() {
    setServicesState([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }, ...services])
    setServiceKeys(prev => [newServiceKey(), ...prev])
    setTimeout(() => {
      const el = document.getElementById('services-list')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  function removeService(idx: number) {
    setServicesState(services.filter((_, i) => i !== idx))
    setServiceKeys(prev => prev.filter((_, i) => i !== idx))
  }

  function updateService(idx: number, field: string, value: any) {
    const updated = [...services]
    updated[idx] = { ...updated[idx], [field]: value }
    setServicesState(updated)
  }

  async function saveClientToDirectory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !lastInvoiceClient) return
    const { error } = await supabase.from('clients').insert({ ...lastInvoiceClient, user_id: user.id })
    if (!error) setClients(prev => [...prev, { ...lastInvoiceClient, id: lastInvoiceClient.bin_iin }])
    setShowSaveClient(false)
  }

  // Onboarding checklist steps 1-2: same trip as the gates in createInvoice()
  // -- park whatever is already typed and come back here after saving.
  async function goFillPrerequisite(href: '/profile/requisites' | '/profile/banks') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) saveInvoiceDraft(user.id, currentDraft())
    router.push(withReturnPath(href, '/create'))
  }

  async function createInvoice() {
    // Both gates below stand exactly as they were -- requisites and a bank
    // account stay hard requirements (founder, 2026-09-05). What changed is
    // that leaving to fill them in no longer costs the user the invoice they
    // had already typed: it is parked first and restored by load() when they
    // come back. Since 2026-09-06 signup lands on the dashboard instead of
    // walking through the requisites wizard, this is the ordinary first-invoice
    // path, not a rare one.
    // Resolved before the requisites gate, not after it: parking a draft needs
    // the account it belongs to, so that an invoice typed under one login is
    // never restored under another on a shared browser.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert(t.signInAlert); return }

    if (!profile?.company_name || !profile?.bin_iin) {
      const kept = saveInvoiceDraft(user.id, currentDraft())
      // await: AppDialog -- an in-page portal; navigating without waiting
      // would tear the message down before anyone could read it.
      await alert(t.fillCompanyDetailsFirstAlert + (kept ? '\n\n' + t.draftKeptNote : ''))
      // ?next=/create: after saving, requisites brings the user back here,
      // where the parked draft is restored (src/lib/returnPath.ts).
      router.push(withReturnPath('/profile/requisites', '/create'))
      return
    }

    const { data: banks } = await supabase
      .from('bank_accounts').select('*').eq('user_id', user.id).order('is_main', { ascending: false })

    if (!banks || banks.length === 0) {
      // Parked only when the user actually accepts the trip to /profile/banks.
      // Declining leaves them on this page with the form still in front of
      // them, and a copy in storage would then ambush a later, unrelated visit.
      if (await confirm(t.bankDetailsNeededConfirm)) {
        saveInvoiceDraft(user.id, currentDraft())
        router.push(withReturnPath('/profile/banks', '/create'))
      }
      return
    }

    // The same four checks, in the same order, with the same messages as
    // before -- now read from computeInvoiceReadiness(), which the readiness
    // indicator above the button uses too.
    switch (readiness.firstProblem) {
      case 'clientName': alert(t.enterClientNameAlert); return
      case 'clientBin': alert(t.enterClientBinAlert); return
      case 'itemName': alert(t.addAtLeastOneServiceAlert); return
      case 'itemPrice': alert(t.specifyPriceForAllServicesAlert); return
    }
    if (lastCreated && Date.now() - lastCreated < 180000) {
      if (!(await confirm(t.recentInvoiceConfirm))) return
    }

    setLoading(true)

    const activePlan = getActivePlan(profile)

    // is_admin bypasses plan gating entirely server-side too (enforce_invoice_limit()
    // trigger returns NEW immediately for an admin, before even computing a limit) --
    // the browser-side check below exists purely to give a non-admin a fast,
    // friendly message instead of waiting on the DB round-trip, and must mirror
    // that same bypass. Without it, an admin account whose plan/trial has simply
    // lapsed (getActivePlan falls through to the Free branch) gets bounced to
    // /upgrade on every attempt, even though the server would have let them
    // through -- confirmed live 2026-10-05 (founder's sister's admin account).
    if (!profile?.is_admin) {
      // Only the monthly limit sends someone to /upgrade. Free is a real plan
      // with 3 invoices a month (pricing, landing, DB trigger all agree) --
      // until 2026-10-14 a leftover `!isActive && plan === 'free'` check here,
      // from the May 2026 days when Free meant "no invoices at all", bounced
      // every Free user to /upgrade on their very first invoice, silently.
      const limitCheck = checkInvoiceLimit(activePlan, monthCount)
      if (!limitCheck.allowed) {
        setLoading(false)
        // await: AppDialog — портал внутри страницы, без ожидания router.push
        // уводил на /upgrade раньше, чем человек видел сообщение (живой тест 14.10).
        await alert(limitCheck.kind === 'free' ? t.planLimitFreeMessage(limitCheck.limit)
            : limitCheck.kind === 'trial' ? t.planLimitTrialMessage(limitCheck.limit)
            : t.planLimitBasicMessage(limitCheck.limit))
        router.push('/upgrade')
        return
      }
    }

    const { data: invoiceNumber, error: numberError } = await supabase.rpc('claim_invoice_number', { p_user_id: user.id })
    if (numberError) {
      alert(t.errorPrefix(numberError.message))
      setLoading(false)
      return
    }

    const { data, error } = await supabase.from('invoices').insert({
      user_id: user.id,
      number: invoiceNumber,
      amount: total,
      status: 'draft',
      client_name: clientName,
      client_bin: clientBin,
      client_email: clientEmail,
      client_address: clientAddress,
      client_phone: clientPhone || null,
      bank_id: banks[0].id,
      is_vat_payer: binLookup.company?.isVatPayer ?? null,
      contract_number: contractNumber || null,
      contract_date: contractDate || null,
      due_date: dueDate || null,
      services,
      note: note || profile?.default_note || null,
    }).select().single()

    if (error) {
      // The database enforces the monthly limit too (trigger
      // enforce_invoice_limit_trigger), because the check above runs in the
      // browser and anyone holding their own session could go around it.
      // When the backstop is what stopped us, say the same thing the
      // browser check says instead of showing a Postgres message.
      if (isInvoiceLimitError(error.message)) {
        const limit = invoiceLimitFromError(error.message) ?? activePlan.invoiceLimit ?? 0
        setLoading(false)
        await alert(activePlan.plan === 'free' ? t.planLimitFreeMessage(limit)
            : activePlan.isTrial ? t.planLimitTrialMessage(limit)
            : t.planLimitBasicMessage(limit))
        router.push('/upgrade')
        return
      }
      alert(t.errorPrefix(error.message))
      setLoading(false)
      return
    }

    await supabase.from('invoice_logs').insert({ invoice_id: data.id, status: 'draft' })

    // The invoice exists now, so any copy parked by a gate is spent. Normally
    // load() already consumed it on the way back in; this covers the path where
    // it didn't (declining the bank prompt, then adding a bank in another tab).
    clearInvoiceDraft(user.id)

    setMonthCount(prev => prev + 1)
    setLastCreated(Date.now())
    setLoading(false)

    // Since 15.10.2026 creation ends on a success card («Счёт №… готов»)
    // instead of going straight into the signature choice and the PDF popup.
    // Everything above -- the invoice row, its log entry, the spent draft, the
    // quota counter, the 3-minute double-submit guard -- happens exactly as
    // before; only what is shown next changed. The bank choice (when there
    // is more than one -- the row above already defaults bank_id to the main
    // account, same as /invoice/[id]'s own fallback) still comes first,
    // because the PDF the card offers is printed with that bank. «Скачать PDF»
    // on the card opens the same signature/stamp modal as before, whose
    // buttons still call window.open synchronously from the click.
    setPendingInvoice(data)
    setPendingBank(banks[0])
    setLinkCopied(false)
    if (banks.length > 1) {
      setBankAccounts(banks)
      setShowBankPicker(true)
      return
    }
    setShowCreatedCard(true)
  }

  async function chooseBank(bank: any) {
    await supabase.from('invoices').update({ bank_id: bank.id }).eq('id', pendingInvoice.id)
    setPendingBank(bank)
    setShowBankPicker(false)
    setShowCreatedCard(true)
  }

  function closeBankPicker() {
    // Дефолтный bank_id (основной счёт) уже сохранён при создании -- закрытие
    // модалки без выбора просто оставляет его и идёт дальше к карточке «Счёт готов».
    setShowBankPicker(false)
    setShowCreatedCard(true)
  }

  // The public /view/[token] link, built exactly like /invoice/[id] builds it
  // for «Скопировать ссылку» and WhatsApp. The token normally came back with
  // the insert; if not, it is read once from the row, as that page does.
  async function createdPublicLink(): Promise<string | null> {
    if (!pendingInvoice) return null
    let token: string | null = pendingInvoice.public_token || null
    if (!token) {
      const { data } = await supabase.from('invoices').select('public_token').eq('id', pendingInvoice.id).single()
      token = data?.public_token || null
      if (token) setPendingInvoice((prev: typeof pendingInvoice) => (prev ? { ...prev, public_token: token } : prev))
    }
    return token ? `https://invoices.kz/view/${token}` : null
  }

  // Same message and the same «sent» bookkeeping as /invoice/[id]'s WhatsApp
  // button (status update + invoice_logs row), done before leaving the page
  // so the navigation to wa.me cannot cut it short.
  async function sendCreatedToWhatsApp() {
    const link = await createdPublicLink()
    if (!link) { alert(t.genericErrorLabel); return }
    const text = t.whatsappShareMessage(pendingInvoice.number, Number(pendingInvoice.amount).toLocaleString('ru-KZ'), link)
    await supabase.from('invoices').update({ status: 'sent' }).eq('id', pendingInvoice.id)
    await supabase.from('invoice_logs').insert({ invoice_id: pendingInvoice.id, status: 'sent' })
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`
  }

  const linkCopiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  async function copyCreatedLink() {
    const link = await createdPublicLink()
    if (!link) { alert(t.tokenNotFoundAlert); return }
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Same fallback as /invoice/[id] for browsers without the async clipboard.
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setLinkCopied(true)
    if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current)
    linkCopiedTimer.current = setTimeout(() => setLinkCopied(false), 2400)
  }
  useEffect(() => () => { if (linkCopiedTimer.current) clearTimeout(linkCopiedTimer.current) }, [])

  // «Создать ещё»: a clean form for the next invoice. The same reset as
  // discarding a restored draft, plus a fresh load() so the preview shows the
  // next invoice number (claim_invoice_number has just moved it on) and the
  // quota is re-counted from the database.
  function createAnother() {
    clearClient()
    // The note effect only re-runs when dueDate changes, and clearClient()
    // usually sets the same default date again -- so rebuild the note here,
    // as a fresh /create mount would, instead of carrying an edited one over.
    const dueDefault = computeDefaultDueDate(todayDateString(), profile?.default_due_days)
    setNote(dueDefault ? t.paymentDueNote(formatDate(dueDefault)) : '')
    // An explicitly requested new invoice is not a double submit: a fresh
    // mount (the old way here) started with no lastCreated either.
    setLastCreated(null)
    setServices([{ name: '', qty: 1, price: 0, unit: 'шт', code: '', type: 'service' }])
    setNoContract(false)
    setDraftRestoredNotice(false)
    setRegistryName(null)
    setTypeIn(null)
    setShowCreatedCard(false)
    setLinkCopied(false)
    setPendingInvoice(null)
    setPendingBank(null)
    // The page scrolls inside DesktopShell, not the window -- scroll the
    // page's own top into view (same reason addService() uses scrollIntoView).
    document.getElementById('create-page-top')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    // Focus would otherwise fall back to <body> when the card's button
    // unmounts; put it on the first field of the new form instead.
    requestAnimationFrame(() => document.getElementById('create-client-bin')?.focus({ preventScroll: true }))
    load()
  }

  // The cabinet layout owns <main> (and the menu in it) now, so the page can no
  // longer put `inert` on <main> itself. While the success card is up, everything
  // behind its backdrop -- menu included -- is made unreachable from here.
  const pageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const main = pageRef.current?.closest('main')
    if (!main) return
    main.inert = showCreatedCard
    return () => { main.inert = false }
  }, [showCreatedCard])

  // Keyboard and screen-reader users land on the card's first action.
  useEffect(() => {
    if (!showCreatedCard) return
    const id = requestAnimationFrame(() => createdCardRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    return () => cancelAnimationFrame(id)
  }, [showCreatedCard])

  // The signature modal takes focus when it opens and hands it back to the
  // card's «Скачать PDF» when it closes (if the card is still up).
  const signModalRef = useRef<HTMLDivElement>(null)
  const createdDownloadRef = useRef<HTMLButtonElement>(null)
  const signModalWasOpen = useRef(false)
  useEffect(() => {
    if (showSignModal) {
      signModalWasOpen.current = true
      const id = requestAnimationFrame(() => signModalRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
      return () => cancelAnimationFrame(id)
    }
    if (!signModalWasOpen.current) return
    signModalWasOpen.current = false
    const id = requestAnimationFrame(() => createdDownloadRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [showSignModal])

  // The post-create modals are portaled to document.body (see the success
  // card below); document.body exists only once the client has mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  function buildPDFProfile(withSign: boolean) {
    const canSign = !!profile?.is_admin || getActivePlan(profile).canSign
    return {
      company_name: profile?.company_name || '',
      bin_iin: profile?.bin_iin || '',
      address: profile?.address || '',
      director_name: profile?.director_name || '',
      phone: profile?.phone || '',
      signature_url: withSign && canSign ? (profile?.signature_url || '') : '',
      stamp_url: withSign && canSign ? (profile?.stamp_url || '') : '',
      logo_url: profile?.logo_url || '',
    }
  }

  async function generateAndOpenPDF(withSign: boolean, win: Window | null) {
    const html = await generateInvoicePDF({
      number: pendingInvoice.number,
      date: new Date().toLocaleDateString('ru-KZ'),
      clientName, clientBin, clientEmail, clientAddress, clientPhone,
      contractNumber, contractDate: contractDate ? formatDateSafe(contractDate) : undefined,
      knp: clientKnp, services, total,
      note: note || profile?.default_note || '', autoPrint: false, vatType: profile?.vat_type || 'no_vat',
      profile: buildPDFProfile(withSign),
      bank: {
        bank_name: pendingBank?.bank_name || '',
        iik: pendingBank?.iik || '',
        bik: pendingBank?.bik || '',
        kbe: pendingBank?.kbe || '19',
      },
      kaspiPayLink: profile?.kaspi_pay_link || undefined,
      viewUrl: pendingInvoice.public_token ? `https://www.invoices.kz/view/${pendingInvoice.public_token}` : undefined,
      dueDate: dueDate ? formatDate(dueDate) : undefined,
      showWatermark: !profile?.is_admin && !getActivePlan(profile).isActive,
    })
    if (win) { win.document.write(html); win.document.close() }
    // No redirect to /invoice/[id] any more: the PDF opens in its own tab and
    // this one returns to the success card, which has «Открыть счёт».
  }

  function chooseSignature(withSign: boolean) {
    if (withSign && !profile?.is_admin && !getActivePlan(profile).canSign) {
      alert(t.pdfSignUpgradeMessage)
      router.push('/upgrade')
      return
    }
    // window.open здесь синхронно, до await генерации PDF -- иначе Safari
    // на iOS блокирует попап, так как он больше не считается прямым кликом.
    const win = window.open('', '_blank')
    setShowSignModal(false)
    generateAndOpenPDF(withSign, win)
  }

  // The signature modal is opened from the success card now, so leaving it
  // without a choice goes back to that card rather than off the page.
  function skipSignatureChoice() {
    setShowSignModal(false)
  }

  return (
    <div ref={pageRef}>
      <div className="max-w-lg lg:max-w-7xl mx-auto p-4">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <h2 id="create-page-top" className="text-xl font-bold mb-1 scroll-mt-32" style={{ color: 'var(--nav-text-primary)' }}>{t.newInvoiceTitle}</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--nav-text-secondary)' }}>{t.newInvoiceSubtitle}</p>
        </motion.div>

        <div className="lg:flex lg:gap-6 lg:items-start">
        <div className="lg:flex-1 lg:min-w-0">

        {monthStats.total > 0 && (
          <div className="grid grid-cols-3 gap-1 mb-4">
            {[
              { value: monthStats.total, label: t.statsInvoicesLabel, color: 'var(--nav-text-primary)' },
              { value: monthStats.paid, label: t.statsPaidLabel, color: 'var(--nav-success)' },
              { value: monthStats.amount > 0 ? (monthStats.amount / 1000).toFixed(0) + 'K' : '0', label: t.statsIncomeLabel, color: 'var(--nav-text-primary)' },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className={`nav-glass rounded-xl p-3 text-center ${CARD_HOVER}`}
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE, delay: reduceMotion ? 0 : 0.05 + i * 0.04 }}
              >
                <div className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{s.label}</div>
              </motion.div>
            ))}
          </div>
        )}

        {(() => {
          const activePlan = getActivePlan(profile)
          // invoiceLimit === null here means an admin on Free — no quota to show.
          // profile === null before the first load would read as Free for
          // everyone (Pro included) — wait for the real profile.
          if ((profile || profileLoaded) && activePlan.plan === 'free' && activePlan.invoiceLimit !== null) return (
            <div className="nav-glass flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--nav-accent-soft)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.freePlanTitle}</div>
                <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>{t.freePlanSubtitle(monthCountLoaded ? invoicesLeft(activePlan, monthCount) : null, activePlan.invoiceLimit)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.freePlanUpsell}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{t.ratesButton}</button>
            </div>
          )
          if (activePlan.isTrial) return (
            <div className="nav-glass flex items-center justify-between rounded-xl px-4 py-3 mb-4" style={{ background: 'var(--nav-success-soft)' }}>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-success)' }}>{t.trialPlanTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.trialDaysLeftLabel(activePlan.daysLeft!, invoicesLeft(activePlan, monthCount) ?? 0)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-success)', color: '#fff' }}>{t.buyButton}</button>
            </div>
          )
          if (activePlan.daysLeft !== null && activePlan.daysLeft <= 3) return (
            <div className="nav-glass flex items-center justify-between rounded-xl px-4 py-3 mb-4">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--nav-critical)' }}>{t.expiringPlanTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.daysLeftLabel(activePlan.daysLeft)}</div>
              </div>
              <button onClick={() => router.push('/upgrade')} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-critical)', color: '#fff' }}>{t.extendButton}</button>
            </div>
          )
          return null
        })()}

        {showOnboarding && (
          <div className="nav-glass nav-card-accent rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>{t.onboardingTitle}</div>
              <button onClick={() => setShowOnboarding(false)} className="transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-3">
              {[
                { step: 1, title: t.onboardingStep1Title, desc: t.onboardingStep1Desc, done: !!(profile?.company_name && profile?.bin_iin), action: () => goFillPrerequisite('/profile/requisites'), btn: t.onboardingStep1Btn },
                { step: 2, title: t.onboardingStep2Title, desc: t.onboardingStep2Desc, done: bankAccounts.length > 0, action: () => goFillPrerequisite('/profile/banks'), btn: t.onboardingStep2Btn },
                { step: 3, title: t.onboardingStep3Title, desc: t.onboardingStep3Desc, done: !!(profile?.signature_url), action: () => router.push('/profile/signature'), btn: t.onboardingStep3Btn },
                { step: 4, title: t.onboardingStep4Title, desc: t.onboardingStep4Desc, done: monthStats.total > 0, action: () => {}, btn: '' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: item.done ? 'var(--nav-success-soft)' : 'var(--nav-surface-glass)' }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={item.done ? { background: 'var(--nav-success)', color: '#fff' } : { background: 'var(--nav-border-soft)', color: 'var(--nav-text-muted)' }}>
                    {item.done ? '✓' : item.step}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: item.done ? 'var(--nav-success)' : 'var(--nav-text-primary)', textDecoration: item.done ? 'line-through' : 'none' }}>{item.title}</div>
                    <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{item.desc}</div>
                  </div>
                  {!item.done && item.btn && (
                    <button onClick={item.action} className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>{item.btn}</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          {draftRestoredNotice && (
            <div className="mb-3 rounded-xl p-3 flex items-center gap-3" style={{ background: 'var(--nav-accent-soft)' }}>
              <div className="flex-1 text-xs" style={{ color: 'var(--nav-text-primary)' }}>{t.draftRestoredNotice}</div>
              <button onClick={discardRestoredDraft}
                className="text-xs font-semibold px-3 min-h-[44px] rounded-lg flex-shrink-0"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.draftRestoredClearButton}
              </button>
            </div>
          )}

          {clients.length > 0 && !clientSelected && (
            <div className="mb-3">
              <p className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.quickClientPickLabel}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {clients.slice(0, 6).map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="nav-glass whitespace-nowrap text-xs px-3 py-2 rounded-full flex-shrink-0 transition-colors hover:bg-[var(--nav-accent)] hover:text-[var(--nav-accent-ink)] hover:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)' }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:mb-4">
          {/* Client section */}
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-5 mb-4 lg:mb-0"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.1 }}
          >
            <h3 className="font-medium mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.clientDataHeader}</h3>
            {clientSelected ? (
              <div className="space-y-3">
                <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'var(--nav-surface-glass)' }}>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--nav-text-primary)' }}>{clientName}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.binLabel(clientBin)}</div>
                    {clientEmail && <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{clientEmail}</div>}
                  </div>
                  <button onClick={clearClient} className="transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-critical)]" aria-label={deleteLabel(lang)}><XIcon /></button>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.knpLabel}</label>
                  <select className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.addressLabelDashboard}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.addressPlaceholder} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.buyerPhoneLabel}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                    onChange={e => setClientPhone(formatPhone(e.target.value))} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={noContract} onChange={e => toggleNoContract(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--nav-accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.noContractLabel}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractNumberLabelDashboard}</label>
                    <input disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractDateLabel}</label>
                    <input type="date" disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.dueDateLabel}</label>
                  <input type="date" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); dueDateTouched.current = true }}
                    onFocus={focusPreview({ kind: 'due' })} onBlur={blurPreview} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* БИН first, and full width, because it is now the field
                    that fills the others in: one number and the name and
                    address arrive from the state registers. Asking for the
                    company name above it made people type what the state
                    already knows. Email and phone stay manual -- no register
                    publishes them; they come only from a client already
                    saved in the user's own directory. */}
                <div>
                  <label htmlFor="create-client-bin" className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.binIinLabel}</label>
                  <div className="flex gap-2">
                  <input id="create-client-bin" className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.binIinPlaceholder} value={clientBin}
                      onFocus={focusPreview({ kind: 'client' })} onBlur={blurPreview}
                      onChange={async e => {
                        const bin = e.target.value
                        setClientBin(bin)
                        // The number in the box no longer matches the data
                        // below it, so the data goes.
                        if (bin !== appliedBinRef.current) clearClientFields()
                        if (bin.length !== 12) {
                          resetBinLookup()
                          return
                        }
                        const found = clients.find(c => c.bin_iin === bin)
                        if (found) {
                          // The user's own saved client wins over the state
                          // register: they have already corrected it to how
                          // they want it printed.
                          appliedBinRef.current = bin
                          setClientName(found.name)
                          setClientEmail(found.email || '')
                          setClientAddress(found.address || '')
                          setClientPhone(found.phone || '')
                          resetBinLookup()
                          return
                        }
                        applyCompany(bin, await lookupBin(bin))
                      }} />
                    {/* The lookup already fires on the twelfth digit, so this
                        is not the only way in. It exists so the capability is
                        visible at all, and so a failed attempt has a second
                        try -- `force` re-asks a БИН we remember requesting. */}
                    <button
                      type="button"
                      onClick={async () => applyCompanyOverwrite(clientBin, await lookupBin(clientBin, { force: true }))}
                      disabled={clientBin.replace(/\D/g, '').length !== 12 || binLookup.status === 'loading'}
                      className="px-3 rounded-lg text-sm font-medium flex-shrink-0 disabled:opacity-40 transition-colors"
                      style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-accent)' }}>
                      {binLookup.status === 'loading' ? '…' : t.binLookupCheckButton}
                    </button>
                  </div>
                    {binLookup.status !== 'idle' && (
                      <div className="text-xs mt-2 leading-relaxed rounded-lg p-3 space-y-0.5"
                           style={{ background: 'var(--nav-surface-glass)' }}>
                        {binLookup.status === 'loading' && (
                          <div style={{ color: 'var(--nav-text-muted)' }}>{t.binLookupSearching}</div>
                        )}
                        {binLookup.status === 'notfound' && (
                          <div style={{ color: 'var(--nav-text-muted)' }}>{t.binLookupNotFound}</div>
                        )}
                        {binLookup.status === 'found' && binLookup.company && (() => {
                          const c = binLookup.company
                          // Одним блоком, а не россыпью подписей под полем:
                          // продавец решает, отгружать или нет, и должен
                          // видеть всё сразу, а не выискивать предупреждение
                          // среди служебных строк.
                          return (
                            <>
                              <div className="font-medium" style={{ color: 'var(--nav-text-primary)' }}>
                                {t.binLookupFound(c.name, c.status || null)}
                              </div>
                              {c.registeredAt && (
                                <div style={{ color: 'var(--nav-text-secondary)' }}>{t.binLookupRegisteredAt(c.registeredAt)}</div>
                              )}
                              {c.activity && (
                                <div style={{ color: 'var(--nav-text-secondary)' }}>{t.binLookupActivity(c.activity)}</div>
                              )}
                              {/* Руководитель — его обещает публичная /tools/kontragent
                                  («полная карточка: адрес, руководитель, вид
                                  деятельности»); адрес уже подставляется в поле. */}
                              {c.director && (
                                <div style={{ color: 'var(--nav-text-secondary)' }}>{t.binLookupDirector(c.director)}</div>
                              )}
                              {c.isVatPayer !== null && c.isVatPayer !== undefined && (
                                <div style={{ color: 'var(--nav-text-secondary)' }}>
                                  {c.isVatPayer ? t.binLookupVatYes(c.vatRegisteredAt || null) : t.binLookupVatNo}
                                </div>
                              )}
                              {/* Долг и риски идут последними и выделены:
                                  это то, ради чего проверку смотрят. null
                                  молчит — «не спросили» не должно читаться
                                  как «чисто». */}
                              {typeof c.totalArrear === 'number' && (
                                c.totalArrear > 0 ? (
                                  <div className="font-medium" style={{ color: 'var(--nav-danger, #ef4444)' }}>
                                    {t.binLookupTaxDebt(c.totalArrear.toLocaleString('ru-KZ', { maximumFractionDigits: 2 }))}
                                  </div>
                                ) : (
                                  <div style={{ color: 'var(--nav-success)' }}>{t.binLookupNoTaxDebt}</div>
                                )
                              )}
                              {c.isUnreliable === true && (
                                <div className="font-medium" style={{ color: 'var(--nav-danger, #ef4444)' }}>{t.binLookupUnreliable}</div>
                              )}
                              {c.isLiquidating === true && (
                                <div className="font-medium" style={{ color: 'var(--nav-danger, #ef4444)' }}>{t.binLookupLiquidating}</div>
                              )}
                              <div className="pt-1" style={{ color: 'var(--nav-text-muted)' }}>
                                {c.source === 'kgd' ? t.binLookupSourceKgd : t.binLookupSource}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                </div>
                <div>
                  <label htmlFor="create-client-name" className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.companyNameLabel}</label>
                  {(() => {
                    // The green check vouches for the register's text only:
                    // gone as soon as the name or the БИН under it is edited.
                    const verified = !!registryName && registryName.bin === clientBin && registryName.name === clientName && !!clientName
                    const typing = !reduceMotion && !!typeIn && typeIn.name === clientName && verified
                    return (
                      <div className="relative">
                        <input id="create-client-name" ref={clientNameInputRef}
                          className="w-full rounded-lg pl-3 pr-9 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                          placeholder={t.companyNamePlaceholder} value={clientName}
                          aria-describedby={verified ? 'create-client-name-verified' : undefined}
                          onFocus={() => { setTypeIn(null); setPreviewFocus({ kind: 'client' }) }} onBlur={blurPreview}
                          onChange={e => { setTypeIn(null); setClientName(e.target.value) }} />
                        {typing && typeIn && (
                          <RegistryTypeIn key={typeIn.n} text={typeIn.name} inputRef={clientNameInputRef} onDone={() => setTypeIn(null)} />
                        )}
                        <AnimatePresence initial={false}>
                          {verified && (
                            <motion.span key="ok" id="create-client-name-verified"
                              role="img" aria-label={t.binVerifiedLabel} title={t.binVerifiedLabel}
                              className="absolute right-2.5 top-1/2 -mt-[9px] w-[18px] h-[18px] rounded-full flex items-center justify-center"
                              style={{ background: 'var(--nav-success-solid, var(--nav-success))', color: 'var(--nav-success-ink, #fff)' }}
                              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6 }}
                              transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE, delay: reduceMotion || !typing ? 0 : 0.3 }}>
                              <CheckIcon size={11} strokeWidth={3.2} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.addressLabelDashboard}</label>
                  <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    placeholder={t.addressPlaceholder} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.emailLabel}</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.emailPlaceholder} value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.buyerPhoneLabel}</label>
                    <input className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.buyerPhonePlaceholderDashboard} value={clientPhone} type="tel" maxLength={16}
                      onChange={e => setClientPhone(formatPhone(e.target.value))} />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={noContract} onChange={e => toggleNoContract(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--nav-accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--nav-text-secondary)' }}>{t.noContractLabel}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractNumberLabelDashboard}</label>
                    <input disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      placeholder={t.contractNumberPlaceholderDashboard} value={contractNumber} onChange={e => setContractNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.contractDateLabel}</label>
                    <input type="date" disabled={noContract} className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)] disabled:opacity-50"
                      value={contractDate} onChange={e => setContractDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.dueDateLabel}</label>
                  <input type="date" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={dueDate} onChange={e => { setDueDate(e.target.value); dueDateTouched.current = true }}
                    onFocus={focusPreview({ kind: 'due' })} onBlur={blurPreview} />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-secondary)' }}>{t.knpLabel}</label>
                  <select className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                    value={clientKnp} onChange={e => setClientKnp(e.target.value)}>
                    {KNP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </motion.div>

          {/* Services section + Total, grouped so Total sits directly under Services */}
          <div>
          <motion.div
            className="nav-glass nav-card-accent rounded-2xl p-5 mb-4"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.15 }}
          >
            {/* На узком телефоне кнопки целиком уходят под заголовок, а не ломаются
                по словам («+ Добавить товар / услугу» длиннее прежнего «+ Добавить»). */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="font-medium whitespace-nowrap" style={{ color: 'var(--nav-text-primary)' }}>{t.servicesHeader}</h3>
              <div className="flex flex-wrap gap-2">
                {savedServices.length > 0 && (
                  <button onClick={() => setShowServicePicker(true)}
                    className="text-xs font-semibold rounded-lg px-3 py-1 whitespace-nowrap border border-[color:var(--nav-accent)]" style={{ color: 'var(--nav-accent)' }}>
                    {t.fromDirectoryButton}
                  </button>
                )}
                <button onClick={addService} className="text-xs font-semibold rounded-lg px-3 py-1 whitespace-nowrap" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.addButton}
                </button>
              </div>
            </div>
            <div className="space-y-4" id="services-list">
              {services.map((svc, idx) => (
                <motion.div
                  key={serviceKeys[idx] ?? 'svc-pos-' + idx}
                  onFocusCapture={() => setPreviewFocus({ kind: 'row', key: serviceKeys[idx] ?? String(idx) })}
                  onBlurCapture={blurPreview}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE }}
                  className="rounded-xl p-3 space-y-2 border border-[color:var(--nav-border-soft)]"
                >
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => updateService(idx, 'type', 'product')}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition"
                      style={svc.type === 'product' ? { background: 'var(--nav-success)', color: '#fff' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                      {t.productToggleLabel}
                    </button>
                    <button type="button" onClick={() => updateService(idx, 'type', 'service')}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg font-medium transition"
                      style={(svc.type || 'service') === 'service' ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-secondary)' }}>
                      {t.serviceToggleLabel}
                    </button>
                  </div>
                  <div className="flex gap-2 items-start">
                    <input className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                      placeholder={t.serviceNamePlaceholder} value={svc.name}
                      onChange={e => updateService(idx, 'name', e.target.value)} />
                    {services.length > 1 && (
                      <button onClick={() => removeService(idx)} className="mt-1 transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-critical)]" aria-label={deleteLabel(lang)}><XIcon /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.codeLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        placeholder={t.codePlaceholder} value={svc.code || ''}
                        onChange={e => updateService(idx, 'code', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.qtyLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        type="number" placeholder={t.qtyPlaceholder} value={svc.qty || ''}
                        onChange={e => updateService(idx, 'qty', Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.unitLabel}</label>
                      <select className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        value={svc.unit || 'шт'} onChange={e => updateService(idx, 'unit', e.target.value)}>
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--nav-text-muted)' }}>{t.priceLabel}</label>
                      <input className="w-full rounded-lg px-2 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]"
                        type="number" placeholder={t.pricePlaceholder} value={svc.price || ''}
                        onChange={e => updateService(idx, 'price', Number(e.target.value))} />
                    </div>
                  </div>
                  {svc.name && svc.price > 0 && (
                    <div className="text-xs text-right tabular-nums" style={{ color: 'var(--nav-text-muted)' }}>
                      {t.perLineTotal((svc.qty * svc.price).toLocaleString('ru-KZ'))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Total -- phones only since 15.10.2026. On lg+ the live preview
              sits right beside the form and carries the same lines (VAT
              breakdown included), so this block was a duplicate there. */}
          <motion.div
            className="rounded-2xl p-5 mb-4 lg:hidden"
            style={{ background: 'var(--nav-accent)' }}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.2 }}
          >
            {vatType === 'vat_16' ? (
              <>
                <div className="flex justify-between text-sm text-white/70 mb-2 tabular-nums">
                  <span>{t.amountWithoutVatLabel}</span><span><TweenedMoney value={totalWithoutVat} /></span>
                </div>
                <div className="flex justify-between text-sm text-white/70 mb-3 tabular-nums">
                  <span ref={vatHintRef} className="relative flex items-center gap-1.5">
                    {t.vat16Label}
                    <button type="button" onClick={() => setShowVatHint(v => !v)} className="text-white/50 hover:text-white/90 transition-colors" aria-label={t.vatHintAriaLabel}>
                      <InfoIcon />
                    </button>
                    {showVatHint && (
                      <div className="absolute left-0 top-[calc(100%+8px)] z-10 w-60 rounded-xl p-3 text-xs leading-relaxed normal-case"
                        style={{ background: 'var(--nav-surface-chrome)', color: 'var(--nav-text-secondary)', boxShadow: '0 20px 44px -18px rgba(10,10,15,0.35)' }}>
                        {t.vatHintText}
                        <button type="button" onClick={() => { setShowVatHint(false); router.push('/profile/settings') }}
                          className="block mt-2 font-semibold text-left" style={{ color: 'var(--nav-accent)' }}>
                          {t.vatHintLink}
                        </button>
                      </div>
                    )}
                  </span>
                  <span><TweenedMoney value={vatAmount} /></span>
                </div>
              </>
            ) : vatType === 'vat_0' ? (
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <span>{t.vat0Label}</span><span>{t.vat0Amount}</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-white/70 mb-3">
                <span>{t.noVatLabel}</span><span>{t.noVatDash}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-white border-t border-white/20 pt-3">
              <span>{t.amountDueLabel}</span>
              <span className="text-lg tabular-nums"><TweenedMoney value={total} /></span>
            </div>
          </motion.div>
          </div>
          </div>

          <ReadinessSteps
            client={readiness.client} items={readiness.items} ready={readiness.ready}
            reduceMotion={reduceMotion}
            labels={{
              aria: t.readinessAriaLabel, client: t.readinessClient, items: t.readinessItems,
              ready: t.readinessReady, done: t.readinessStepDone, todo: t.readinessStepTodo,
            }}
          />

          {/* isolate keeps the glow's -z-10 inside this wrapper: behind the
              button, never behind the page. */}
          <div className="relative isolate">
            {/* The "ready" glow: only when the form has everything it checks
                for. A not-ready button looks and behaves exactly as before --
                still clickable, still answering with the same alerts. Under
                reduced motion the glow is a steady one, no pulse. */}
            <motion.span aria-hidden="true"
              className="pointer-events-none absolute inset-x-4 top-2 -bottom-1 -z-10 rounded-xl blur-lg"
              style={{ background: 'var(--nav-success)' }}
              initial={false}
              animate={readiness.ready && !loading
                ? (reduceMotion ? { opacity: 0.45 } : { opacity: [0.28, 0.62, 0.28] })
                : { opacity: 0 }}
              transition={readiness.ready && !loading && !reduceMotion
                ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
                : { duration: reduceMotion ? 0 : 0.25 }}
            />
            <motion.button
              onClick={createInvoice} disabled={loading}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.36, ease: EASE, delay: reduceMotion ? 0 : 0.25 }}
              className="w-full rounded-xl py-4 font-medium text-sm transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:hover:translate-y-0"
              style={{
                background: loading ? 'var(--nav-text-muted)' : 'var(--nav-success)',
                color: '#fff',
                boxShadow: loading ? 'none' : '0 10px 24px -10px var(--nav-success)',
              }}
            >
              {loading ? t.creatingButton : t.createButton}
            </motion.button>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease: EASE, duration: reduceMotion ? 0 : 0.4 }}
          className="hidden lg:block lg:w-[400px] lg:flex-shrink-0 lg:sticky lg:top-[121px]"
        >
          <InvoiceLivePreview
            invoiceNumber={!profileLoaded ? '' : (profile?.invoice_prefix || 'INV-') + (profile?.invoice_next_number || '0001')}
            date={formatDate(new Date().toISOString())}
            dueDate={dueDate ? formatDate(dueDate) : undefined}
            companyName={profile?.company_name || ''}
            companyBin={profile?.bin_iin || ''}
            clientName={clientName}
            clientBin={clientBin}
            services={services}
            note={note}
            vatType={vatType}
            total={total}
            serviceKeys={serviceKeys}
            highlight={previewFocus}
            skeletonWhenEmpty
          />
          {/* The VAT-rate hint used to live behind the «i» in the totals block,
              which is phones-only now -- on a desktop it sits here instead,
              under the preview's own VAT lines. */}
          {vatType === 'vat_16' && (
            <div className="mt-4 rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.vatHintText}
              <button type="button" onClick={() => router.push('/profile/settings')} className="block mt-2 font-semibold text-left" style={{ color: 'var(--nav-accent)' }}>
                {t.vatHintLink}
              </button>
            </div>
          )}
          {kaspiCashierConnected === false && (
            <div className="mt-4 rounded-xl p-4 text-xs leading-relaxed" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border-soft)', color: 'var(--nav-text-secondary)' }}>
              {t.kaspiCashierHintText}
              <button type="button" onClick={() => router.push('/kaspi-api')} className="block mt-2 font-semibold text-left" style={{ color: 'var(--nav-accent)' }}>
                {t.kaspiCashierHintLink}
              </button>
            </div>
          )}
        </motion.div>
        </div>
      </div>

      {/* Service picker modal */}
      {showServicePicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.servicePickerTitle}</span>
              <button onClick={() => setShowServicePicker(false)} className="back-btn transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-2">
              {savedServices.map(s => (
                <div key={s.id} onClick={() => selectService(s)}
                  className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors border border-[color:var(--nav-border-soft)] hover:border-[color:var(--nav-accent)]">
                  <div>
                    <div className="font-medium text-sm" style={{ color: 'var(--nav-text-primary)' }}>{s.name}</div>
                    <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>{s.unit || 'шт'}</div>
                  </div>
                  <div className="text-sm font-medium tabular-nums" style={{ color: 'var(--nav-text-primary)' }}>{Number(s.price).toLocaleString('ru-KZ')} ₸</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Save client modal */}
      {showSaveClient && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="text-center mb-5">
              <div className="flex justify-center mb-2"><PeopleIcon /></div>
              <div className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.saveClientModalTitle}</div>
              <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.saveClientPrompt(lastInvoiceClient?.name)}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveClient(false)}
                className="flex-1 rounded-xl py-3 text-sm border border-[color:var(--nav-border)]" style={{ color: 'var(--nav-text-secondary)' }}>
                {t.skipButton}
              </button>
              <button onClick={saveClientToDirectory}
                className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {t.saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank picker modal -- invoice already exists (bank_id defaulted to
          the main account on insert); picking here just overrides it.
          Portaled to document.body like the success card below, for the
          same WebKit containing-block reason. */}
      {mounted && showBankPicker && createPortal(
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3">
          <div className="w-full max-w-lg rounded-3xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.bankPickerTitle}</span>
              <button onClick={closeBankPicker} className="back-btn transition-colors text-[color:var(--nav-text-muted)] hover:text-[color:var(--nav-text-secondary)]" aria-label={closeLabel(lang)}><XIcon /></button>
            </div>
            <div className="space-y-2">
              {bankAccounts.map(bank => (
                <div key={bank.id} onClick={() => chooseBank(bank)}
                  className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-colors border border-[color:var(--nav-border-soft)] hover:border-[color:var(--nav-accent)] hover:bg-[var(--nav-surface-glass)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm" style={{ color: 'var(--nav-text-primary)' }}>{bank.bank_name}</span>
                      {bank.is_main && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-success-soft)', color: 'var(--nav-success)' }}>{t.mainBankBadge}</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{bank.iik}</div>
                  </div>
                </div>
              ))}
              <div onClick={() => router.push('/profile/banks')}
                className="flex items-center justify-center p-4 rounded-xl cursor-pointer transition-colors border border-dashed border-[color:var(--nav-border)] hover:border-[color:var(--nav-accent)]">
                <span className="text-sm font-medium" style={{ color: 'var(--nav-accent)' }}>{t.addBankAccountLabel}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Success card -- what creation ends on since 15.10.2026. Every exit is
          one of its actions; there is deliberately no close button, because
          closing back onto the just-submitted form is how a second copy of
          the same invoice gets made. For the same reason Escape does not
          dismiss it: it only brings focus back to the first action.

          Portaled to document.body together with the signature modal, not
          rendered inside <main>: below lg, .page-surface-in-shell puts
          backdrop-filter on <main>, which (WebKit) makes <main> the
          containing block for `fixed` -- the card would be centred on the
          whole tall page, off-screen after scrolling down to the submit
          button -- and (every browser) a stacking context, so TopUtilityBar's
          z-50 pill outside <main> would sit above the backdrop. Same trap
          and same fix as SiteNav's mobile drawer. <main> (owned by the cabinet
          layout) is inert while the card is up, so nothing behind the
          backdrop is reachable. */}
      {mounted && createPortal(<>
      <AnimatePresence>
        {showCreatedCard && pendingInvoice && (
          <motion.div key="created"
            className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-3"
            onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault() }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.15 } }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            <motion.div ref={createdCardRef}
              role="dialog" aria-modal={!showSignModal} aria-labelledby="created-card-title" aria-describedby="created-card-subtitle"
              inert={showSignModal}
              onKeyDown={e => dialogKeyDown(e, () => createdCardRef.current?.querySelector<HTMLButtonElement>('button')?.focus())}
              className="w-full max-w-md rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
              style={{ background: 'var(--nav-surface-chrome)' }}
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
            >
              <div className="flex flex-col items-center text-center mb-5">
                {/* Checkmark: the ring draws, then the tick. Reduced motion
                    shows both finished from the first frame. */}
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className="mb-3">
                  <circle cx="28" cy="28" r="28" style={{ fill: 'var(--nav-success-soft)' }} />
                  <motion.circle cx="28" cy="28" r="21" strokeWidth="2.5" strokeLinecap="round"
                    style={{ stroke: 'var(--nav-success)', rotate: -90, transformOrigin: '50% 50%' }}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.5, ease: EASE, delay: reduceMotion ? 0 : 0.1 }} />
                  <motion.path d="M19 28.5 25 34.5 37 22" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ stroke: 'var(--nav-success)' }}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE, delay: reduceMotion ? 0 : 0.45 }} />
                </svg>
                <div id="created-card-title" className="text-lg font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                  {t.createdTitle(String(pendingInvoice.number))}
                </div>
                <div className="text-sm mt-1 tabular-nums break-words max-w-full" style={{ color: 'var(--nav-text-secondary)' }}>
                  {pendingInvoice.client_name} · {Number(pendingInvoice.amount).toLocaleString('ru-KZ')} ₸
                </div>
                <div id="created-card-subtitle" className="text-xs mt-1" style={{ color: 'var(--nav-text-muted)' }}>{t.createdSubtitle}</div>
              </div>

              <div className="space-y-2">
                {/* Opens the same signature/stamp modal as before; its buttons
                    are what call window.open, synchronously, from the click. */}
                <button type="button" ref={createdDownloadRef} onClick={() => setShowSignModal(true)}
                  className="w-full min-h-[48px] rounded-xl px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  <DownloadIcon />{t.createdDownloadPdf}
                </button>
                <button type="button" onClick={sendCreatedToWhatsApp}
                  className="w-full min-h-[48px] rounded-xl px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0"
                  style={{ background: 'var(--nav-success-solid, var(--nav-success))', color: 'var(--nav-success-ink, #fff)' }}>
                  <ChatIcon />{t.createdSendWhatsApp}
                </button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" onClick={copyCreatedLink} aria-live="polite"
                    className="min-h-[44px] rounded-xl px-3 text-sm font-medium flex items-center justify-center gap-2 border border-[color:var(--nav-border)] transition-colors hover:border-[color:var(--nav-accent)]"
                    style={{ color: linkCopied ? 'var(--nav-success)' : 'var(--nav-text-primary)' }}>
                    {linkCopied ? <CheckIcon size={15} strokeWidth={2.6} /> : <LinkIcon />}
                    {linkCopied ? t.createdLinkCopied : t.createdCopyLink}
                  </button>
                  <button type="button" onClick={() => router.push('/invoice/' + pendingInvoice.id)}
                    className="min-h-[44px] rounded-xl px-3 text-sm font-medium flex items-center justify-center gap-2 border border-[color:var(--nav-border)] transition-colors hover:border-[color:var(--nav-accent)]"
                    style={{ color: 'var(--nav-text-primary)' }}>
                    <DocIcon />{t.createdOpenInvoice}
                  </button>
                </div>
                <button type="button" onClick={createAnother}
                  className="w-full min-h-[44px] rounded-xl px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                  style={{ color: 'var(--nav-accent)' }}>
                  <PlusIcon />{t.createdCreateAnother}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature/stamp choice -- same modal as /invoice/[id]'s PDF button.
          Opened from the success card's «Скачать PDF»; picking a variant
          opens the PDF popup synchronously from that click (iOS Safari), and
          closing it goes back to the card. Rendered after the card so it
          stacks above it. */}
      {showSignModal && (() => {
        const canSign = !!profile?.is_admin || getActivePlan(profile).canSign
        return (
          <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-3"
            onMouseDown={e => { if (e.target === e.currentTarget) e.preventDefault() }}>
            <div ref={signModalRef} role="dialog" aria-modal="true" aria-labelledby="sign-modal-title" aria-describedby="sign-modal-subtitle"
              onKeyDown={e => dialogKeyDown(e, skipSignatureChoice)}
              className="w-full max-w-lg rounded-3xl p-6" style={{ background: 'var(--nav-surface-chrome)' }}>
              <div className="text-center mb-5">
                <div id="sign-modal-title" className="font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>{t.documentFormatModalTitle}</div>
                <div id="sign-modal-subtitle" className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>{t.chooseDownloadVariantSubtitle}</div>
              </div>
              <div className="space-y-3 mb-4">
                <button onClick={() => chooseSignature(true)}
                  className="w-full rounded-xl py-4 text-sm font-medium relative"
                  style={canSign ? { background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' } : { background: 'var(--nav-surface-glass)', color: 'var(--nav-text-muted)' }}>
                  {t.withSignatureButtonLabel}
                  {!canSign && <span className="absolute top-1 right-2 text-xs" style={{ color: 'var(--nav-text-muted)' }}>{t.basicPlusBadge}</span>}
                </button>
                <button onClick={() => chooseSignature(false)}
                  className="w-full rounded-xl py-4 text-sm font-medium border-2"
                  style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-primary)' }}>
                  {t.withoutSignatureButtonLabel}
                </button>
              </div>
              <button onClick={skipSignatureChoice}
                className="w-full text-sm py-2" style={{ color: 'var(--nav-text-muted)' }}>{t.cancelButton}</button>
            </div>
          </div>
        )
      })()}
      </>, document.body)}

    {dialogElement}
    </div>
  )
}