import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isCronAuthorized } from '@/lib/cronAuth'
import { syncRehabilitation } from '@/lib/kgdRehabilitationSync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// КГД отвечает на полный список за ~17 секунд, плюс второй список и запись.
export const maxDuration = 60

// Суточная выгрузка списка КГД «реабилитационная процедура» в таблицу
// kgd_rehabilitation_debtors (02:00 UTC = 07:00 в Алматы, vercel.json). Проверка
// контрагента по БИН читает эту таблицу: у КГД нет поиска по БИН.
//
// Пока основатель не применил supabase/migrations/kgd_rehabilitation_debtors.sql,
// крон ничего не делает и отвечает reason: table_missing (без запросов к КГД).
//
// ?dry=1 (с тем же CRON_SECRET): скачать, разобрать и склеить, но в базу не
// писать; ответ с числами. Ни в ответе, ни в логах нет БИН и названий.
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get('dry') === '1'
  const result = await syncRehabilitation(supabase, { dry })
  console.log('kgd-rehabilitation:', JSON.stringify(result))
  // До миграции это штатное «пока выключено», не сбой крона.
  if (!result.ok && result.reason === 'table_missing') return NextResponse.json(result)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
