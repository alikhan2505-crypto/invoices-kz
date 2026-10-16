import { NextRequest } from 'next/server'
import { handleVisit } from '@/lib/visits/server'

// Счётчик заходов на публичные страницы (отчёт «Машина/QR»): одна строка в
// public.site_visits на загрузку страницы. Публичный, всегда 204 — см.
// src/lib/visits/server.ts. Ни IP, ни UA, ни email не сохраняются.
export async function POST(req: NextRequest) {
  return handleVisit(req)
}
