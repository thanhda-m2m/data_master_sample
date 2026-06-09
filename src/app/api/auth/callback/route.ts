import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantConfig } from '@/lib/tenant-resolver'
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const providerError = searchParams.get('error')
  const providerErrorDescription = searchParams.get('error_description')

  if (providerError) {
    const errorUrl = new URL('/auth/error', request.nextUrl.origin)
    errorUrl.searchParams.set('error', providerError)
    if (providerErrorDescription) {
      errorUrl.searchParams.set('error_description', providerErrorDescription)
    }
    return Response.redirect(errorUrl)
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get('oauth_state')?.value
  const codeVerifier = cookieStore.get('oauth_code_verifier')?.value
  const tenant = cookieStore.get('oauth_tenant')?.value
  const callbackUrl = cookieStore.get('oauth_callback_url')?.value || '/'

  // Validate state
  if (!code || !state || state !== storedState || !tenant || !codeVerifier) {
    return Response.redirect(`${request.nextUrl.origin}/auth/error?error=invalid_state`)
  }

  try {
    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=tenant_not_found`)
    }

    // Exchange code for tokens directly with the tenant Cognito app client.
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
      code_verifier: codeVerifier,
    })
    if (config.clientSecret) {
      tokenParams.set('client_secret', config.clientSecret)
    }

    const tokenResponse = await fetch(config.cognitoTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Token exchange failed:', { tenant, error })
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=token_exchange_failed`)
    }

    // Cognito returns: { access_token, refresh_token, id_token, token_type, expires_in }
    const tokens = await tokenResponse.json()

    if (!tokens.id_token || !config.jwksUri || !config.issuer) {
      console.error('Token validation missing required Cognito config:', { tenant })
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=token_validation_failed`)
    }

    const jwks = createRemoteJWKSet(new URL(config.jwksUri))
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: config.issuer,
      audience: config.clientId,
    })
    const userName =
      (payload.name as string) ||
      (payload.preferred_username as string) ||
      `${payload.given_name || ''} ${payload.family_name || ''}`.trim() ||
      (payload.email as string) ||
      'Unknown User'

    // Create session JWT
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    const sessionToken = await new SignJWT({
      sub: payload.sub,
      email: payload.email,
      name: userName,
      tenant,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    // Set session cookie and clear OAuth cookies
    const isDev = isLocalDevHost(request.nextUrl.hostname)
    const response = NextResponse.redirect(`${request.nextUrl.origin}${callbackUrl}`)
    response.cookies.set('session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 2592000,
    })
    response.cookies.delete('oauth_state')
    response.cookies.delete('oauth_code_verifier')
    response.cookies.delete('oauth_tenant')
    response.cookies.delete('oauth_callback_url')

    return response
  } catch (error) {
    console.error('Callback error:', { tenant, error: error instanceof Error ? error.message : String(error) })
    return Response.redirect(`${request.nextUrl.origin}/auth/error?error=internal_error`)
  }
}
