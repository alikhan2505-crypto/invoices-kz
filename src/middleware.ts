import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const protectedRoutes = ['/dashboard', '/history', '/profile', '/invoice', '/onboarding']
const authRoutes = ['/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isProtected = protectedRoutes.some(r => pathname.startsWith(r))
  const isAuthRoute = authRoutes.some(r => pathname.startsWith(r))

  const token = req.cookies.get('sb-terjitbqgrjlqezyydql-auth-token')?.value

  if (isProtected && !token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth).*)'],
}