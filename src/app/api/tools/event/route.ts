import { NextRequest } from 'next/server'
import { handleToolEvent } from '@/lib/toolEvents/server'

// Своя аналитика бесплатных инструментов: одна строка в public.tool_events
// на событие. Публичный, всегда 204 — см. src/lib/toolEvents/server.ts.
export async function POST(req: NextRequest) {
  return handleToolEvent(req)
}
