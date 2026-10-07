import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getActivePlan } from '@/lib/plan'
import { loadWorkspace } from '@/lib/cfo/data'
import { almatyToday } from '@/lib/cfo/digest'
import { ASK_SYSTEM, buildAskContext } from '@/lib/cfo/askContext'

export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const MAX_QUESTION = 500
const DAILY_LIMIT = 30

// «Спроси CFO»: вопрос владельца + выжимка его же кабинета → ответ модели.
// Тариф Про (админам открыт), не больше DAILY_LIMIT вопросов в день на компанию.
export async function POST(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken ? await supabaseAuth.auth.getUser(accessToken) : { data: { user: null } }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return NextResponse.json({ error: 'Напишите вопрос' }, { status: 400 })
  if (question.length > MAX_QUESTION) return NextResponse.json({ error: `Вопрос длиннее ${MAX_QUESTION} символов` }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('is_admin, plan, plan_expires_at, trial_expires_at, bonus_expires_at').eq('id', user.id).single()
  if (!getActivePlan(profile).canCfoPro) return NextResponse.json({ error: '«Спроси CFO» доступен на тарифе Про' }, { status: 403 })

  const { data: company } = await supabase.from('cfo_companies').select('id, ask_day, ask_count').eq('user_id', user.id).maybeSingle()
  if (!company) return NextResponse.json({ error: 'Кабинет CFO ещё не создан' }, { status: 400 })
  const today = almatyToday()
  const used = company.ask_day === today ? company.ask_count : 0
  if (used >= DAILY_LIMIT) return NextResponse.json({ error: `На сегодня лимит ${DAILY_LIMIT} вопросов исчерпан — завтра снова можно` }, { status: 429 })
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ИИ не настроен' }, { status: 500 })
  try {
    const ws = await loadWorkspace(company.id, user.id, supabase)
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-5-5',
      // Модель думает перед ответом: без запаса токенов мысль съедала весь лимит и текста не было.
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      system: ASK_SYSTEM,
      messages: [{ role: 'user', content: `<данные_кабинета>\n${buildAskContext(ws, today)}\n</данные_кабинета>\n\nВопрос владельца: ${question}` }],
    })
    const answer = message.content.filter((b) => b.type === 'text').map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim()
    if (!answer) {
      console.error('api/cfo/ask: empty answer, stop_reason', message.stop_reason, 'blocks', message.content.map((b) => b.type).join(','))
      return NextResponse.json({ error: 'Модель не дала ответа — попробуйте переформулировать вопрос' }, { status: 502 })
    }
    // Считаем только состоявшиеся ответы.
    await supabase.from('cfo_companies').update({ ask_day: today, ask_count: used + 1 }).eq('id', company.id)
    return NextResponse.json({ answer, left: DAILY_LIMIT - used - 1 })
  } catch (e) {
    console.error('api/cfo/ask failed for user', user.id, ':', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Не удалось получить ответ — попробуйте ещё раз' }, { status: 502 })
  }
}
