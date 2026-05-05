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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [userId, setUserId] = useState<string>('')

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

      // Сначала удаляем старый файл
      await supabase.storage.from('signatures').remove([path])

      // Загружаем новый
      const { error } = await supabase.storage.from('signatures').upload(path, file, {
        upsert: true
      })

      if (error) {
        alert('Ошибка: ' + error.message)
        setSaving(false)
        return
      }

      const { data: urlData } = supabase.storage.from('signatures').getPublicUrl(path)
      // Добавляем timestamp чтобы обойти кэш
      const url = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('profiles').update({ signature_url: url }).eq('id', userId)
      setSignatureUrl(url)
      setShowCanvas(false)
      setSaving(false)
    }, 'image/png')
  }

  async function uploadStamp(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true)

    const path = `${userId}/stamp.png`
    await supabase.storage.from('stamps').remove([path])

    const { error } = await supabase.storage.from('stamps').upload(path, file, {
      upsert: true
    })

    if (error) { alert('Ошибка: ' + error.message); setSaving(false); return }

    const { data: urlData } = supabase.storage.from('stamps').getPublicUrl(path)
    const url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ stamp_url: url }).eq('id', userId)
    setStampUrl(url)
    setSaving(false)
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
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="text-gray-400 text-xl">‹</button>
        <span className="font-semibold text-[#1C2056]">Подпись и печать</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 w-full">
        {/* Signature */}
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

        {/* Stamp */}
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
                    <input type="file" accept="image/*" className="hidden" onChange={uploadStamp} />
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
                <p className="text-sm text-gray-400 mb-4">Загрузите фото печати (PNG с прозрачным фоном)</p>
                <label className="bg-[#1C2056] text-white px-6 py-2.5 rounded-xl text-sm font-medium cursor-pointer">
                  {saving ? 'Загружаем...' : 'Загрузить фото'}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadStamp} />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1C2056]/5 rounded-2xl p-4">
          <div className="text-xs text-[#1C2056] font-medium mb-1">💡 Совет</div>
          <div className="text-xs text-gray-500 leading-relaxed">
            Для печати лучше всего подходит фото на белом фоне или PNG с прозрачным фоном.
            Подпись и печать автоматически добавятся на все создаваемые PDF счёта.
          </div>
        </div>
      </div>
    </main>
  )
}