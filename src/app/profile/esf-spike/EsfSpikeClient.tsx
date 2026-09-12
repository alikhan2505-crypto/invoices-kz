'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { runSigexQrSigning, SigexQrState } from '@/lib/signDocument'

// TEMPORARY diagnostic page for the Task 1 spike in
// docs/superpowers/plans/2026-09-12-esf-electronic-invoice.md -- verifies
// whether the existing SIGEX/eGov QR ceremony (built for RSA-signing PDF
// contracts) can also produce a GOST-algorithm signature, which the ЭСФ
// government API requires for its invoice-content signature field.
// Deleted once the spike is resolved either way.
export default function EsfSpikeClient() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [qr, setQr] = useState<SigexQrState | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { checkAdmin() }, [])

  async function checkAdmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }
    setChecked(true)
  }

  async function start() {
    setError(null)
    setSignature(null)
    setQr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/esf/spike-sign')
      const { sampleXml } = await res.json()
      const blob = new Blob([sampleXml], { type: 'application/xml' })
      const sig = await runSigexQrSigning('ЭСФ-спайк: тест подписи', blob, state => setQr(state))
      setSignature(sig)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!checked) return null

  return (
    <div style={{ padding: 24, maxWidth: 480, fontFamily: 'sans-serif' }}>
      <h1>ЭСФ: проверка подписи ГОСТ</h1>
      <p>
        Нажмите кнопку, отсканируйте QR в eGov mobile.{' '}
        <b>Когда приложение попросит выбрать сертификат — обратите внимание, есть ли среди вариантов сертификат ГОСТ
        (не только RSA/аутентификация). Подпишите ГОСТ-сертификатом, если он предложен.</b>
      </p>
      <button onClick={start} disabled={busy}>{busy ? 'Ожидание подписи…' : 'Начать подписание'}</button>
      {qr?.qrImage && <img src={qr.qrImage} alt="QR" style={{ marginTop: 16, width: 240 }} />}
      {qr?.mobileLink && <p><a href={qr.mobileLink}>Открыть в eGov mobile (если сканируете с того же телефона)</a></p>}
      {signature && (
        <p style={{ wordBreak: 'break-all' }}>
          Подпись получена ({signature.length} символов base64): {signature.slice(0, 80)}...
        </p>
      )}
      {error && <p style={{ color: 'red' }}>Ошибка: {error}</p>}
    </div>
  )
}
