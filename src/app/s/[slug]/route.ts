import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// HTML лендинга написан моделью, а отдаётся он с поддомена invoices.kz. Этот
// CSP -- и есть граница безопасности: скрипты запрещены полностью, так что
// даже пропущенный санитайзером тег ничего не выполнит. Разметку страницы
// дополнительно чистит sanitizeLandingHtml при генерации.
const CSP = [
  "default-src 'none'",
  "img-src 'self' data: https:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const { data } = await supabase
    .from('salon_sites')
    .select('published_html')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!data?.published_html) {
    return new Response('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Сайт не найден</title></head><body><h1>Сайт не найден</h1></body></html>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  return new Response(data.published_html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cache-control': 'public, max-age=60, s-maxage=300',
    },
  })
}
