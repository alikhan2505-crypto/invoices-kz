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
  const [cropSize, setCropSize] = useState(200)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement>(null)
  const cropImageRef = useRef<HTMLImageElement>(null)
  const [userId, setUserId] = useState<string>('')
  const [imgNaturalW, setImgNaturalW] = useState(0)
  const [imgNaturalH, setImgNaturalH] = useState(0)
  const [imgDisplayW, setImgDisplayW] = useState(0)
  const [imgDisplayH, setImgDisplayH] = useState(0)

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
    setOriginalFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCropImageSrc(ev.target?.result as string)
      setCropX(0)
      setCropY(0)
      setCropSize(200)
      setShowCropModal(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function onCropImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    setImgNaturalW(img.naturalWidth)
    setImgNaturalH(img.naturalHeight)
    setImgDisplayW(img.width)
    setImgDisplayH(img.height)
    // Начальный размер кропа — меньшая из сторон
    const initSize = Math.min(img.width, img.height)
    setCropSize(initSize)
    setCropX(0)
    setCropY(0)
  }

  async function applyCrop() {
    if (!cropImageSrc || !imgNaturalW) return
    setSaving(true)

    const img = new Image()
    img.src = cropImageSrc
    await new Promise(r => { img.onload = r })

    // Масштаб между натуральным и отображаемым размером
    const scaleX = imgNaturalW / imgDisplayW
    const scaleY = imgNaturalH / imgDisplayH

    const canvas = document.createElement('canvas')
    canvas.width = 300
    canvas.height = 300
    const ctx = canvas.getContext('2d')!

    // Вырезаем кроп квадрат
    ctx.drawImage(
      img,
      cropX * scaleX, cropY * scaleY,
      cropSize * scaleX, cropSize * scaleY,
      0, 0, 300, 300
    )

    canvas.toBlob(async (blob) => {
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
                  <img src={stampUrl} alt="Печать" className="h-24 w-24 object-contain" style={{ mixBlendMode: 'multiply' }} />
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
            Сфотографируйте печать на белом листе — приложение автоматически уберёт белый фон.
            Используйте кроп чтобы вырезать только печать без лишнего фона.
          </div>
        </div>
      </div>

      {/* Кроп модал */}
      {showCropModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-[#1C2056]">Выберите область печати</div>
              <button onClick={() => setShowCropModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div className="text-xs text-gray-400 mb-3">
              Передвигайте и изменяйте размер квадрата чтобы выделить печать
            </div>

            {/* Превью с кропом */}
            <div className="relative bg-gray-100 rounded-xl overflow-hidden mb-4" style={{ maxHeight: '300px' }}>
              {cropImageSrc && (
                <div className="relative inline-block w-full">
                  <img
                    ref={cropImageRef}
                    src={cropImageSrc}
                    alt="Кроп"
                    className="w-full object-contain"
                    onLoad={onCropImageLoad}
                  />
                  {/* Кроп рамка */}
                  <div
                    style={{
                      position: 'absolute',
                      left: cropX,
                      top: cropY,
                      width: cropSize,
                      height: cropSize,
                      border: '2px solid #2DC48D',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              )}
            </div>

            {/* Ползунки */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Размер: {cropSize}px</label>
                <input type="range" min={50} max={Math.min(imgDisplayW, imgDisplayH) || 300}
                  value={cropSize}
                  onChange={e => setCropSize(Number(e.target.value))}
                  className="w-full accent-[#2DC48D]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Позиция по горизонтали: {cropX}px</label>
                <input type="range" min={0} max={Math.max(0, imgDisplayW - cropSize)}
                  value={cropX}
                  onChange={e => setCropX(Number(e.target.value))}
                  className="w-full accent-[#1C2056]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Позиция по вертикали: {cropY}px</label>
                <input type="range" min={0} max={Math.max(0, imgDisplayH - cropSize)}
                  value={cropY}
                  onChange={e => setCropY(Number(e.target.value))}
                  className="w-full accent-[#1C2056]" />
              </div>
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