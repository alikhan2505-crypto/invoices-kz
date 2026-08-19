'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { resizeToFit } from '@/lib/imageResize'
import { useLanguage } from '@/components/LanguageProvider'
import { backLabel, closeLabel } from '@/lib/a11yLabels'
import { profileCoreDict } from '@/lib/i18n/profileCore'
import SiteNav from '@/components/SiteNav'
import DesktopShell from '@/components/DesktopShell'

// Same easing curve used across the redesigned app (see src/app/dashboard/page.tsx) --
// kept identical rather than inventing a second "house" ease.
const EASE = [0.16, 1, 0.3, 1] as const

function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
function PenIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 3 4 4L7 21H3v-4L17 3Z" />
      <path d="m14.5 5.5 4 4" />
    </svg>
  )
}
function StampIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="10" r="7" />
      <path d="m9 10 2 2 4-4" />
      <path d="M8 21h8M9 21v-4M15 21v-4" />
    </svg>
  )
}
function BuildingIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M14 10h5a1 1 0 0 1 1 1v10" />
      <path d="M9 8h.01M9 12h.01M9 16h.01" />
      <path d="M2 21h20" />
    </svg>
  )
}

// Same rounded-bordered field treatment used by src/app/create/page.tsx.
const INPUT_CLS = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'
const OUTLINE_BTN_CLS = 'flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors'

export default function Signature() {
  const router = useRouter()
  const { lang } = useLanguage()
  const t = profileCoreDict[lang]
  const reduceMotionRaw = useReducedMotion()
  const reduceMotion = !!reduceMotionRaw
  const [saving, setSaving] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [stampUrl, setStampUrl] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [savingLogo, setSavingLogo] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)
  const [showCropModal, setShowCropModal] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string>('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)
  const [userId, setUserId] = useState<string>('')

  // Кроп состояние
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [cropSize, setCropSize] = useState(200)
  const [canvasW, setCanvasW] = useState(0)
  const [canvasH, setCanvasH] = useState(0)
  const [naturalW, setNaturalW] = useState(0)
  const [naturalH, setNaturalH] = useState(0)

  // Touch/drag состояние
  const dragStart = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const pinchStart = useRef<{ dist: number; size: number } | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    const { data } = await supabase.from('profiles').select('signature_url, stamp_url, logo_url').eq('id', user.id).single()
    if (data) {
      setSignatureUrl(data.signature_url)
      setStampUrl(data.stamp_url)
      setLogoUrl(data.logo_url)
    }
  }

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1C2056'
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stopDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    setIsDrawing(false)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function saveSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    canvas.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return }
      const file = new File([blob], 'signature.png', { type: 'image/png' })
      const path = `${userId}/signature.png`
      await supabase.storage.from('signatures').remove([path])
      const { error } = await supabase.storage.from('signatures').upload(path, file, { upsert: true })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ signature_url: url }).eq('id', userId)
      setSignatureUrl(url)
      setShowCanvas(false)
      setSaving(false)
    }, 'image/png')
  }

  function openCropModal(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      setCropImageSrc(src)
      // Загружаем изображение чтобы узнать размеры
      const img = new Image()
      img.onload = () => {
        setNaturalW(img.naturalWidth)
        setNaturalH(img.naturalHeight)
        // Canvas кропа — фиксированная ширина 320px
        const displayW = 320
        const displayH = Math.round(img.naturalHeight * displayW / img.naturalWidth)
        setCanvasW(displayW)
        setCanvasH(displayH)
        const initSize = Math.min(displayW, displayH) * 0.7
        setCropSize(initSize)
        setCropX((displayW - initSize) / 2)
        setCropY((displayH - initSize) / 2)
        setShowCropModal(true)
        setTimeout(() => drawCropCanvas(src, img.naturalWidth, img.naturalHeight, displayW, displayH, (displayW - initSize) / 2, (displayH - initSize) / 2, initSize), 100)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function drawCropCanvas(src: string, nw: number, nh: number, dw: number, dh: number, cx: number, cy: number, cs: number) {
    const canvas = cropCanvasRef.current
    if (!canvas) return
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, dw, dh)
      ctx.drawImage(img, 0, 0, dw, dh)
      // Затемнение вне кропа
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.fillRect(0, 0, dw, dh)
      // Вырезаем прозрачный квадрат
      ctx.clearRect(cx, cy, cs, cs)
      // Рисуем изображение в область кропа
      const scaleX = nw / dw
      const scaleY = nh / dh
      ctx.drawImage(img, cx * scaleX, cy * scaleY, cs * scaleX, cs * scaleY, cx, cy, cs, cs)
      // Рамка
      ctx.strokeStyle = '#2DC48D'
      ctx.lineWidth = 2
      ctx.strokeRect(cx, cy, cs, cs)
      // Угловые маркеры
      const m = 12
      ctx.lineWidth = 3
      ;[[cx, cy], [cx + cs, cy], [cx, cy + cs], [cx + cs, cy + cs]].forEach(([x, y], i) => {
        ctx.beginPath()
        if (i === 0) { ctx.moveTo(x + m, y); ctx.lineTo(x, y); ctx.lineTo(x, y + m) }
        if (i === 1) { ctx.moveTo(x - m, y); ctx.lineTo(x, y); ctx.lineTo(x, y + m) }
        if (i === 2) { ctx.moveTo(x + m, y); ctx.lineTo(x, y); ctx.lineTo(x, y - m) }
        if (i === 3) { ctx.moveTo(x - m, y); ctx.lineTo(x, y); ctx.lineTo(x, y - m) }
        ctx.stroke()
      })
    }
    img.src = src
  }

  function redraw(newCx?: number, newCy?: number, newCs?: number) {
    const cx = newCx !== undefined ? newCx : cropX
    const cy = newCy !== undefined ? newCy : cropY
    const cs = newCs !== undefined ? newCs : cropSize
    drawCropCanvas(cropImageSrc, naturalW, naturalH, canvasW, canvasH, cx, cy, cs)
  }

  function clamp(val: number, min: number, max: number) { return Math.max(min, Math.min(max, val)) }

  function onCropTouchStart(e: React.TouchEvent) {
    e.preventDefault()
    if (e.touches.length === 1) {
      const canvas = cropCanvasRef.current!
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvasW / rect.width
      const x = (e.touches[0].clientX - rect.left) * scaleX
      const scaleY = canvasH / rect.height
      const y = (e.touches[0].clientY - rect.top) * scaleY
      dragStart.current = { x, y, cx: cropX, cy: cropY }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      pinchStart.current = { dist, size: cropSize }
    }
  }

  function onCropTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    const canvas = cropCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvasW / rect.width
    const scaleY = canvasH / rect.height

    if (e.touches.length === 2 && pinchStart.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / pinchStart.current.dist
      const newSize = clamp(pinchStart.current.size * ratio, 50, Math.min(canvasW, canvasH))
      const newCx = clamp(cropX, 0, canvasW - newSize)
      const newCy = clamp(cropY, 0, canvasH - newSize)
      setCropSize(newSize)
      setCropX(newCx)
      setCropY(newCy)
      redraw(newCx, newCy, newSize)
    } else if (e.touches.length === 1 && dragStart.current) {
      const x = (e.touches[0].clientX - rect.left) * scaleX
      const y = (e.touches[0].clientY - rect.top) * scaleY
      const dx = x - dragStart.current.x
      const dy = y - dragStart.current.y
      const newCx = clamp(dragStart.current.cx + dx, 0, canvasW - cropSize)
      const newCy = clamp(dragStart.current.cy + dy, 0, canvasH - cropSize)
      setCropX(newCx)
      setCropY(newCy)
      redraw(newCx, newCy)
    }
  }

  function onCropTouchEnd() {
    dragStart.current = null
    pinchStart.current = null
  }

  // Mouse drag для десктопа
  function onCropMouseDown(e: React.MouseEvent) {
    const canvas = cropCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvasW / rect.width
    const scaleY = canvasH / rect.height
    dragStart.current = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      cx: cropX, cy: cropY
    }
  }

  function onCropMouseMove(e: React.MouseEvent) {
    if (!dragStart.current) return
    const canvas = cropCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvasW / rect.width
    const scaleY = canvasH / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const dx = x - dragStart.current.x
    const dy = y - dragStart.current.y
    const newCx = clamp(dragStart.current.cx + dx, 0, canvasW - cropSize)
    const newCy = clamp(dragStart.current.cy + dy, 0, canvasH - cropSize)
    setCropX(newCx)
    setCropY(newCy)
    redraw(newCx, newCy)
  }

  function onCropMouseUp() { dragStart.current = null }

  // Скролл для изменения размера на десктопе
  function onCropWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -10 : 10
    const newSize = clamp(cropSize + delta, 50, Math.min(canvasW, canvasH))
    const newCx = clamp(cropX, 0, canvasW - newSize)
    const newCy = clamp(cropY, 0, canvasH - newSize)
    setCropSize(newSize)
    setCropX(newCx)
    setCropY(newCy)
    redraw(newCx, newCy, newSize)
  }

  async function applyCrop() {
    setSaving(true)
    const img = new Image()
    img.src = cropImageSrc
    await new Promise(r => { img.onload = r })

    const scaleX = naturalW / canvasW
    const scaleY = naturalH / canvasH

    // Вырезаем область
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = 300
    tempCanvas.height = 300
    const ctx = tempCanvas.getContext('2d')!
    ctx.drawImage(img, cropX * scaleX, cropY * scaleY, cropSize * scaleX, cropSize * scaleY, 0, 0, 300, 300)

    // Убираем белый/серый фон
    const imageData = ctx.getImageData(0, 0, 300, 300)
    const data = imageData.data
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2]
      // Проверяем насыщенность — печать обычно синяя/фиолетовая
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const saturation = max === 0 ? 0 : (max - min) / max

      // Убираем если: светлый И ненасыщенный (серый/белый фон)
      if (saturation < 0.15 && r > 160) {
        // Белый/серый фон — полностью прозрачный
        data[i + 3] = 0
      } else if (saturation < 0.25 && r > 200) {
        // Почти серый — прозрачный
        data[i + 3] = 0
      } else if (r > 220 && g > 220 && b > 220) {
        // Очень светлый любого цвета — прозрачный
        data[i + 3] = 0
      } else if (saturation < 0.2 && r > 130) {
        // Светло-серый — полупрозрачный для плавного перехода
        data[i + 3] = Math.round(saturation * 255 * 5)
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // Увеличиваем насыщенность и контраст оставшихся пикселей
    const imageData2 = ctx.getImageData(0, 0, 300, 300)
    const d2 = imageData2.data
    for (let i = 0; i < d2.length; i += 4) {
      if (d2[i + 3] === 0) continue // пропускаем прозрачные
      // Увеличиваем насыщенность — усиливаем доминирующий цвет
      const r = d2[i], g = d2[i + 1], b = d2[i + 2]
      const avg = (r + g + b) / 3
      const factor = 1.8 // насыщенность
      d2[i]     = Math.min(255, Math.round(avg + (r - avg) * factor))
      d2[i + 1] = Math.min(255, Math.round(avg + (g - avg) * factor))
      d2[i + 2] = Math.min(255, Math.round(avg + (b - avg) * factor))
      // Уменьшаем яркость чтобы казалась темнее/ярче
      const brightness = 0.75
      d2[i]     = Math.round(d2[i] * brightness)
      d2[i + 1] = Math.round(d2[i + 1] * brightness)
      d2[i + 2] = Math.round(d2[i + 2] * brightness)
    }
    ctx.putImageData(imageData2, 0, 0)

    tempCanvas.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return }
      const file = new File([blob], 'stamp.png', { type: 'image/png' })
      const path = `${userId}/stamp.png`
      await supabase.storage.from('stamps').remove([path])
      const { error } = await supabase.storage.from('stamps').upload(path, file, { upsert: true })
      if (error) { alert(t.errorPrefix(error.message)); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('stamps').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ stamp_url: url }).eq('id', userId)
      setStampUrl(url)
      setShowCropModal(false)
      setSaving(false)
    }, 'image/png')
  }

  async function removeSignature() {
    await supabase.storage.from('signatures').remove([`${userId}/signature.png`])
    await supabase.from('profiles').update({ signature_url: null }).eq('id', userId)
    setSignatureUrl(null)
  }

  async function removeStamp() {
    await supabase.storage.from('stamps').remove([`${userId}/stamp.png`])
    await supabase.from('profiles').update({ stamp_url: null }).eq('id', userId)
    setStampUrl(null)
  }

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSavingLogo(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const resizedDataUrl = await resizeToFit(dataUrl, 500, 200)
      const blob = await (await fetch(resizedDataUrl)).blob()
      const path = `${userId}/logo.png`
      const { error } = await supabase.storage.from('logos').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (error) { alert(t.errorPrefix(error.message)); setSavingLogo(false); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ logo_url: url }).eq('id', userId)
      setLogoUrl(url)
      setSavingLogo(false)
    }
    reader.onerror = () => { alert(t.fileReadErrorAlert); setSavingLogo(false) }
    reader.readAsDataURL(file)
  }

  async function removeLogo() {
    await supabase.storage.from('logos').remove([`${userId}/logo.png`])
    await supabase.from('profiles').update({ logo_url: null }).eq('id', userId)
    setLogoUrl(null)
  }

  const fadeIn = (i: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: reduceMotion ? 0 : i * 0.05, duration: reduceMotion ? 0 : 0.4, ease: EASE },
  })

  return (
    <DesktopShell>
    <main className="page-surface-in-shell min-h-screen pb-24 lg:pb-6 lg:min-h-full flex flex-col">
      <SiteNav />
      <div className="max-w-lg lg:max-w-2xl mx-auto p-4 space-y-4 w-full">

        <motion.div {...fadeIn(0)} className="nav-glass rounded-2xl px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/profile')} className="back-btn transition-colors flex-shrink-0" style={{ color: 'var(--nav-text-muted)' }} aria-label={backLabel(lang)}>
            <ChevronLeftIcon />
          </button>
          <span className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.signatureHeaderLabel}</span>
        </motion.div>

        {/* Подпись */}
        <motion.div {...fadeIn(1)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.signatureSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4">
            {signatureUrl && !showCanvas ? (
              <div>
                <div className="rounded-xl p-3 mb-3" style={{ border: '1px solid var(--nav-border-soft)', background: 'var(--nav-bg)' }}>
                  <img src={signatureUrl} alt={t.signatureAltText} className="h-20 object-contain" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowCanvas(true)}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-accent)', color: 'var(--nav-accent)' }}>
                    {t.redrawButton}
                  </button>
                  <button onClick={removeSignature}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-critical)', color: 'var(--nav-critical)' }}>
                    {t.removeButton}
                  </button>
                </div>
              </div>
            ) : showCanvas ? (
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--nav-text-muted)' }}>{t.drawSignatureHint}</p>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="rounded-xl w-full touch-none cursor-crosshair"
                  style={{ touchAction: 'none', border: '2px dashed var(--nav-border)', background: '#fff' }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                <div className="flex gap-2 mt-3">
                  <button onClick={clearCanvas}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-secondary)' }}>
                    {t.clearButton}
                  </button>
                  <button onClick={() => setShowCanvas(false)}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-secondary)' }}>
                    {t.cancelButton}
                  </button>
                  <button onClick={saveSignature} disabled={saving}
                    className="flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-60"
                    style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                    {saving ? t.savingEllipsis : t.saveButton}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, var(--nav-accent-soft), transparent)', color: 'var(--nav-accent)' }}>
                  <PenIcon />
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.noSignatureHint}</p>
                <button onClick={() => setShowCanvas(true)}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {t.drawSignatureButton}
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Печать */}
        <motion.div {...fadeIn(2)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.stampSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4">
            {stampUrl ? (
              <div>
                <div className="rounded-xl p-3 mb-3 flex items-center justify-center" style={{ border: '1px solid var(--nav-border-soft)', background: 'var(--nav-bg)' }}>
                  <img src={stampUrl} alt={t.stampAltText} className="h-24 w-24 object-contain" />
                </div>
                <div className="flex gap-2">
                  <label className={`${OUTLINE_BTN_CLS} text-center cursor-pointer`} style={{ borderColor: 'var(--nav-accent)', color: 'var(--nav-accent)' }}>
                    {t.replaceButton}
                    <input type="file" accept="image/*" className="hidden" onChange={openCropModal} />
                  </label>
                  <button onClick={removeStamp}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-critical)', color: 'var(--nav-critical)' }}>
                    {t.removeButton}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, var(--nav-teal-soft), transparent)', color: 'var(--nav-teal)' }}>
                  <StampIcon />
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.noStampHint}</p>
                <label className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {saving ? t.uploadingLabel : t.uploadPhotoButton}
                  <input type="file" accept="image/*" className="hidden" onChange={openCropModal} />
                </label>
              </div>
            )}
          </div>
        </motion.div>

        {/* Логотип */}
        <motion.div {...fadeIn(3)}>
          <div className="text-[11px] font-extrabold uppercase px-1 mb-2" style={{ color: 'var(--nav-text-muted)', letterSpacing: '0.09em' }}>{t.logoSectionLabel}</div>
          <div className="nav-glass rounded-2xl p-4">
            {logoUrl ? (
              <div>
                <div className="rounded-xl p-3 mb-3 flex items-center justify-center" style={{ border: '1px solid var(--nav-border-soft)', background: 'var(--nav-bg)' }}>
                  <img src={logoUrl} alt={t.logoAltText} className="h-16 object-contain" />
                </div>
                <div className="flex gap-2">
                  <label className={`${OUTLINE_BTN_CLS} text-center cursor-pointer`} style={{ borderColor: 'var(--nav-accent)', color: 'var(--nav-accent)' }}>
                    {t.replaceButton}
                    <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                  </label>
                  <button onClick={removeLogo}
                    className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-critical)', color: 'var(--nav-critical)' }}>
                    {t.removeButton}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, var(--nav-magenta-soft), transparent)', color: 'var(--nav-magenta)' }}>
                  <BuildingIcon />
                </div>
                <p className="text-sm mb-4" style={{ color: 'var(--nav-text-muted)' }}>{t.noLogoHint}</p>
                <label className="px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                  {savingLogo ? t.uploadingLabel : t.uploadLogoButton}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                </label>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div {...fadeIn(4)} className="rounded-2xl p-4" style={{ background: 'var(--nav-accent-soft)' }}>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--nav-accent)' }}>{t.tipLabel}</div>
          <div className="text-xs leading-relaxed" style={{ color: 'var(--nav-text-secondary)' }}>
            {t.tipBodyText}
          </div>
        </motion.div>
      </div>

      {/* Кроп модал */}
      {showCropModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-w-lg mx-auto rounded-t-3xl p-5" style={{ background: 'var(--nav-surface-chrome)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{t.cropModalTitle}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--nav-text-muted)' }}>{t.cropModalSubtitle}</div>
              </div>
              <button onClick={() => setShowCropModal(false)} className="back-btn transition-colors" style={{ color: 'var(--nav-text-muted)' }} aria-label={closeLabel(lang)}><XIcon /></button>
            </div>

            {/* Canvas кропа */}
            <div className="rounded-xl overflow-hidden mb-4 bg-black">
              <canvas
                ref={cropCanvasRef}
                style={{ width: '100%', touchAction: 'none', cursor: 'move', display: 'block' }}
                onTouchStart={onCropTouchStart}
                onTouchMove={onCropTouchMove}
                onTouchEnd={onCropTouchEnd}
                onMouseDown={onCropMouseDown}
                onMouseMove={onCropMouseMove}
                onMouseUp={onCropMouseUp}
                onMouseLeave={onCropMouseUp}
                onWheel={onCropWheel}
              />
            </div>

            {/* Ползунок размера */}
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--nav-text-muted)' }}>
                <span>{t.cropSizeLabel}</span>
                <span>{Math.round(cropSize)}px</span>
              </div>
              <input type="range"
                min={50}
                max={Math.min(canvasW, canvasH)}
                value={cropSize}
                onChange={e => {
                  const newSize = Number(e.target.value)
                  const newCx = clamp(cropX, 0, canvasW - newSize)
                  const newCy = clamp(cropY, 0, canvasH - newSize)
                  setCropSize(newSize)
                  setCropX(newCx)
                  setCropY(newCy)
                  redraw(newCx, newCy, newSize)
                }}
                className="w-full accent-[color:var(--nav-accent)]" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCropModal(false)}
                className={OUTLINE_BTN_CLS} style={{ borderColor: 'var(--nav-border)', color: 'var(--nav-text-secondary)' }}>
                {t.cancelButton}
              </button>
              <button onClick={applyCrop} disabled={saving}
                className="flex-1 rounded-xl py-3 text-sm font-medium disabled:opacity-60"
                style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
                {saving ? t.savingEllipsis : t.saveStampButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </DesktopShell>
  )
}
