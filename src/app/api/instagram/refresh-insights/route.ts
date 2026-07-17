import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMediaInsights } from '@/lib/instagram'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Pulls fresh reach/likes/comments/saved/shares for every published post and
// stores them on its draft row, so Claude can look at what performed best
// before generating the next batch of content.
export async function POST(req: NextRequest) {
  const internalSecret = req.headers.get('x-internal-secret')
  if (!internalSecret || internalSecret !== process.env.IG_AUTOMATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: published } = await supabase
    .from('instagram_drafts')
    .select('id, ig_media_id, caption')
    .eq('status', 'published')
    .not('ig_media_id', 'is', null)

  const results = []
  for (const draft of published || []) {
    try {
      const insights = await getMediaInsights(draft.ig_media_id)
      await supabase
        .from('instagram_drafts')
        .update({ ...insights, insights_updated_at: new Date().toISOString() })
        .eq('id', draft.id)
      results.push({ id: draft.id, caption: draft.caption.slice(0, 60), ...insights })
    } catch (err: any) {
      results.push({ id: draft.id, error: err.message })
    }
  }

  return NextResponse.json({ ok: true, results })
}
