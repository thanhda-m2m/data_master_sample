import {NextResponse} from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  const expiredCookie = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 0,
  }

  response.cookies.set('session', '', expiredCookie)
  response.cookies.set('datamaster_tenant', '', expiredCookie)

  return response
}
