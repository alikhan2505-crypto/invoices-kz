import { NextRequest, NextResponse } from 'next/server'

const protectedRoutes = ['/dashboard', '/history', '/profile', '/invoice', '/onboarding']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Пропускаем auth маршруты всегда
  if (pathname.startsWith('/auth')) return NextResponse.next()
  if (pathname.startsWith('/login')) return NextResponse.next()
  if (pathname.startsWith('/api')) return NextResponse.next()

  const isProtected = protectedRoutes.some(r => pathname.startsWith(r))
  if (!isProtected) return NextResponse.next()

  // Проверяем куки сессии
  const hasCookie = req.cookies.getAll().some(c => c.name.includes('supabase') || c.name.includes('sb-'))

  if (!hasCookie) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}