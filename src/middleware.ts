import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const { data: { session } } = await supabase.auth.getSession()

  const protectedRoutes = [
    '/dashboard',
    '/history',
    '/profile',
    '/invoice',
    '/upgrade',
    '/admin',
    '/onboarding',
  ]

  const isProtected = protectedRoutes.some(route =>
    req.nextUrl.pathname.startsWith(route)
  )

  // Если не авторизован и пытается зайти на защищённую страницу
  if (!session && isProtected) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Если авторизован и пытается зайти на login
  if (session && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/history/:path*',
    '/profile/:path*',
    '/invoice/:path*',
    '/upgrade/:path*',
    '/admin/:path*',
    '/onboarding/:path*',
    '/login',
  ]
}