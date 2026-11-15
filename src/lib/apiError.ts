// Ответ 500 без утечки внутренностей (аудит 14.11.2026). Сырой error.message из Supabase или
// сторонних клиентов несёт имена таблиц, колонок и ограничений: клиенту он не нужен, а
// злоумышленнику помогает. Подробность остаётся в логах сервера, наружу идёт общий текст.

import { NextResponse } from 'next/server'

export const GENERIC_SERVER_ERROR = 'Внутренняя ошибка сервера, попробуйте ещё раз'

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message)
  return String(err)
}

/** Логирует причину на сервере и отдаёт клиенту только общий текст. */
export function serverError(scope: string, err: unknown, status = 500): NextResponse {
  console.error(`${scope}: ${messageOf(err)}`)
  return NextResponse.json({ error: GENERIC_SERVER_ERROR }, { status })
}
