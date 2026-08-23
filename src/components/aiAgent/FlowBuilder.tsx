'use client'
import { useState, useEffect } from 'react'
import TriggerChipsEditor from './TriggerChipsEditor'

const INPUT_CLS = 'w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border border-[color:var(--nav-border)] focus:border-[color:var(--nav-accent)] focus:ring-2 focus:ring-[color:var(--nav-accent-track)]'

interface FlowButtonDraft {
  label: string
  nextStepId: string | null
}

interface FlowStepDraft {
  id: string
  text: string
  buttons: FlowButtonDraft[]
}

interface FlowListItem {
  id: string
  name: string
  triggerWords: string[]
  isStart: boolean
  definition: { steps: FlowStepDraft[] }
}

function newStepId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `step_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function emptyStep(): FlowStepDraft {
  return { id: newStepId(), text: '', buttons: [] }
}

export default function FlowBuilder({ agentId, authHeader }: { agentId: string; authHeader: () => Promise<Record<string, string>> }) {
  const [flows, setFlows] = useState<FlowListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftTriggerWords, setDraftTriggerWords] = useState<string[]>([])
  const [draftIsStart, setDraftIsStart] = useState(false)
  const [draftSteps, setDraftSteps] = useState<FlowStepDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const headers = await authHeader()
    const res = await fetch(`/api/ai-agent/flows?agentId=${encodeURIComponent(agentId)}`, { headers })
    if (res.ok) {
      const data = await res.json()
      setFlows(Array.isArray(data.flows) ? data.flows : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [agentId])

  function startNew() {
    setEditingId('new')
    setDraftName('')
    setDraftTriggerWords([])
    setDraftIsStart(false)
    setDraftSteps([emptyStep()])
    setError(null)
  }

  function startEdit(flow: FlowListItem) {
    setEditingId(flow.id)
    setDraftName(flow.name)
    setDraftTriggerWords(flow.triggerWords)
    setDraftIsStart(flow.isStart)
    setDraftSteps(flow.definition.steps.length > 0 ? flow.definition.steps : [emptyStep()])
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function addStep() {
    setDraftSteps(prev => [...prev, emptyStep()])
  }

  function removeStep(stepId: string) {
    setDraftSteps(prev => prev
      .filter(s => s.id !== stepId)
      // Any button on a REMAINING step that pointed at the removed step
      // falls back to "Конец сценария" -- never leave a dangling reference.
      .map(s => ({ ...s, buttons: s.buttons.map(b => b.nextStepId === stepId ? { ...b, nextStepId: null } : b) })))
  }

  function updateStepText(stepId: string, text: string) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, text } : s))
  }

  function addButton(stepId: string) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, buttons: [...s.buttons, { label: '', nextStepId: null }] } : s))
  }

  function updateButton(stepId: string, index: number, patch: Partial<FlowButtonDraft>) {
    setDraftSteps(prev => prev.map(s => s.id === stepId
      ? { ...s, buttons: s.buttons.map((b, i) => i === index ? { ...b, ...patch } : b) }
      : s))
  }

  function removeButton(stepId: string, index: number) {
    setDraftSteps(prev => prev.map(s => s.id === stepId ? { ...s, buttons: s.buttons.filter((_, i) => i !== index) } : s))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const headers = await authHeader()
    const res = await fetch('/api/ai-agent/flows', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(editingId && editingId !== 'new' ? { id: editingId } : { agentId }),
        name: draftName,
        triggerWords: draftTriggerWords,
        isStart: draftIsStart,
        definition: { steps: draftSteps },
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      setError(data?.error === 'invalid definition' ? 'Проверьте шаги — у каждого должен быть текст, у каждой кнопки — название' : 'Не удалось сохранить сценарий')
      return
    }
    setEditingId(null)
    load()
  }

  async function removeFlow(id: string) {
    if (!confirm('Удалить сценарий?')) return
    const headers = await authHeader()
    await fetch('/api/ai-agent/flows', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
    load()
  }

  if (loading) return <div className="text-sm" style={{ color: 'var(--nav-text-muted)' }}>Загрузка…</div>

  if (editingId) {
    return (
      <div>
        <button onClick={cancelEdit} className="text-xs mb-3" style={{ color: 'var(--nav-accent)' }}>← Назад к списку</button>

        <div className="nav-glass nav-card-accent rounded-2xl p-4 mb-3">
          <span className="text-xs mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Название сценария</span>
          <input value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={60}
            placeholder="Например: Главное меню"
            className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)' }} />

          <span className="text-xs mt-3 mb-1.5 block" style={{ color: 'var(--nav-text-secondary)' }}>Триггерные слова (запускают сценарий, если клиент напишет одно из них)</span>
          <TriggerChipsEditor words={draftTriggerWords} onChange={setDraftTriggerWords} />

          <label className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--nav-text-secondary)' }}>
            <input type="checkbox" checked={draftIsStart} onChange={e => setDraftIsStart(e.target.checked)} />
            Запускать по команде /start (главный сценарий — только один на агента)
          </label>
        </div>

        <div className="space-y-3">
          {draftSteps.map((step, stepIndex) => (
            <div key={step.id} className="nav-glass nav-card-accent rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold" style={{ color: 'var(--nav-text-secondary)' }}>Шаг {stepIndex + 1}</span>
                {draftSteps.length > 1 && (
                  <button onClick={() => removeStep(step.id)} className="text-xs" style={{ color: 'var(--nav-critical)' }}>Удалить шаг</button>
                )}
              </div>
              <textarea value={step.text} onChange={e => updateStepText(step.id, e.target.value)}
                maxLength={2000} placeholder="Текст сообщения на этом шаге"
                className={`${INPUT_CLS} min-h-[70px]`} style={{ color: 'var(--nav-text-primary)' }} />

              <div className="mt-3 space-y-2">
                {step.buttons.map((button, buttonIndex) => (
                  <div key={buttonIndex} className="flex gap-2 items-center">
                    <input value={button.label} onChange={e => updateButton(step.id, buttonIndex, { label: e.target.value })}
                      maxLength={60} placeholder="Текст кнопки"
                      className={`${INPUT_CLS} flex-1`} style={{ color: 'var(--nav-text-primary)' }} />
                    <select value={button.nextStepId ?? ''} onChange={e => updateButton(step.id, buttonIndex, { nextStepId: e.target.value || null })}
                      className={INPUT_CLS} style={{ color: 'var(--nav-text-primary)', background: 'var(--nav-surface-chrome)', width: '180px' }}>
                      <option value="">Конец сценария</option>
                      {draftSteps.filter(s => s.id !== step.id).map(s => (
                        <option key={s.id} value={s.id}>Шаг {draftSteps.indexOf(s) + 1}{s.text ? `: ${s.text.slice(0, 20)}` : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => removeButton(step.id, buttonIndex)} aria-label="Удалить кнопку"
                      className="text-sm px-2" style={{ color: 'var(--nav-text-muted)' }}>✕</button>
                  </div>
                ))}
              </div>
              {step.buttons.length < 8 && (
                <button onClick={() => addButton(step.id)}
                  className="text-xs mt-2" style={{ color: 'var(--nav-accent)' }}>+ Добавить кнопку</button>
              )}
            </div>
          ))}
        </div>

        {draftSteps.length < 30 && (
          <button onClick={addStep}
            className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
            style={{ color: 'var(--nav-accent)' }}>
            + Добавить шаг
          </button>
        )}

        {error && <div className="text-xs mt-2" style={{ color: 'var(--nav-critical)' }}>{error}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={saving || !draftName.trim() || draftTriggerWords.length === 0 || draftSteps.some(s => !s.text.trim())}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>
            {saving ? 'Сохраняем…' : 'Сохранить сценарий'}
          </button>
          <button onClick={cancelEdit} disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: 'var(--nav-bg)', color: 'var(--nav-text-secondary)' }}>
            Отмена
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: 'var(--nav-text-muted)' }}>
        Сценарии отвечают мгновенно и бесплатно, как шаблоны — но ведут клиента по заранее прописанным шагам с кнопками, без ИИ.
      </p>

      {flows.length === 0 && (
        <div className="nav-glass nav-card-accent rounded-2xl p-5 text-sm text-center mb-3" style={{ color: 'var(--nav-text-muted)' }}>
          Сценариев пока нет.
        </div>
      )}

      <div className="space-y-3">
        {flows.map(flow => (
          <div key={flow.id} className="nav-glass nav-card-accent rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--nav-text-primary)' }}>{flow.name}</span>
                  {flow.isStart && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Главный</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {flow.triggerWords.map(w => (
                    <span key={w} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--nav-bg)', color: 'var(--nav-accent)' }}>{w}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => startEdit(flow)} className="text-xs px-2 py-1" style={{ color: 'var(--nav-accent)' }}>Изменить</button>
                <button onClick={() => removeFlow(flow.id)} className="text-xs px-2 py-1" style={{ color: 'var(--nav-critical)' }}>Удалить</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={startNew}
        className="w-full nav-glass rounded-2xl px-4 py-3 text-sm font-medium mt-3 transition-transform hover:-translate-y-0.5"
        style={{ color: 'var(--nav-accent)' }}>
        + Новый сценарий
      </button>
    </div>
  )
}
