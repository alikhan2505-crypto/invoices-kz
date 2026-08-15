import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared insert point for the in-app notification bell (distinct from
// sendTelegramNotification -- this is the in-product inbox, Telegram is a
// separate, optional external nudge). Fire-and-forget by convention: a
// failed insert here must never block whatever real action triggered it,
// matching every other best-effort notification call in this codebase.
export async function createNotification(userId: string, title: string, body?: string, link?: string): Promise<void> {
  const { error } = await supabase.from('app_notifications').insert({ user_id: userId, title, body: body ?? null, link: link ?? null })
  if (error) console.error('createNotification failed for user', userId, ':', error.message)
}
