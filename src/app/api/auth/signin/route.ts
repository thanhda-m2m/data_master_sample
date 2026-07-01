import {NextRequest, NextResponse} from 'next/server'
import {resolveTenantConfigFromDb} from '@/lib/tenant-resolver'
import {resolveTenantConfig} from '@/lib/env-config'
import {createHash, randomBytes} from 'crypto'
import {logAuditEvent} from '@/lib/audit-log'
import {resolveSigninTenant} from '@/lib/tenant-detection'
import {isLocalDev} from '@/lib/url-builder'
import {resolveRequestOrigin} from '@/lib/request-origin'
import {normalizeOAuthCallbackUrl, signOAuthState} from '@/lib/oauth-state'

function buildSmartiMateLoginUrl(baseUrl: string, tenant: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    return new URL(`/${tenant}/oauth2/authorize`, normalizedBase)
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const queryTenant = searchParams.get('tenant')
    const cookieTenant = request.cookies.get('datamaster_tenant')?.value
    const requestOrigin = resolveRequestOrigin(request.headers, request.nextUrl.origin)

    // Priority: subdomain > submitted selection > cookie fallback.
    const {tenantCode: tenant} = resolveSigninTenant(
        request.headers.get('host') || '',
        queryTenant,
        cookieTenant
    )

    if (!tenant) {
        return Response.json({error: 'Missing tenant parameter'}, {status: 400})
    }

    // Validate tenant format
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
        return Response.json({error: 'Invalid tenant format'}, {status: 400})
    }

    const callbackUrl = normalizeOAuthCallbackUrl(
        searchParams.get('redirect_url') || searchParams.get('callbackUrl'),
        requestOrigin,
        `/${tenant}`
    )

    // Validate callback URL (prevent open redirect)
    if (!callbackUrl) {
        return Response.json({error: 'Invalid callback URL'}, {status: 400})
    }

    try {
        const config = await resolveTenantConfigFromDb(tenant) ?? await resolveTenantConfig(tenant)
        if (!config) {
            return Response.json({error: 'Tenant not found'}, {status: 404})
        }

        // Generate PKCE code verifier and challenge
        const codeVerifier = randomBytes(32).toString('base64url')
        const codeChallenge = createHash('sha256')
            .update(codeVerifier)
            .digest('base64url')
        const stateNonce = randomBytes(16).toString('base64url')
        const oauthSession = await signOAuthState({
            tenant,
            callbackUrl,
            nonce: stateNonce,
        })

        const smartiMateBaseUrl = process['env']['SMARTIMATE_BASE_URL'] || 'http://localhost:8080'

        const redirectUri = `${requestOrigin}/api/auth/callback`

        // Smart iMATE login.php is the entry point for authentication
        // Flow:
        // 1. Redirect to Smart iMATE with minimal browser-carried broker params
        // 2. login.php authenticates user via Cognito USER_PASSWORD_AUTH
        // 3. login.php stores Cognito tokens in session
        // 4. login.php redirects to /oauth2/authorize with same OAuth params
        // 5. /oauth2/authorize generates auth code JWT, links Cognito tokens from session
        // 6. /oauth2/authorize redirects back to DataMaster callback with code
        // 7. DataMaster exchanges code at /oauth2/token
        // 8. /oauth2/token returns Cognito tokens (access_token, id_token, refresh_token)
        const authUrl = buildSmartiMateLoginUrl(smartiMateBaseUrl, tenant)
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('session', oauthSession)
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')

        // Store OAuth session and code_verifier in cookie for callback validation
        // No domain specified - cookies scoped to current domain only
        const isDev = isLocalDev()
        const stateCookieName = `oauth_state_${tenant}`
        const codeVerifierCookieName = `oauth_code_verifier_${tenant}`
        const callbackCookieName = `oauth_callback_url_${tenant}`
        const tenantCookieName = `oauth_tenant_${tenant}`

        const destination = authUrl.toString()
        const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">
  <title>Redirecting</title>
</head>
<body>
  <script>window.location.replace(${JSON.stringify(destination)});</script>
  <a href="${escapeHtml(destination)}">Continue</a>
</body>
</html>`
        const response = new NextResponse(html, {
            status: 200,
            headers: {'Content-Type': 'text/html; charset=utf-8'},
        })
        response.headers.set('Cache-Control', 'no-store')
        response.cookies.set(stateCookieName, oauthSession, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set(codeVerifierCookieName, codeVerifier, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set(tenantCookieName, tenant, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set('datamaster_tenant', tenant, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 2592000,
        })
        response.cookies.set(callbackCookieName, callbackUrl, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        logAuditEvent('oauth_start', tenant, request.headers, {source: 'signin'})

        return response
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined
        console.error('Sign in error:', {tenant, error: errorMsg, stack: errorStack})
        return Response.json({error: 'Internal server error', details: errorMsg}, {status: 500})
    }
}
