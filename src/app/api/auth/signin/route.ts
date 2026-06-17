import {NextRequest, NextResponse} from 'next/server'
import {resolveTenantConfigFromDb} from '@/lib/tenant-resolver'
import {resolveTenantConfig} from '@/lib/env-config'
import {randomBytes, createHash} from 'crypto'
import {SignJWT} from 'jose'
import {logAuditEvent} from '@/lib/audit-log'
import {detectTenant} from '@/lib/tenant-detection'
import {buildTenantSubdomainUrl, extractBaseDomain, isLocalDev} from '@/lib/url-builder'

function buildSmartiMateLoginUrl(baseUrl: string, tenant: string) {
    const normalizedBase = baseUrl.replace(/\/+$/, '')
    return new URL(`/${tenant}/login.php`, normalizedBase)
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
    const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

    // Priority: subdomain > query > cookie
    const {tenantCode: subdomainTenant} = detectTenant(
        request.headers.get('host') || '',
        cookieTenant
    )
    const tenant = subdomainTenant || queryTenant

    if (!tenant) {
        return Response.json({error: 'Missing tenant parameter'}, {status: 400})
    }

    // Validate tenant format
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
        return Response.json({error: 'Invalid tenant format'}, {status: 400})
    }

    // Validate callback URL (prevent open redirect)
    if (!callbackUrl.startsWith('/')) {
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
        const state = await new SignJWT({
            tenant,
            codeVerifier,
            callbackUrl,
            nonce: stateNonce,
        })
            .setProtectedHeader({alg: 'HS256'})
            .setIssuedAt()
            .setExpirationTime('10m')
            .sign(new TextEncoder().encode(process['env']['AUTH' + '_SECRET']))

        const smartiMateBaseUrl = process['env']['SMARTIMATE_BASE_URL'] || 'http://localhost:8080'

        // Build redirect_uri with tenant subdomain
        const redirectUri = buildTenantSubdomainUrl(tenant, '/api/auth/callback')

        // Smart iMATE login.php is the entry point for authentication
        // Flow:
        // 1. Redirect to /{tenant}/login.php with OAuth params (client_id, redirect_uri, state, code_challenge)
        // 2. login.php authenticates user via Cognito USER_PASSWORD_AUTH
        // 3. login.php stores Cognito tokens in session
        // 4. login.php redirects to /oauth2/authorize with same OAuth params
        // 5. /oauth2/authorize generates auth code JWT, links Cognito tokens from session
        // 6. /oauth2/authorize redirects back to DataMaster callback with code
        // 7. DataMaster exchanges code at /oauth2/token
        // 8. /oauth2/token returns Cognito tokens (access_token, id_token, refresh_token)
        const authUrl = buildSmartiMateLoginUrl(smartiMateBaseUrl, tenant)
        authUrl.searchParams.set('app', 'datamaster')
        authUrl.searchParams.set('client_id', config.clientId)
        authUrl.searchParams.set('response_type', 'code')
        authUrl.searchParams.set('scope', 'openid email profile')
        authUrl.searchParams.set('redirect_uri', redirectUri)
        authUrl.searchParams.set('state', state)
        authUrl.searchParams.set('code_challenge', codeChallenge)
        authUrl.searchParams.set('code_challenge_method', 'S256')

        // Store state and code_verifier in cookie for callback validation
        const isDev = isLocalDev()
        const hostname = request.headers.get('host') || ''
        const baseDomain = extractBaseDomain(hostname)
        // Localhost: cookies scoped to exact subdomain (browser compatibility)
        // Production: cookies scoped to .basedomain (cross-subdomain SSO)
        const cookieDomain = isDev ? undefined : `.${baseDomain}`

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
        response.cookies.set(stateCookieName, state, {
            path: '/',
            domain: cookieDomain,
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set(codeVerifierCookieName, codeVerifier, {
            path: '/',
            domain: cookieDomain,
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set(tenantCookieName, tenant, {
            path: '/',
            domain: cookieDomain,
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 600,
        })
        response.cookies.set('datamaster_tenant', tenant, {
            path: '/',
            domain: cookieDomain,
            httpOnly: true,
            sameSite: 'lax',
            secure: !isDev,
            maxAge: 2592000,
        })
        response.cookies.set(callbackCookieName, callbackUrl, {
            path: '/',
            domain: cookieDomain,
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
