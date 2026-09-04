'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { track } from '@vercel/analytics'

const EASE = [0.16, 1, 0.3, 1] as const
const MAX_FILES = 30

export default function WaybillMergerTool() {
  const reduceMotion = !!useReducedMotion()
  const [files, setFiles] = useState<File[]>([])
  const [format, setFormat] = useState<'a4' | 'a6'>('a4')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(incoming: FileList | null) {
    if (!incoming) return
    setError(null)
    const pdfs = Array.from(incoming).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) {
      setError('Выберите PDF-файлы. Если Kaspi отдал ZIP-архив — сначала распакуйте его.')
      return
    }
    setFiles(prev => [...prev, ...pdfs].slice(0, MAX_FILES))
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
    } catch {
      setError('Ошибка сети. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--nav-bg)' }}>
      <div className="max-w-2xl mx-auto p-4 lg:p-6">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
        >
          <div className="flex items-center gap-2.5 mb-6">
            <img src="/icon.svg" alt="" className="w-7 h-7 rounded-lg" />
            <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>invoices.kz</Link>
          </div>

          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--nav-text-primary)' }}>Склейка накладных Kaspi</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--nav-text-secondary)' }}>
            Соберите накладные из Kaspi Магазина в один PDF: по 4 на лист А4, чтобы не печатать каждую отдельно.
            Бесплатно и без регистрации — файлы нигде не сохраняются.
          </p>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className="nav-glass rounded-2xl p-8 text-center cursor-pointer mb-4 transition-colors"
            style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: dragging ? 'var(--nav-accent)' : 'var(--nav-border)' }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--nav-text-primary)' }}>
              Перетащите PDF-накладные сюда
            </div>
            <div className="text-xs" style={{ color: 'var(--nav-text-muted)' }}>
              или нажмите, чтобы выбрать · до {MAX_FILES} файлов
            </div>
            <input ref={inputRef} type="file" accept="application/pdf" multiple hidden
              onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
          </div>

          {files.length > 0 && (
            <div className="nav-glass rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>
                  Файлов: {files.length}
                </span>
                <button onClick={() => setFiles([])} className="text-xs font-semibold" style={{ color: 'var(--nav-accent)' }}>
                  Очистить
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
            {([['a4', 'А4 — 4 на лист'], ['a6', 'А6 — по одной']] as const).map(([value, label]) => (
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
            {busy ? 'Склеиваем…' : 'Склеить и скачать PDF'}
          </button>

          <div className="nav-glass rounded-2xl p-5 mt-8">
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--nav-text-primary)' }}>
              Хотите, чтобы накладные забирались из Kaspi сами?
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--nav-text-secondary)' }}>
              В invoices.kz накладные подтягиваются прямо из вашего кабинета Kaspi — вместе с заказами,
              демпингом цен с защитой минимальной цены, финансами и аналитикой ниш.
            </p>
            <Link href="/" onClick={() => track('waybills_to_product')}
              className="text-sm font-semibold" style={{ color: 'var(--nav-accent)' }}>
              Посмотреть Kaspi Bot →
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
