'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const TONE_OPTIONS = [
  { value: 'friendly', label: 'Дружелюбный и тёплый' },
  { value: 'professional', label: 'Профессиональный и деловой' },
  { value: 'energetic', label: 'Мотивирующий и энергичный' },
  { value: 'caring', label: 'Заботливый и внимательный' },
]

const GOAL_OPTIONS = [
  { value: 'answer_questions', label: 'Отвечать на вопросы' },
  { value: 'qualify_lead', label: 'Квалифицировать заявку' },
]

export default function AiAgentSettings() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [tone, setTone] = useState('friendly')
  const [businessDescription, setBusinessDescription] = useState('')
  const [goal, setGoal] = useState('answer_questions')
  const [collectName, setCollectName] = useState(true)
  const [collectPhone, setCollectPhone] = useState(true)
  const [agentId, setAgentId] = useState<string | null>(null)
  const [connections, setConnections] = useState<{ channel: string; external_account_name: string | null; status: string }[]>([])
  const [connecting, setConnecting] = useState(false)
  const [oauthNotice, setOauthNotice] = useState<'connected' | 'error' | null>(null)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  useEffect(() => {
    // The Instagram OAuth callback redirects back here with a plain query
    // flag (no Authorization header exists on that server-side redirect to
    // report anything richer) -- read it once client-side and strip it from
    // the URL so a page refresh doesn't keep re-showing the notice.
    const params = new URLSearchParams(window.location.search)
    if (params.has('instagram_connected')) setOauthNotice('connected')
    else if (params.has('instagram_error')) setOauthNotice('error')
    if (params.has('instagram_connected') || params.has('instagram_error')) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const headers = await authHeader()
      const res = await fetch('/api/ai-agent/settings', { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.agent) {
          setAgentId(data.agent.id)
          setName(data.agent.name)
          setTone(data.agent.tone)
          setBusinessDescription(data.agent.businessDescription)
          setGoal(data.agent.goal)
          setCollectName(data.agent.collectName)
          setCollectPhone(data.agent.collectPhone)
        } else {
          setName(data.suggestedName || 'Ассистент')
        }
        setConnections(data.connections || [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  async function save() {
    setSaving(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/settings', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, tone, businessDescription, goal, collectName, collectPhone }),
    })
    if (res.ok) {
      const data = await res.json()
      setAgentId(data.agent.id)
    }
    setSaving(false)
  }

  async function connectInstagram() {
    setConnecting(true)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/instagram/connect', { headers })
    if (res.ok) {
      const data = await res.json()
      window.location.href = data.authorizeUrl
    } else {
      setConnecting(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Загрузка…</div>

  const instagramConnection = connections.find(c => c.channel === 'instagram')

  return (
    <div className="max-w-xl mx-auto pt-16 px-6 pb-24">
      <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3">
        <span className="text-lg leading-none">‹</span> Назад
      </button>
      <h1 className="text-xl font-bold text-[#1C2056] mb-1">AI-агент</h1>
      <p className="text-sm text-gray-500 mb-6">Настройте ассистента, который отвечает вашим клиентам в Instagram</p>

      {oauthNotice === 'connected' && (
        <div className="bg-[#E2F7EE] text-[#00A468] rounded-lg px-3 py-2 text-sm mb-4">✓ Instagram подключён</div>
      )}
      {oauthNotice === 'error' && (
        <div className="bg-red-50 text-red-600 rounded-lg px-3 py-2 text-sm mb-4">
          Не удалось подключить Instagram. Попробуйте ещё раз — если не получится снова, напишите в поддержку.
        </div>
      )}

      <label className="block mb-4">
        <span className="text-xs text-gray-500 mb-1 block">Название компании</span>
        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} />
      </label>

      <div className="mb-4">
        <span className="text-xs text-gray-500 mb-2 block">Формат общения</span>
        <div className="grid grid-cols-2 gap-2">
          {TONE_OPTIONS.map(t => (
            <button key={t.value} onClick={() => setTone(t.value)}
              className={`text-xs px-3 py-2 rounded-lg text-left ${tone === t.value ? 'bg-[#1C2056] text-white' : 'bg-gray-50 text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block mb-4">
        <span className="text-xs text-gray-500 mb-1 block">О бизнесе</span>
        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[100px]"
          placeholder="Опишите подробнее что вы продаёте и как работаете"
          value={businessDescription} onChange={e => setBusinessDescription(e.target.value)} />
      </label>

      <div className="mb-4">
        <span className="text-xs text-gray-500 mb-2 block">Основная цель</span>
        <div className="grid grid-cols-2 gap-2">
          {GOAL_OPTIONS.map(g => (
            <button key={g.value} onClick={() => setGoal(g.value)}
              className={`text-xs px-3 py-2 rounded-lg ${goal === g.value ? 'bg-[#1C2056] text-white' : 'bg-gray-50 text-gray-600'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <span className="text-xs text-gray-500 mb-2 block">Что собирать у клиента</span>
        <label className="flex items-center gap-2 text-sm mb-1">
          <input type="checkbox" checked={collectName} onChange={e => setCollectName(e.target.checked)} /> Имя
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={collectPhone} onChange={e => setCollectPhone(e.target.checked)} /> Телефон
        </label>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full bg-[#1C2056] text-white rounded-lg px-4 py-3 text-sm font-medium mb-4">
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>

      {agentId && (
        <div className="border-t border-gray-100 pt-4">
          <span className="text-xs text-gray-500 mb-2 block">Instagram</span>
          {instagramConnection?.status === 'active' && (
            <>
              <div className="text-sm text-[#00A468] mb-3">✓ Подключено: {instagramConnection.external_account_name || instagramConnection.channel}</div>
              <Link href="/ai-agent/review"
                className="block text-center bg-gray-50 hover:bg-gray-100 text-[#1C2056] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors">
                Диалоги на проверке →
              </Link>
            </>
          )}
          {instagramConnection?.status === 'token_expired' && (
            // Same sessionExpired-style reconnect banner this codebase
            // already uses in Kaspi Shop -- set by Task 8/9's 401 handling,
            // not guessed at here. Reconnecting reuses the same OAuth flow;
            // Task 7's callback upserts on (channel, external_account_id)
            // and always writes status: 'active', so a successful
            // reconnect clears this automatically.
            <div className="bg-red-50 rounded-lg p-3 mb-2">
              <div className="text-sm text-red-600 mb-2">⚠️ Instagram отключился — переподключите аккаунт, чтобы агент снова отвечал</div>
              <button onClick={connectInstagram} disabled={connecting}
                className="w-full bg-white border border-red-200 text-red-600 rounded-lg px-4 py-2 text-sm font-medium">
                {connecting ? 'Открываем Instagram…' : 'Переподключить Instagram'}
              </button>
            </div>
          )}
          {!instagramConnection && (
            <button onClick={connectInstagram} disabled={connecting}
              className="w-full bg-white border border-gray-200 text-[#1C2056] rounded-lg px-4 py-3 text-sm font-medium">
              {connecting ? 'Открываем Instagram…' : 'Подключить Instagram'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
