import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { productHostRewrite, apexToApiRedirect } from '@/lib/hostRouting'

// Next 16 переименовал middleware в proxy -- см.
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md

const BASE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN || 'invoices.kz'

// Занятые поддомены платформы: на них лендинг салона не отдаём, даже если
// кто-то заведёт строку с таким slug мимо проверок. Тот же список, что и
// constraint salon_sites_slug_reserved в supabase/migrations/salon_sites.sql --
// оба места решают один вопрос ("что зарезервировано"), и если бы списки
// разошлись, один бы тихо пропускал то, что другой уже отсёк на входе.
const PLATFORM_SUBDOMAINS = new Set(['www', 'api', 'app', 'admin', 'mail', 'smtp', 'ftp', 'cdn', 'static', 'invoices', 'shop', 'pay'])

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get('host') || '').split(':')[0].toLowerCase()

  const apexRedirect = apexToApiRedirect(hostname, request.nextUrl.pathname, BASE_DOMAIN, process.env.API_HOST_REDIRECT === '1')
  if (apexRedirect) return NextResponse.redirect(apexRedirect, 301)

  const suffix = `.${BASE_DOMAIN}`
  if (!hostname.endsWith(suffix)) return NextResponse.next()

  const productPath = productHostRewrite(hostname, request.nextUrl.pathname, BASE_DOMAIN)
  if (productPath) {
    const url = request.nextUrl.clone()
    url.pathname = productPath
    return NextResponse.rewrite(url)
  }

  const slug = hostname.slice(0, -suffix.length)
  if (!slug || slug.includes('.') || PLATFORM_SUBDOMAINS.has(slug)) return NextResponse.next()

  // Лендинг -- один самодостаточный документ без собственных файлов, поэтому
  // перенаправляем только корень: остальные пути на поддомене пусть работают
  // как обычно (или отдают 404), вместо того чтобы все показывать лендинг.
  if (request.nextUrl.pathname !== '/') return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = `/s/${slug}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
