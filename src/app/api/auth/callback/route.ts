import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantConfig } from '@/lib/env-config'
import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
}

type CognitoUserPayload = {
  sub?: string
  email?: string
  name?: string
  preferred_username?: string
  given_name?: string
  family_name?: string
  tenant_id?: string
}

type SignedStatePayload = {
  tenant?: string
  codeVerifier?: string
  callbackUrl?: string
}

async function readSignedState(state: string | null): Promise<SignedStatePayload | null> {
  if (!state) {
    return null
  }

  try {
    const { payload } = await jwtVerify(
      state,
      new TextEncoder().encode(process['env']['AUTH' + '_SECRET'])
    )
    return {
      tenant: typeof payload.tenant === 'string' ? payload.tenant : undefined,
      codeVerifier: typeof payload.codeVerifier === 'string' ? payload.codeVerifier : undefined,
      callbackUrl: typeof payload.callbackUrl === 'string' ? payload.callbackUrl : undefined,
    }
  } catch {
    return null
  }
}

async function fetchCognitoUserInfo(accessToken: string, userInfoUrl: string): Promise<CognitoUserPayload> {
  const endpoint = process['env']['COGNITO_USERINFO_URL'] || userInfoUrl
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const result = await response.json() as CognitoUserPayload

  return {
    sub: result.sub || result.preferred_username || '',
    email: result.email || '',
    name: result.name || '',
    preferred_username: result.preferred_username || '',
    given_name: result.given_name || '',
    family_name: result.family_name || '',
    tenant_id: result.tenant_id || '',
  }
}

async function fetchCognitoGetUser(accessToken: string, region: string): Promise<CognitoUserPayload> {
  const endpoint =
    process['env']['COGNITO' + '_ENDPOINT_URL'] ||
    process['env']['AWS' + '_ENDPOINT_URL'] ||
    `https://cognito-idp.${region}.amazonaws.com/`
  const response = await fetch(endpoint.endsWith('/') ? endpoint : `${endpoint}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
    },
    body: JSON.stringify({ AccessToken: accessToken }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const result = await response.json() as {
    Username?: string
    UserAttributes?: Array<{ Name?: string; Value?: string }>
  }
  const attributes = Object.fromEntries(
    (result.UserAttributes || [])
      .filter(attribute => attribute.Name)
      .map(attribute => [attribute.Name as string, attribute.Value || ''])
  )

  return {
    sub: attributes.sub || result.Username,
    email: attributes.email || '',
    name: attributes.name || '',
    preferred_username: attributes.preferred_username || result.Username || '',
    given_name: attributes.given_name || '',
    family_name: attributes.family_name || '',
    tenant_id: attributes['custom:tenant_id'] || attributes.tenant_id || '',
  }
}

async function fetchCognitoUser(accessToken: string, config: { cognitoUserInfoUrl: string; region: string }): Promise<CognitoUserPayload> {
  try {
    return await fetchCognitoUserInfo(accessToken, config.cognitoUserInfoUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('openid')) {
      throw error
    }
    return fetchCognitoGetUser(accessToken, config.region)
  }
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
  const signedState = await readSignedState(state)
  const codeVerifier = cookieStore.get('oauth_code_verifier')?.value || signedState?.codeVerifier
  const tenant = cookieStore.get('oauth_tenant')?.value || signedState?.tenant
  const callbackUrl = cookieStore.get('oauth_callback_url')?.value || signedState?.callbackUrl || '/'

  // Validate state
  if (!code || !state || !tenant || !codeVerifier || (!signedState && state !== storedState)) {
    return Response.redirect(`${request.nextUrl.origin}/auth/error?error=invalid_state`)
  }

  try {
    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=tenant_not_found`)
    }

    // The interactive login happens in Smart iMATE /{tenantCode}/login.php.
    // login.php authenticates via Cognito USER_PASSWORD_AUTH, stores Cognito tokens in session.
    // Then login.php redirects to /oauth2/authorize which generates the auth code JWT.
    // /oauth2/authorize links the Cognito tokens (from session) to the auth code JWT.
    // Now we exchange the auth code with Smart iMATE /oauth2/token endpoint.
    // /oauth2/token validates the auth code JWT and returns the linked Cognito tokens.
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

    const tokenResponse = await fetch(config.smartimateTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    })

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text()
      console.error('Token exchange failed:', { tenant, error })
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=token_exchange_failed`)
    }

    // Token response contains Cognito tokens (access_token, id_token, refresh_token)
    // These are the actual Cognito tokens, NOT Smart iMATE JWT tokens
    // Smart iMATE only brokered the authentication and code exchange
    const tokens = await tokenResponse.json()

    if (!tokens.access_token) {
      console.error('Token response missing access token:', { tenant })
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=token_validation_failed`)
    }

    let payload: CognitoUserPayload
    try {
      payload = await fetchCognitoUser(tokens.access_token, config)
    } catch (error) {
      console.error('Cognito userInfo failed:', { tenant, error: error instanceof Error ? error.message : String(error) })
      return Response.redirect(`${request.nextUrl.origin}/auth/error?error=token_validation_failed`)
    }

    const userName =
      payload.name ||
      payload.preferred_username ||
      `${payload.given_name || ''} ${payload.family_name || ''}`.trim() ||
      payload.email ||
      'Unknown User'

    // Keep the browser session cookie small. Raw Cognito tokens can exceed cookie limits.
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    const sessionToken = await new SignJWT({
      sub: payload.sub,
      email: payload.email,
      name: userName,
      tenant,
      expiresAt: Math.floor(Date.now() / 1000) + Number(tokens.expires_in || 3600) - 60,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    // Set session cookie and clear OAuth cookies
    const isDev = isLocalDevHost(request.nextUrl.hostname)
    const redirectUrlObj = new URL(`${request.nextUrl.origin}${callbackUrl}`)
    redirectUrlObj.searchParams.set('sso_success', 'true')
    const response = NextResponse.redirect(redirectUrlObj)
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
