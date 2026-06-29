import {NextRequest, NextResponse} from 'next/server'
import {resolveTenantConfigFromDb} from '@/lib/tenant-resolver'
import {resolveTenantConfig} from '@/lib/env-config'
import {SignJWT} from 'jose'
import {cookies} from 'next/headers'
import {logAuditEvent} from '@/lib/audit-log'
import {detectTenant} from '@/lib/tenant-detection'
import {isLocalDev} from '@/lib/url-builder'
import {resolveRequestOrigin} from '@/lib/request-origin'
import {readSignedOAuthState, resolveOAuthCallbackState} from '@/lib/oauth-state'

type CognitoUserPayload = {
    sub?: string
    email?: string
    name?: string
    preferred_username?: string
    given_name?: string
    family_name?: string
    tenant_id?: string
    phonenumber?: string
}

type TokenExchangeResponse = {
    access_token?: string
    refresh_token?: string
    id_token?: string
    token_type?: string
    expires_in?: number
    scope?: string
    token_source?: string
}

async function fetchCognitoGetUser(accessToken: string, region: string): Promise<CognitoUserPayload> {
    const endpoint =
        process['env']['AWS' + '_ENDPOINT_URL'] ||
        `https://cognito-idp.${region}.amazonaws.com/`;

    const response = await fetch(endpoint.endsWith('/') ? endpoint : `${endpoint}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-amz-json-1.1',
            'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
        },
        body: JSON.stringify({AccessToken: accessToken}),
    });

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
        phonenumber: attributes.phone_number || '',
    }
}

function smartiMateUserInfoUrlFromTokenUrl(tokenUrl: string, tenant: string) {
    const url = new URL(tokenUrl)
    url.pathname = `/${tenant}/oauth2/userinfo`
    return url.toString()
}

async function fetchSmartiMateUserInfo(accessToken: string, tokenUrl: string, tenant: string): Promise<CognitoUserPayload> {
    const response = await fetch(smartiMateUserInfoUrlFromTokenUrl(tokenUrl, tenant), {
        method: 'GET',
        headers: {Authorization: `Bearer ${accessToken}`},
        cache: 'no-store',
    })

    if (!response.ok) {
        throw new Error(await response.text())
    }

    const result = await response.json() as {
        sub?: string
        email?: string
        name?: string
        tenant_id?: string
        phone_number?: string
        phonenumber?: string
    }

    return {
        sub: result.sub,
        email: result.email,
        name: result.name,
        tenant_id: result.tenant_id,
        phonenumber: result.phonenumber || result.phone_number,
    }
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const oauthSession = searchParams.get('session') || searchParams.get('state')
    const providerError = searchParams.get('error')
    const providerErrorDescription = searchParams.get('error_description')
    const requestOrigin = resolveRequestOrigin(request.headers, request.nextUrl.origin)

    // Detect tenant from subdomain first
    const {tenantCode: subdomainTenant} = detectTenant(
        request.headers.get('host') || ''
    )

    const cookieStore = await cookies()
    const signedState = await readSignedOAuthState(oauthSession)
    const {
        stateTenant,
        codeVerifier,
        cookieTenant,
        callbackUrl,
        isValid: isOAuthStateValid,
    } = resolveOAuthCallbackState(
        oauthSession,
        signedState,
        name => cookieStore.get(name)?.value
    )

    // Priority: subdomain > OAuth session JWT > cookie
    const tenant = subdomainTenant || stateTenant || cookieTenant

    // Validate tenant consistency
    if (subdomainTenant && stateTenant && subdomainTenant !== stateTenant) {
        logAuditEvent('validation_failure', tenant || 'unknown', request.headers, {error: 'tenant_mismatch_subdomain'})
        return Response.redirect(new URL('/auth/error?error=tenant_mismatch', requestOrigin))
    }

    if (providerError) {
        const errorUrlObj = new URL('/auth/error', requestOrigin)
        errorUrlObj.searchParams.set('error', providerError)
        if (providerErrorDescription) {
            errorUrlObj.searchParams.set('error_description', providerErrorDescription)
        }
        return Response.redirect(errorUrlObj)
    }

    // Validate OAuth session
    if (!code || !tenant || !codeVerifier || !isOAuthStateValid) {
        logAuditEvent('validation_failure', tenant || 'unknown', request.headers, {error: 'invalid_session'})
        return Response.redirect(new URL('/auth/error?error=invalid_session', requestOrigin))
    }

    try {
        if (cookieTenant && cookieTenant !== stateTenant) {
            logAuditEvent('validation_failure', tenant, request.headers, {error: 'tenant_mismatch'})
            return Response.redirect(new URL('/auth/error?error=tenant_mismatch', requestOrigin))
        }

        const config = await resolveTenantConfigFromDb(tenant) ?? await resolveTenantConfig(tenant)
        if (!config) {
            logAuditEvent('validation_failure', tenant, request.headers, {error: 'tenant_not_found'})
            return Response.redirect(new URL('/auth/error?error=tenant_not_found', requestOrigin))
        }


        // The interactive login happens in Smart iMATE /{tenantCode}/login.php.
        // login.php authenticates via Cognito USER_PASSWORD_AUTH, stores Cognito tokens in session.
        // Then login.php redirects to /oauth2/authorize which generates the auth code JWT.
        // /oauth2/authorize links the Cognito tokens (from session) to the auth code JWT.
        // Now we exchange the auth code with Smart iMATE /oauth2/token endpoint.
        // /oauth2/token validates the auth code JWT and returns the linked Cognito tokens.
        const redirectUri = `${requestOrigin}/api/auth/callback`

        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: config.clientId,
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        })
        if (config.clientSecret) {
            tokenParams.set('client_secret', config.clientSecret)
        }

        let tokenResponse
        try {
            tokenResponse = await fetch(config.smartimateTokenUrl, {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: tokenParams,
            })
        } catch (fetchError) {
            const errMsg = fetchError instanceof Error ? fetchError.message : String(fetchError)
            const errCause = fetchError instanceof Error && 'cause' in fetchError ? fetchError.cause : undefined
            console.error('Token exchange fetch failed:', {
                tenant,
                url: config.smartimateTokenUrl,
                error: errMsg,
                cause: errCause,
            })
            return Response.redirect(new URL('/auth/error?error=token_exchange_failed', requestOrigin))
        }

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text()
            console.error('Token exchange failed:', {
                tenant,
                url: config.smartimateTokenUrl,
                status: tokenResponse.status,
                error
            })
            return Response.redirect(new URL('/auth/error?error=token_exchange_failed', requestOrigin))
        }

        // Normal login returns Cognito tokens. Admin impersonation returns a Smart iMATE JWT.
        const tokens = await tokenResponse.json() as TokenExchangeResponse

        if (!tokens.access_token) {
            console.error('Token response missing access token:', {tenant})
            return Response.redirect(new URL('/auth/error?error=token_validation_failed', requestOrigin))
        }

        let payload: CognitoUserPayload
        try {
            if (tokens.token_source === 'smartimate_impersonation') {
                payload = await fetchSmartiMateUserInfo(tokens.access_token, config.smartimateTokenUrl, tenant)
            } else {
                // Decode token to find actual issuer (Smart iMATE's Cognito pool)
                const tokenParts = tokens.access_token.split('.')
                let actualRegion = config.region

                if (tokenParts.length >= 2) {
                    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString())

                    // Extract region and pool from issuer
                    // Format: https://cognito-idp.{region}.amazonaws.com/{poolId}
                    const issuerMatch = tokenPayload.iss?.match(/cognito-idp\.([^.]+)\.amazonaws\.com\/([^/]+)/)
                    if (issuerMatch) {
                        const [, tokenRegion] = issuerMatch
                        actualRegion = tokenRegion
                    }
                }

                // Call GetUser directly with token's pool
                payload = await fetchCognitoGetUser(tokens.access_token, actualRegion)
            }
        } catch (error) {
            console.error('UserInfo failed:', {
                tenant,
                tokenSource: tokens.token_source || 'cognito',
                error: error instanceof Error ? error.message : String(error)
            })
            return Response.redirect(new URL('/auth/error?error=token_validation_failed', requestOrigin))
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
            phonenumber: payload.phonenumber,
            tenant,
            expiresAt: Math.floor(Date.now() / 1000) + Number(tokens.expires_in || 3600) - 60,
        })
            .setProtectedHeader({alg: 'HS256'})
            .setIssuedAt()
            .setExpirationTime('30d')
            .sign(secret)

        // Set session cookie and clear OAuth cookies
        // No subdomain redirect - stay on base domain
        const isDev = isLocalDev()
        const redirectUrlObj = new URL(callbackUrl, requestOrigin)
        redirectUrlObj.searchParams.set('sso_success', 'true')
        const response = NextResponse.redirect(redirectUrlObj)
        response.cookies.set('session', sessionToken, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 2592000,
        })
        response.cookies.delete(`oauth_state_${tenant}`)
        response.cookies.delete(`oauth_code_verifier_${tenant}`)
        response.cookies.delete(`oauth_tenant_${tenant}`)
        response.cookies.delete(`oauth_callback_url_${tenant}`)
        logAuditEvent('oauth_complete', tenant, request.headers, {
            userId: payload.sub || '',
        })

        return response
    } catch (error) {
        logAuditEvent('validation_failure', tenant, request.headers, {
            error: error instanceof Error ? error.message : String(error),
        })
        console.error('Callback error:', {
            tenant,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        })
        return Response.redirect(new URL('/auth/error?error=internal_error', requestOrigin))
    }
}
