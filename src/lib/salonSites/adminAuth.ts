import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Генератор сайтов целиком админский: таблицы salon_sites закрыты RLS без
// политик, и единственный путь к ним -- служебная роль в этих маршрутах.
// Один помощник на все маршруты вместо копии проверки в каждом.
export async function requireAdmin(req: NextRequest): Promise<{ userId: string } | { error: string; status: number }> {
  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '')
  const { data: { user } } = accessToken
    ? await supabaseAuth.auth.getUser(accessToken)
    : { data: { user: null } }

  if (!user) return { error: 'Unauthorized', status: 401 }

  const { data: profile } = await serviceSupabase
    .from('profiles').select('is_admin').eq('id', user.id).single()

  if (!profile?.is_admin) return { error: 'admin_only', status: 403 }

  return { userId: user.id }
}
