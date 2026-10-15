import { NextRequest } from 'next/server'
import { handleToolFunnel } from '@/lib/toolEvents/funnelServer'

// Воронка бесплатных инструментов для /admin → «Инструменты».
// Только админ — см. src/lib/toolEvents/funnelServer.ts.
export async function GET(req: NextRequest) {
  return handleToolFunnel(req)
}
