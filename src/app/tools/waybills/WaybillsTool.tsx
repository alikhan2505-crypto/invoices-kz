'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import BrandWordmark from '@/components/BrandWordmark'
import { motion, useReducedMotion } from 'framer-motion'
import { track } from '@vercel/analytics'
import { useLanguage } from '@/components/LanguageProvider'
import { PRODUCTS } from '@/lib/products'
import { guidesIndexPath, toolsIndexPath, TOOL_CHROME, type ToolLang } from '@/lib/tools-i18n'
import ToolLangSwitch from '@/lib/tools-i18n/ToolLangSwitch'
import { waybillsDict } from './dict'
import { MAX_FILES, MAX_TOTAL_BYTES, addToQueue, expandUploads, sheetCount, totalBytes } from './uploads'

// Один и тот же инструмент для /tools/waybills, /tools/kk/waybills и
// /tools/en/waybills: язык приходит пропсом из page.tsx (то есть из адреса),
// а не из куки посетителя — см. docs/tools-i18n-pattern.md.
//
// Внизу вместо общей карточки ToolCta «Начать бесплатно» — своя карточка про
// Kaspi Bot: сюда приходят продавцы Kaspi, и им показывать счета/контрагентов
// мимо цели. Ведёт на лендинг Kaspi Bot (kaspi.invoices.kz), а не на #features
// лендинга счетов, как раньше.

const EASE = [0.16, 1, 0.3, 1] as const

const KASPI_BOT_LANDING =
  (PRODUCTS.find(p => p.key === 'kaspiShop')?.landing ?? 'https://kaspi.invoices.kz') +
  '/?utm_source=tools&utm_medium=cta&utm_campaign=waybills'

type Notice = { tone: 'error' | 'info'; text: string }

export default function WaybillsTool({ lang }: { lang: ToolLang }) {
  const t = waybillsDict[lang]
  const chrome = TOOL_CHROME[lang]
  const reduceMotion = !!useReducedMotion()
  const { setLang } = useLanguage()
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<'a4' | 'a6'>('a4')
  const [busy, setBusy] = useState(false)
  const [unpacking, setUnpacking] = useState(false)
  const [notices, setNotices] = useState<Notice[]>([])
  const [dragging, setDragging] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [justMerged, setJustMerged] = useState(false)
  const [leadContact, setLeadContact] = useState('')
  const [leadStatus, setLeadStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  // Состояние очереди для асинхронного addFiles: пока распаковывается архив,
  // человек может успеть нажать «Очистить» или убрать файл.
  const filesRef = useRef<File[]>([])
  filesRef.current = files

  const replaceFiles = (next: File[]) => {
    filesRef.current = next
    setFiles(next)
    setDone(null)
  }

  async function addFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return
    const list = Array.from(incoming)
    const hasZip = list.some(f => !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf')
    if (hasZip) setUnpacking(true)
    try {
      const expanded = await expandUploads(list)
      const next: Notice[] = []
      if (expanded.zipBroken) next.push({ tone: 'error', text: t.zipBroken })
      if (expanded.zipEmpty) next.push({ tone: 'error', text: t.zipEmpty })
      if (expanded.pdfs.length === 0) {
        if (next.length === 0) next.push({ tone: 'error', text: t.invalidFiles })
        setNotices(next)
        return
      }
      const q = addToQueue(filesRef.current, expanded.pdfs)
      for (const name of q.tooBig) next.push({ tone: 'error', text: t.fileTooBig(name) })
      // Раньше лишние файлы молча срезались .slice() — продавец, бросивший
      // 40 накладных, получал «успешный» PDF без последних десяти.
      if (q.overflow > 0) next.push({ tone: 'error', text: t.fileLimit(MAX_FILES) })
      if (q.duplicates > 0) next.push({ tone: 'info', text: t.duplicates(q.duplicates) })
      if (expanded.rejected > 0 && next.length === 0) next.push({ tone: 'info', text: t.invalidFiles })
      replaceFiles(q.next)
      setNotices(next)
    } finally {
      setUnpacking(false)
    }
  }

  function openPicker() {
    inputRef.current?.click()
  }

  function removeAt(index: number) {
    replaceFiles(files.filter((_, i) => i !== index))
    setNotices([])
  }

  async function merge() {
    if (files.length === 0 || busy) return
    // Больше предела платформы — сервер ответил бы 413, не дойдя до роута.
    if (totalBytes(files) > MAX_TOTAL_BYTES) {
      setDone(null)
      setNotices([{ tone: 'error', text: t.errTooLarge }])
      return
    }
    setBusy(true)
    setNotices([])
    setDone(null)
    try {
      const body = new FormData()
      body.append('format', format)
      for (const f of files) body.append('files', f)
      const res = await fetch('/api/tools/waybills', { method: 'POST', body })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        // Роут отвечает текстом ошибки по-русски; на ru показываем его как
        // есть, на kk/en — свой перевод по коду ответа. 413 приходит не от
        // роута, а от платформы (лимит тела запроса), без JSON.
        const serverText = typeof data?.error === 'string' ? data.error : null
        const text = res.status === 413 ? t.errTooLarge
          : lang === 'ru' && serverText ? serverText
          : res.status === 429 ? t.errTooMany
          : res.status === 400 ? t.errUnreadable
          : t.errGeneric
        setNotices([{ tone: 'error', text }])
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `waybills-${format}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Safari/iOS читает blob-ссылку уже после click() — отзываем не сразу.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      // Сигнал, который реально важен для кампании: не что зашли, а что
      // инструмент сделал работу. Число файлов — грубый признак «настоящий
      // продавец или любопытный клик»; имён файлов и ничего личного не шлём.
      track('waybills_merged', { format, files: files.length, lang })
      setDone(t.done(files.length, sheetCount(files.length, format)))
      setJustMerged(true)
    } catch {
      setNotices([{ tone: 'error', text: t.networkError }])
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
      // Необязательно и без последствий: человек уже получил свой PDF, не
      // стоит дёргать его просьбой повторить.
    }
    setLeadStatus('sent')
  }

  const pickerBusy = unpacking || busy

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <BrandWordmark height={15} />
            <ToolLangSwitch slug="waybills" lang={lang} />
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>{t.h1}</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>{t.intro}</p>

          <div
            role="button"
            tabIndex={0}
            aria-label={t.dropzoneAria}
            aria-busy={unpacking}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker() } }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) }}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onClick={openPicker}
            className="nav-glass rounded-2xl p-8 text-center cursor-pointer mb-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: dragging ? 'var(--nav-accent)' : 'var(--nav-border)' }}
          >
            {/* Формулировка под телефон намеренно: по аналитике 75% этой
                аудитории на телефоне, где перетаскивать нечего. */}
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
              {unpacking ? t.unpacking : dragging ? t.dropzoneActive : t.dropzoneTitle}
            </div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
              {t.dropzoneHint(MAX_FILES)}
            </div>
            <input ref={inputRef} type="file" multiple hidden tabIndex={-1}
              accept="application/pdf,.pdf,application/zip,application/x-zip-compressed,.zip"
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {files.length > 0 && (
            <div className="nav-glass rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                  {t.filesCount(files.length)}
                </span>
                <button type="button" onClick={() => { replaceFiles([]); setNotices([]) }}
                  className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>
                  {t.clear}
                </button>
              </div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${i}`} className="flex items-center gap-2 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
                    <span className="truncate flex-1 min-w-0">{f.name}</span>
                    <button type="button" onClick={() => removeAt(i)} aria-label={t.removeFile(f.name)}
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm leading-none"
                      style={{ color: 'var(--nav-text-muted)' }}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="mb-4">
            <legend className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--nav-text-muted)' }}>
              {t.formatLegend}
            </legend>
            <div className="grid grid-cols-2 gap-1 nav-glass rounded-2xl p-1">
              {([['a4', t.formatA4, t.formatA4Hint], ['a6', t.formatA6, t.formatA6Hint]] as const).map(([value, label, hint]) => (
                <button key={value} type="button" onClick={() => { setFormat(value); setDone(null) }}
                  aria-pressed={format === value}
                  className="rounded-xl px-3 py-2 text-left"
                  style={{
                    background: format === value ? 'var(--nav-accent)' : 'transparent',
                    color: format === value ? 'var(--nav-accent-ink)' : 'var(--nav-text-secondary)',
                  }}>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-[11px] opacity-80">{hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div aria-live="polite">
            {notices.map((n, i) => (
              <div key={i} className="text-sm mb-2"
                style={{ color: n.tone === 'error' ? 'var(--nav-critical)' : 'var(--nav-text-secondary)' }}>
                {n.text}
              </div>
            ))}
            {done && <div className="text-sm mb-3" style={{ color: 'var(--nav-success)' }}>{done}</div>}
          </div>

          <button type="button" onClick={merge} disabled={pickerBusy || files.length === 0}
            className="w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50 mt-1"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {busy ? t.merging : t.merge}
          </button>

          {justMerged && (
            <div className="nav-glass rounded-2xl p-4 mt-4">
              {leadStatus === 'sent' ? (
                <p className="text-sm" style={{ color: 'var(--nav-success)' }}>{t.leadThanks}</p>
              ) : (
                <>
                  <p className="text-sm mb-2" style={{ color: 'var(--nav-text-secondary)' }}>{t.leadPrompt}</p>
                  <div className="flex gap-2">
                    <input value={leadContact} onChange={e => setLeadContact(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') submitLead() }}
                      placeholder={t.leadPlaceholder}
                      aria-label={t.leadAria}
                      autoComplete="email"
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)]"
                      // WebkitTextFillColor: globals.css задаёт input { -webkit-text-fill-color: #111827 },
                      // и в тёмной теме набранный адрес был почти невиден (как у остальных инструментов).
                      style={{ color: 'var(--nav-text-primary)', WebkitTextFillColor: 'var(--nav-text-primary)', background: 'var(--nav-surface-glass)' }} />
                    <button type="button" onClick={submitLead} disabled={leadStatus === 'sending' || !leadContact.trim()}
                      className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex-shrink-0"
                      style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                      {leadStatus === 'sending' ? t.leadSending : t.leadSubmit}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <section className="mt-8">
            <h2 className="text-base font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.howTitle}</h2>
            <ol className="space-y-2">
              {t.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--nav-surface-glass)', border: '1px solid var(--nav-border)', color: 'var(--nav-text-primary)' }}
                    aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <h2 className="text-base font-bold mb-3" style={{ color: 'var(--nav-text-primary)' }}>{t.faqTitle}</h2>
            <div className="nav-glass rounded-2xl divide-y" style={{ borderColor: 'var(--nav-border)' }}>
              {t.faq.map(item => (
                <details key={item.q} className="group px-4 py-3" style={{ borderColor: 'var(--nav-border)' }}>
                  <summary className="cursor-pointer text-sm font-semibold list-none flex items-center justify-between gap-3" style={{ color: 'var(--nav-text-primary)' }}>
                    {item.q}
                    <span className="text-xs transition-transform group-open:rotate-45 flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-hidden="true">+</span>
                  </summary>
                  <p className="text-[13px] mt-2" style={{ color: 'var(--nav-text-secondary)' }}>{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="nav-glass rounded-2xl p-5 mt-8">
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
              {t.ctaTitle}
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
              {t.ctaBody}
            </p>
            {/* Лендинг на поддомене берёт язык из общей куки — клик запоминает язык страницы. */}
            <a href={KASPI_BOT_LANDING} onClick={() => { setLang(lang); track('waybills_to_product', { lang }) }}
              className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
              {t.ctaLink}
            </a>
          </div>

          <div className="mt-6 flex gap-4 flex-wrap">
            <Link href={toolsIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.allTools}</Link>
            <Link href={guidesIndexPath(lang)} className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>{chrome.guides}</Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
