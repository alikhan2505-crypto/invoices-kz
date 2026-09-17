import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, serviceSupabase } from '@/lib/salonSites/adminAuth'
import { generateLandingVariant } from '@/lib/salonSites/generateLanding'
import { parseSalonData } from '@/lib/salonSites/parseSalon'

// Один вызов -- один вариант. Браузер запускает три запроса параллельно и
// показывает варианты по мере готовности; три генерации в одном маршруте
// упирались бы в лимит времени функции.
export const maxDuration = 300

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => null)

  const variantNo = Number(body?.variantNo)
  if (![1, 2, 3].includes(variantNo)) return NextResponse.json({ error: 'bad_variant_no' }, { status: 400 })

  const { data: site } = await serviceSupabase
    .from('salon_sites').select('id, salon, pattern').eq('id', id).single()

  if (!site) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const salon = parseSalonData(site.salon)
  if (!salon) return NextResponse.json({ error: 'bad_salon_data' }, { status: 500 })

  let generated
  try {
    generated = await generateLandingVariant({ salon, patternId: site.pattern, variantNo })
  } catch (e) {
    console.error('salon-sites generate failed', e)
    return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
  }

  // Перегенерация переписывает вариант с тем же номером -- иначе список растёт
  // после каждой попытки, а согласовывать всё равно нужно три штуки.
  const { data, error } = await serviceSupabase
    .from('salon_site_variants')
    .upsert({
      site_id: id,
      variant_no: variantNo,
      direction: generated.direction,
      html: generated.html,
    }, { onConflict: 'site_id,variant_no' })
    .select('id, variant_no, direction, html, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ variant: data })
}
