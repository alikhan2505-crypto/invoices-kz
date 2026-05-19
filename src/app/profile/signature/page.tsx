'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Signature() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [stampUrl, setStampUrl] = useState<string | null>(null)
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
    const { data } = await supabase.from('profiles').select('signature_url, stamp_url').eq('id', user.id).single()
    if (data) {
      setSignatureUrl(data.signature_url)
      setStampUrl(data.stamp_url)
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
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
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

    tempCanvas.toBlob(async (blob) => {
      if (!blob) { setSaving(false); return }
      const file = new File([blob], 'stamp.png', { type: 'image/png' })
      const path = `${userId}/stamp.png`
      await supabase.storage.from('stamps').remove([path])
      const { error } = await supabase.storage.from('stamps').upload(path, file, { upsert: true })
      if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }
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

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Подпись и печать</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 w-full">

        {/* Подпись */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Подпись руководителя</div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {signatureUrl && !showCanvas ? (
              <div>
                <div className="border rounded-xl p-3 mb-3 bg-gray-50">
                  <img src={signatureUrl} alt="Подпись" className="h-20 object-contain" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowCanvas(true)}
                    className="flex-1 border border-[#1C2056] text-[#1C2056] rounded-xl py-2.5 text-sm font-medium">
                    Перерисовать
                  </button>
                  <button onClick={removeSignature}
                    className="flex-1 border border-red-200 text-red-400 rounded-xl py-2.5 text-sm font-medium">
                    Удалить
                  </button>
                </div>
              </div>
            ) : showCanvas ? (
              <div>
                <p className="text-xs text-gray-400 mb-2">Нарисуйте подпись в поле ниже:</p>
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="border-2 border-dashed border-gray-200 rounded-xl w-full touch-none cursor-crosshair bg-white"
                  style={{ touchAction: 'none' }}
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
                    className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm">
                    Очистить
                  </button>
                  <button onClick={() => setShowCanvas(false)}
                    className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm">
                    Отмена
                  </button>
                  <button onClick={saveSignature} disabled={saving}
                    className="flex-1 bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
                    {saving ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">✍️</div>
                <p className="text-sm text-gray-400 mb-4">Подпись будет добавлена на PDF счёт</p>
                <button onClick={() => setShowCanvas(true)}
                  className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium">
                  Нарисовать подпись
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Печать */}
        <div>
          <div className="text-xs text-gray-400 uppercase tracking-wide px-1 mb-2">Печать организации</div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            {stampUrl ? (
              <div>
                <div className="border rounded-xl p-3 mb-3 bg-gray-50 flex items-center justify-center">
                  <img src={stampUrl} alt="Печать" className="h-24 w-24 object-contain" />
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 border border-[#1C2056] text-[#1C2056] rounded-xl py-2.5 text-sm font-medium text-center cursor-pointer">
                    Заменить
                    <input type="file" accept="image/*" className="hidden" onChange={openCropModal} />
                  </label>
                  <button onClick={removeStamp}
                    className="flex-1 border border-red-200 text-red-400 rounded-xl py-2.5 text-sm font-medium">
                    Удалить
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">🔵</div>
                <p className="text-sm text-gray-400 mb-4">Загрузите фото печати — белый фон уберётся автоматически</p>
                <label className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer">
                  {saving ? 'Загружаем...' : 'Загрузить фото'}
                  <input type="file" accept="image/*" className="hidden" onChange={openCropModal} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1C2056]/5 rounded-2xl p-4">
          <div className="text-xs text-[#1C2056] font-medium mb-1">💡 Совет</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            Сфотографируйте печать на белом листе — белый фон уберётся автоматически.
            Перемещайте рамку пальцем, используйте щипок для изменения размера.
          </div>
        </div>
      </div>

      {/* Кроп модал */}
      {showCropModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-[#1C2056]">Выберите область печати</div>
                <div className="text-xs text-gray-400 mt-0.5">Перемещайте рамку · Щипок для размера</div>
              </div>
              <button onClick={() => setShowCropModal(false)} className="text-gray-400 text-xl">✕</button>
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
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Размер рамки</span>
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
                className="w-full accent-[#2DC48D]"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowCropModal(false)}
                className="flex-1 border border-gray-200 text-gray-500 rounded-xl py-3 text-sm">
                Отмена
              </button>
              <button onClick={applyCrop} disabled={saving}
                className="flex-1 bg-[#2DC48D] text-white rounded-xl py-3 text-sm font-medium">
                {saving ? 'Сохраняем...' : '✅ Сохранить печать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}