import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantConfig } from '@/lib/tenant-resolver'
import { randomBytes, createHash } from 'crypto'

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tenant = searchParams.get('tenant')
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  if (!tenant) {
    return Response.json({ error: 'Missing tenant parameter' }, { status: 400 })
  }

  // Validate tenant format
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
    return Response.json({ error: 'Invalid tenant format' }, { status: 400 })
  }

  // Validate callback URL (prevent open redirect)
  if (!callbackUrl.startsWith('/')) {
    return Response.json({ error: 'Invalid callback URL' }, { status: 400 })
  }

  const tenantOrigin = buildTenantOrigin(request, tenant)
  if (request.nextUrl.origin !== tenantOrigin) {
    const tenantSigninUrl = new URL(request.nextUrl.pathname, tenantOrigin)
    tenantSigninUrl.searchParams.set('tenant', tenant)
    tenantSigninUrl.searchParams.set('callbackUrl', callbackUrl)
    return NextResponse.redirect(tenantSigninUrl)
  }

  try {
    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Generate PKCE code verifier and challenge
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')
    const state = `${tenant}.${randomBytes(16).toString('base64url')}`

    // DataMaster owns the Cognito app client and starts Cognito auth directly.
    const authUrl = new URL(config.cognitoAuthorizeUrl)
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'openid email profile')
    authUrl.searchParams.set('redirect_uri', `${tenantOrigin}/api/auth/callback`)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    // Store state and code_verifier in cookie for callback validation
    const isDev = isLocalDevHost(request.nextUrl.hostname)
    const response = NextResponse.redirect(authUrl.toString())
    response.cookies.set('oauth_state', state, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })
    response.cookies.set('oauth_code_verifier', codeVerifier, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })
    response.cookies.set('oauth_tenant', tenant, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })
    response.cookies.set('oauth_callback_url', callbackUrl, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })

    return response
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Sign in error:', { tenant, error: errorMsg, stack: errorStack })
    return Response.json({ error: 'Internal server error', details: errorMsg }, { status: 500 })
  }
}
