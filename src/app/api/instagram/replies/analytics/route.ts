import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function requireAdmin(req: NextRequest) {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// Which templates actually get used, and how often incoming messages fall
// through to AI instead -- helps the admin see what's missing a template.
// Rollups computed in JS off a bounded fetch (Supabase's REST client has no
// server-side GROUP BY), matching the pattern already used by
// /api/kaspi/dashboard for the same reason -- current volume here is far
// below the 2000-row window.
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: replies } = await supabase
    .from('instagram_auto_replies')
    .select('reply_type, template_id, status, is_urgent')
    .order('created_at', { ascending: false })
    .limit(2000)

  const { data: templates } = await supabase
    .from('instagram_reply_templates')
    .select('id, trigger_words, channel')

  const all = replies || []
  const templateHits = all.filter(r => r.reply_type === 'template')
  const aiDrafts = all.filter(r => r.reply_type === 'ai')

  const usageByTemplate = new Map<string, number>()
  for (const r of templateHits) {
    if (!r.template_id) continue
    usageByTemplate.set(r.template_id, (usageByTemplate.get(r.template_id) || 0) + 1)
  }

  const templateUsage = (templates || [])
    .map(t => ({
      id: t.id,
      triggerWords: t.trigger_words as string[],
      channel: t.channel as 'dm' | 'comment' | null,
      count: usageByTemplate.get(t.id) || 0,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    totalHandled: all.length,
    templateMatchCount: templateHits.length,
    aiDraftCount: aiDrafts.length,
    aiSentCount: aiDrafts.filter(r => r.status === 'sent_after_review').length,
    aiSkippedCount: aiDrafts.filter(r => r.status === 'skipped').length,
    urgentCount: all.filter(r => r.is_urgent).length,
    templateUsage,
  })
}
