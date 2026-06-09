import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') || ''

  // Extract tenant from subdomain
  // e.g. daoanhta.localhost:3000 → tenant = "daoanhta"
  const parts = hostname.split('.')
  const tenantCandidate = parts.length > 2 ? parts[0] : request.cookies.get('datamaster_tenant')?.value || ''
  const tenant = /^[a-zA-Z0-9_-]{1,50}$/.test(tenantCandidate) ? tenantCandidate : ''

  // Validate session cookie
  const sessionCookie = request.cookies.get('session')?.value
  let isLoggedIn = false

  if (sessionCookie) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
      await jwtVerify(sessionCookie, secret)
      isLoggedIn = true
    } catch {
      isLoggedIn = false
    }
  }

  // Public routes (always accessible)
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Auth routes + server-to-server tenant sync routes (always accessible).
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/admin') ||
    pathname === '/api/oauth/register-provider' ||
    pathname.startsWith('/auth') ||
    pathname === '/api/test-db'
  ) {
    return NextResponse.next()
  }

  // Static assets
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next()
  }

  // Protected routes - redirect to signin if no session
  if (!isLoggedIn) {
    if (!tenant) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    const signinUrl = new URL('/api/auth/signin', request.url)
    signinUrl.searchParams.set('tenant', tenant)
    signinUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signinUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
