'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/LoadingSpinner'
import { backLabel } from '@/lib/a11yLabels'

type Template = { id: string; trigger_words: string[]; reply_text: string; channel: 'dm' | 'comment' | null }
type LogEntry = {
  id: string
  source: string
  from_username: string | null
  incoming_text: string
  reply_text: string | null
  reply_type: string
  status: string
  created_at: string
}

export default function InstagramReplies() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [newWords, setNewWords] = useState('')
  const [newReply, setNewReply] = useState('')
  const [newChannel, setNewChannel] = useState<'both' | 'dm' | 'comment'>('both')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
  }

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
    if (!profile?.is_admin) { router.push('/dashboard'); return }

    const headers = await authHeader()
    const [templatesRes, settingsRes, logRes] = await Promise.all([
      fetch('/api/instagram/replies/templates', { headers }),
      fetch('/api/instagram/replies/settings', { headers }),
      fetch('/api/instagram/replies/log', { headers }),
    ])
    const templatesData = await templatesRes.json()
    const settingsData = await settingsRes.json()
    const logData = await logRes.json()
    setTemplates(templatesData.templates || [])
    setPaused(settingsData.paused || false)
    setLog(logData.log || [])
    setLoading(false)
  }

  async function togglePause() {
    const next = !paused
    setPaused(next)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/settings', { method: 'POST', headers, body: JSON.stringify({ paused: next }) })
  }

  async function addTemplate() {
    const words = newWords.split(',').map(w => w.trim()).filter(Boolean)
    if (words.length === 0 || !newReply) return
    setSaving(true)
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', {
      method: 'POST', headers,
      body: JSON.stringify({ trigger_words: words, reply_text: newReply, channel: newChannel === 'both' ? null : newChannel }),
    })
    setNewWords('')
    setNewReply('')
    setNewChannel('both')
    setSaving(false)
    load()
  }

  async function deleteTemplate(id: string) {
    const headers = await authHeader()
    await fetch('/api/instagram/replies/templates', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return <LoadingSpinner />

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/profile')} className="back-btn text-gray-400 text-xl" aria-label={backLabel('ru')}>‹</button>
        <span className="font-semibold text-[#1C2056]">Автоответы Instagram</span>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[#1C2056]">Пауза автоответов</div>
            <div className="text-xs text-gray-400">Останавливает и шаблоны, и AI-черновики</div>
          </div>
          <button onClick={togglePause}
            className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${paused ? 'bg-red-500' : 'bg-gray-200'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${paused ? 'left-7' : 'left-1'}`}></span>
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-3">Шаблоны</div>
          <div className="space-y-2 mb-3">
            {templates.map(t => (
              <div key={t.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-400">{t.trigger_words.join(', ')}</span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {t.channel === 'dm' ? 'Только DM' : t.channel === 'comment' ? 'Только комментарии' : 'DM + комментарии'}
                  </span>
                </div>
                <div className="text-sm text-gray-700 mb-2">{t.reply_text}</div>
                <button onClick={() => deleteTemplate(t.id)} className="text-xs text-red-500">Удалить</button>
              </div>
            ))}
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Триггер-слова через запятую"
            value={newWords} onChange={e => setNewWords(e.target.value)} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm mb-2" placeholder="Текст ответа" rows={2}
            value={newReply} onChange={e => setNewReply(e.target.value)} />
          <div className="flex gap-2 mb-2">
            {([['both', 'DM + комментарии'], ['dm', 'Только DM'], ['comment', 'Только комментарии']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setNewChannel(val)}
                className={`flex-1 text-xs rounded-lg py-2 border ${newChannel === val ? 'bg-[#1C2056] text-white border-[#1C2056]' : 'bg-white text-gray-500 border-gray-200'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={addTemplate} disabled={saving}
            className="w-full bg-[#1C2056] text-white rounded-xl py-2.5 text-sm font-medium">
            {saving ? 'Сохраняем...' : 'Добавить шаблон'}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="text-sm font-medium text-[#1C2056] mb-3">Журнал (последние 50)</div>
          <div className="space-y-2">
            {log.map(entry => (
              <div key={entry.id} className="border border-gray-100 rounded-xl p-3 text-xs">
                <div className="text-gray-400 mb-1">{entry.from_username} · {entry.source} · {entry.status}</div>
                <div className="text-gray-700 mb-1">→ {entry.incoming_text}</div>
                {entry.reply_text && <div className="text-gray-500">← {entry.reply_text}</div>}
              </div>
            ))}
            {log.length === 0 && <div className="text-xs text-gray-400">Пока пусто</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
