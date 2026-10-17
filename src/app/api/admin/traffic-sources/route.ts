import { NextRequest } from 'next/server'
import { handleTrafficSources } from '@/lib/visits/sourcesServer'

// Заходы на лендинги и регистрации по источникам для /admin → «Инструменты».
// Только админ — см. src/lib/visits/sourcesServer.ts.
export async function GET(req: NextRequest) {
  return handleTrafficSources(req)
}
