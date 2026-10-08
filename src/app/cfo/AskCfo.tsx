'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useCfo } from './CfoWorkspace'
import { Card, ErrorText, GhostButton, PrimaryButton, SectionTitle, inputClass, inputStyle } from './ui'

const FAMILY_SUGGESTIONS = [
  'Разбери прошлый месяц: на что ушли деньги и где можно сэкономить',
  'Сколько мы можем откладывать в месяц?',
  'Хватит ли денег до следующей зарплаты?',
  'На какие категории мы тратим больше всего?',
]
const SUGGESTIONS = [
  'Разбери прошлый месяц: что выросло, что настораживает, что сделать',
  'На что больше всего уходят деньги за последние 3 месяца?',
  'Хватит ли денег до конца следующего месяца?',
  'Почему прибыль меньше плана?',
]

// «Спроси CFO»: вопрос обычным языком — ответ по цифрам кабинета.
export default function AskCfo() {
  const { pro, ws } = useCfo()
  const suggestions = ws.mode === 'family' ? FAMILY_SUGGESTIONS : SUGGESTIONS
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function ask(q: string) {
    const text = q.trim()
    if (!text || busy) return
    setQuestion(text)
    setBusy(true)
    setError(null)
    setAnswer(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/cfo/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ question: text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Не удалось получить ответ')
      setAnswer(body.answer)
      setLeft(typeof body.left === 'number' ? body.left : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!pro) {
    return (
      <Card>
        <SectionTitle>Спросите CFO</SectionTitle>
        <p className="text-sm" style={{ color: 'var(--nav-text-secondary)' }}>
          Задайте вопрос обычным языком — «почему упала прибыль?», «хватит ли денег до конца месяца?» — и ИИ ответит по цифрам вашего кабинета. Доступно на тарифе Про.
        </p>
        <a href="/upgrade" className="inline-flex items-center min-h-[44px] mt-3 rounded-xl px-4 text-sm font-semibold" style={{ background: 'var(--nav-accent)', color: 'var(--nav-accent-ink)' }}>Перейти на Про</a>
      </Card>
    )
  }

  return (
    <Card dataTour="cfo-ask">
      <SectionTitle>Спросите CFO</SectionTitle>
      <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); void ask(question) }}>
        <input
          className={`${inputClass} flex-1 min-w-[220px]`}
          style={inputStyle}
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Например: почему в сентябре прибыль упала?"
          aria-label="Вопрос финансовому директору"
        />
        <PrimaryButton type="submit" disabled={busy || !question.trim()}>{busy ? 'Думаю…' : 'Спросить'}</PrimaryButton>
      </form>
      {!answer && !busy && (
        <div className="flex gap-2 flex-wrap mt-3">
          {suggestions.map((s) => (
            <GhostButton key={s} type="button" className="!text-xs text-left" onClick={() => void ask(s)}>{s}</GhostButton>
          ))}
        </div>
      )}
      {busy && <p className="text-sm mt-3" style={{ color: 'var(--nav-text-muted)' }}>Смотрю цифры — обычно 10–20 секунд…</p>}
      <div className="mt-3"><ErrorText>{error}</ErrorText></div>
      {answer && (
        <div className="mt-3 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap" style={{ background: 'var(--nav-surface-glass)', color: 'var(--nav-text-primary)' }} aria-live="polite">
          {answer.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '')}
          <div className="text-xs mt-3" style={{ color: 'var(--nav-text-muted)' }}>
            Ответ ИИ по данным кабинета — проверяйте важные решения.{left !== null && ` Осталось вопросов сегодня: ${left}.`}
          </div>
        </div>
      )}
    </Card>
  )
}
