import { NextRequest, NextResponse } from 'next/server'
import { validateTokenViaSmartiMate } from '@/lib/auth'
import { resolveTenantConfig } from '@/lib/tenant-resolver'
import { createHash, randomBytes } from 'crypto'

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
}

function buildTenantOrigin(request: NextRequest, tenant: string) {
  const current = request.nextUrl
  if (current.hostname === 'localhost' || current.hostname.endsWith('.localhost')) {
    return `${current.protocol}//${tenant}.localhost${current.port ? `:${current.port}` : ''}`
  }

  return current.origin
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { target, tenant, accessToken } = body as { target: string; tenant: string; accessToken?: string }

    if (target !== 'smartimate') {
      return NextResponse.json({ error: 'Unsupported target' }, { status: 400 })
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
    }

    // Check if user has active Smart iMATE session via token validation
    if (accessToken) {
      const validation = await validateTokenViaSmartiMate(accessToken, tenant)
      if (validation.valid) {
        // User already has valid session — redirect directly to Smart iMATE dashboard
        const config = await resolveTenantConfig(tenant)
        const dashboardUrl = config?.smartimateAuthorizeUrl?.replace(/\/oauth2?\/authorize$/, '/dashboard') || 'https://smartimate.local/dashboard'
        return NextResponse.json({ redirectUrl: dashboardUrl, sessionActive: true })
      }
    }

    // No active session — start fresh OAuth flow
    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return NextResponse.json({ error: 'Tenant config not found' }, { status: 404 })
    }

    const state = randomBytes(16).toString('base64url')
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    const authUrl = new URL(config.smartimateAuthorizeUrl)
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', `openid,email,profile,tenant:${tenant}`)
    authUrl.searchParams.set('redirect_uri', `${buildTenantOrigin(request, tenant)}/api/auth/callback`)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    const response = NextResponse.json({ redirectUrl: authUrl.toString(), sessionActive: false })
    const isDev = isLocalDevHost(request.nextUrl.hostname)
    response.cookies.set('oauth_state', state, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: !isDev, maxAge: 600,
    })
    response.cookies.set('oauth_code_verifier', codeVerifier, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: !isDev, maxAge: 600,
    })
    response.cookies.set('oauth_tenant', tenant, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: !isDev, maxAge: 600,
    })
    response.cookies.set('oauth_callback_url', '/dashboard', {
      path: '/', httpOnly: true, sameSite: 'lax', secure: !isDev, maxAge: 600,
    })

    return response
  } catch (error) {
    console.error('SSO link error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
