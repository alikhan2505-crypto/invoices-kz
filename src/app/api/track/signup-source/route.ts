import { NextRequest } from 'next/server'
import { handleSignupSource } from '@/lib/visits/server'

// Источник первого касания новой регистрации (car_exact / car_likely / … /
// unknown) — одна строка в public.signup_sources. Зовёт /auth/callback при
// первой настройке аккаунта. Всегда 204 — см. src/lib/visits/server.ts.
export async function POST(req: NextRequest) {
  return handleSignupSource(req)
}
