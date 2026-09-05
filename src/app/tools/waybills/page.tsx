'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { track } from '@vercel/analytics'
import { useLanguage, Lang } from '@/components/LanguageProvider'

const EASE = [0.16, 1, 0.3, 1] as const
const MAX_FILES = 30

interface Copy {
  title: string
  subtitle: string
  dropzoneTitle: string
  dropzoneHint: (max: number) => string
  dropzoneAriaLabel: string
  filesCountLabel: (n: number) => string
  clearButton: string
  fileLimitWarning: (max: number) => string
  formatA4Label: string
  formatA6Label: string
  invalidFilesError: string
  networkError: string
  mergeButton: string
  mergingButton: string
  ctaTitle: string
  ctaBody: string
  ctaLink: string
  leadPromptTitle: string
  leadPlaceholder: string
  leadSubmitButton: string
  leadSendingButton: string
  leadThanks: string
}

const COPY: Record<Lang, Copy> = {
  ru: {
    title: 'Склейка накладных Kaspi',
    subtitle: 'Соберите накладные из Kaspi Магазина в один PDF: по 4 на лист А4, чтобы не печатать каждую отдельно. Бесплатно и без регистрации — файлы нигде не сохраняются.',
    dropzoneTitle: 'Выберите PDF-накладные',
    dropzoneHint: max => `нажмите здесь или перетащите файлы · до ${max} файлов`,
    dropzoneAriaLabel: 'Выбрать PDF-файлы накладных',
    filesCountLabel: n => `Файлов: ${n}`,
    clearButton: 'Очистить',
    fileLimitWarning: max => `Можно склеить не больше ${max} файлов за раз — лишние не добавлены`,
    formatA4Label: 'А4 — 4 на лист',
    formatA6Label: 'А6 — по одной',
    invalidFilesError: 'Выберите PDF-файлы. Если Kaspi отдал ZIP-архив — сначала распакуйте его.',
    networkError: 'Ошибка сети. Проверьте соединение и попробуйте ещё раз.',
    mergeButton: 'Склеить и скачать PDF',
    mergingButton: 'Склеиваем…',
    ctaTitle: 'Хотите, чтобы накладные забирались из Kaspi сами?',
    ctaBody: 'В invoices.kz накладные подтягиваются прямо из вашего кабинета Kaspi — вместе с заказами, демпингом цен с защитой минимальной цены, финансами и аналитикой ниш.',
    ctaLink: 'Посмотреть Kaspi Bot →',
    leadPromptTitle: 'Хотите узнавать о новых бесплатных инструментах?',
    leadPlaceholder: 'Email или телефон (необязательно)',
    leadSubmitButton: 'Отправить',
    leadSendingButton: 'Отправляем…',
    leadThanks: 'Спасибо! Дадим знать, когда выйдет что-то новое.',
  },
  kk: {
    title: 'Kaspi жүкқұжаттарын желімдеу',
    subtitle: 'Kaspi Магазин жүкқұжаттарын бір PDF файлға жинаңыз: А4 парағына 4-тен, әр жүкқұжатты бөлек басып шығармау үшін. Тегін және тіркеусіз — файлдар ешқайда сақталмайды.',
    dropzoneTitle: 'PDF-жүкқұжаттарды таңдаңыз',
    dropzoneHint: max => `осында басыңыз немесе файлдарды сүйреңіз · ${max} файлға дейін`,
    dropzoneAriaLabel: 'Жүкқұжаттардың PDF-файлдарын таңдау',
    filesCountLabel: n => `Файлдар: ${n}`,
    clearButton: 'Тазалау',
    fileLimitWarning: max => `Бір реттен ${max} файлдан артық желімдеуге болмайды — артық файлдар қосылмады`,
    formatA4Label: 'А4 — парақта 4',
    formatA6Label: 'А6 — бір-бірден',
    invalidFilesError: 'PDF-файлдарды таңдаңыз. Kaspi ZIP-архив берсе — алдымен оны ашыңыз.',
    networkError: 'Желі қатесі. Байланысты тексеріп, қайталап көріңіз.',
    mergeButton: 'Желімдеп, PDF жүктеу',
    mergingButton: 'Желімдеп жатырмыз…',
    ctaTitle: 'Жүкқұжаттар Kaspi-ден өздігінен келгенін қалайсыз ба?',
    ctaBody: 'invoices.kz-те жүкқұжаттар тікелей Kaspi кабинетіңізден тартылады — тапсырыстармен, ең төмен бағаны қорғайтын демпинг-ботпен, қаржы және ниша аналитикасымен бірге.',
    ctaLink: 'Kaspi Bot-ты қарау →',
    leadPromptTitle: 'Жаңа тегін құралдар туралы білгіңіз келе ме?',
    leadPlaceholder: 'Email немесе телефон (міндетті емес)',
    leadSubmitButton: 'Жіберу',
    leadSendingButton: 'Жіберілуде…',
    leadThanks: 'Рахмет! Жаңалық шыққанда хабарлаймыз.',
  },
  en: {
    title: 'Kaspi Waybill Merger',
    subtitle: "Combine your Kaspi Shop waybills into one PDF: 4 per A4 sheet, so you don't print each one separately. Free, no signup — files are never stored.",
    dropzoneTitle: 'Choose PDF waybills',
    dropzoneHint: max => `tap here or drop files · up to ${max} files`,
    dropzoneAriaLabel: 'Choose waybill PDF files',
    filesCountLabel: n => `Files: ${n}`,
    clearButton: 'Clear',
    fileLimitWarning: max => `You can merge up to ${max} files at once — the extra ones weren't added`,
    formatA4Label: 'A4 — 4 per sheet',
    formatA6Label: 'A6 — one per sheet',
    invalidFilesError: 'Choose PDF files. If Kaspi gave you a ZIP archive, unpack it first.',
    networkError: 'Network error. Check your connection and try again.',
    mergeButton: 'Merge and download PDF',
    mergingButton: 'Merging…',
    ctaTitle: 'Want your waybills pulled from Kaspi automatically?',
    ctaBody: 'invoices.kz pulls waybills straight from your Kaspi cabinet — along with orders, price-dumping with a minimum-price guard, finances, and niche analytics.',
    ctaLink: 'See Kaspi Bot →',
    leadPromptTitle: 'Want to hear about new free tools?',
    leadPlaceholder: 'Email or phone (optional)',
    leadSubmitButton: 'Send',
    leadSendingButton: 'Sending…',
    leadThanks: "Thanks! We'll let you know when something new ships.",
  },
}

export default function WaybillMergerTool() {
  const reduceMotion = !!useReducedMotion()
  const { lang, setLang } = useLanguage()
  const t = COPY[lang]
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<'a4' | 'a6'>('a4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [justMerged, setJustMerged] = useState(false)
  const [leadContact, setLeadContact] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    const pdfs = Array.from(incoming).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) {
      setError(t.invalidFilesError)
      return
    }
    setFiles(prev => {
      const next = [...prev, ...pdfs]
      // Was a silent .slice() before -- a seller batch-dropping 40+ waybills
      // got a "successful" PDF quietly missing the last 10, no indication
      // anything was cut.
      setError(next.length > MAX_FILES ? t.fileLimitWarning(MAX_FILES) : null)
      return next.slice(0, MAX_FILES)
    })
  }

  function openPicker() {
    inputRef.current?.click()
  }

  async function merge() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('format', format)
      for (const f of files) body.append('files', f)
      const res = await fetch('/api/tools/waybills', { method: 'POST', body })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Не удалось склеить файлы')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `waybills-${format}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      // The signal that actually matters for a campaign: not that someone
      // landed here, but that the tool did its job for them. File count is
      // a rough "is this a real seller or a curious click" indicator; no
      // filenames or anything identifying is sent.
      track('waybills_merged', { format, files: files.length })
      setJustMerged(true)
    } catch {
      setError(t.networkError)
    } finally {
      setBusy(false)
    }
  }

  async function submitLead() {
    const contact = leadContact.trim()
    if (!contact) return
    setLeadStatus('sending')
    try {
      await fetch('/api/tools/waybills/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact }),
      })
    } catch {
      // Optional and low-stakes -- a failed send here isn't worth troubling
      // someone who already got what they came for with a retry prompt.
    }
    setLeadStatus('sent')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="flex items-center justify-between gap-2.5 mb-6">
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
              <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>invoices.kz</Link>
            </div>
            <div className="flex rounded-full p-0.5" style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)' }}>
              {(['ru', 'kk', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ background: lang === l ? 'var(--nav-accent)' : 'transparent', color: lang === l ? 'var(--nav-accent-ink)' : 'var(--nav-text-muted)' }}
                  aria-pressed={lang === l}>
                  {l === 'kk' ? 'ҚЗ' : l}
                </button>
              ))}
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.title}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>{t.subtitle}</p>

          <div
            role="button"
            tabIndex={0}
            aria-label={t.dropzoneAriaLabel}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onClick={openPicker}
            className="nav-glass rounded-2xl p-8 text-center cursor-pointer mb-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: dragging ? 'var(--nav-accent)' : 'var(--nav-border)' }}
          >
            {/* Mobile-first wording on purpose: analytics says 75% of this
                audience is on a phone, where there is nothing to drag. */}
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
              {t.dropzoneTitle}
            </div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
              {t.dropzoneHint(MAX_FILES)}
            </div>
            <input ref={inputRef} type="file" accept="application/pdf" multiple hidden tabIndex={-1}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {files.length > 0 && (
            <div className="nav-glass rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                  {t.filesCountLabel(files.length)}
                </span>
                <button onClick={() => setFiles([])} className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>
                  {t.clearButton}
                </button>
              </div>
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={i} className="text-xs truncate" style={{ color: 'var(--nav-text-secondary)' }}>{f.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-1 nav-glass rounded-full p-1 w-fit mb-4">
            {([['a4', t.formatA4Label], ['a6', t.formatA6Label]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setFormat(value)}
                className="text-sm font-medium rounded-full px-4 py-1.5"
                style={{
                  background: format === value ? 'var(--nav-accent)' : 'transparent',
                  color: format === value ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                }}>
                {label}
              </button>
            ))}
          </div>

          {error && <div className="text-sm mb-3" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

          <button onClick={merge} disabled={busy || files.length === 0}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {busy ? t.mergingButton : t.mergeButton}
          </button>

          {justMerged && (
            <div className="nav-glass rounded-2xl p-4 mt-4">
              {leadStatus === 'sent' ? (
                <p className="text-sm" style={{ color: 'var(--nav-success)' }}>{t.leadThanks}</p>
              ) : (
                <>
                  <p className="text-sm mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.leadPromptTitle}</p>
                  <div className="flex gap-2">
                    <input value={leadContact} onChange={e => setLeadContact(e.target.value)}
                      placeholder={t.leadPlaceholder}
                      className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                      style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-glass)' }} />
                    <button onClick={submitLead} disabled={leadStatus === 'sending' || !leadContact.trim()}
                      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex-shrink-0"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {leadStatus === 'sending' ? t.leadSendingButton : t.leadSubmitButton}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="nav-glass rounded-2xl p-5 mt-8">
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
              {t.ctaTitle}
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.ctaBody}
            </p>
            <Link href="/#features" onClick={() => track('waybills_to_product')}
              className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
              {t.ctaLink}
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
