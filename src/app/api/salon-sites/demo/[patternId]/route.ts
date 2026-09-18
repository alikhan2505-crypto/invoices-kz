import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { requireAdmin } from '@/lib/salonSites/adminAuth'
import { findPattern } from '@/lib/salonSites/patterns'

// Статичное демо на паттерн -- сгенерировано один раз заранее (см.
// scripts/generate-pattern-demos.ts, не входит в сборку) и лежит в
// public/pattern-demos/<id>.html, а не генерируется по клику: иначе каждый
// клик по паттерну в форме стоил бы полноценного вызова Opus, просто чтобы
// посмотреть на стиль. Файл читаем и отдаём как есть -- он уже прошёл
// sanitizeLandingHtml внутри generateLandingVariant при генерации.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ patternId: string }> }
) {
  const auth = await requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { patternId } = await params
  if (!findPattern(patternId)) return NextResponse.json({ error: 'unknown_pattern' }, { status: 400 })

  try {
    const html = await readFile(path.join(process.cwd(), 'public', 'pattern-demos', `${patternId}.html`), 'utf-8')
    return NextResponse.json({ html })
  } catch {
    return NextResponse.json({ error: 'demo_not_generated' }, { status: 404 })
  }
}
