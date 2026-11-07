import {NextRequest, NextResponse} from 'next/server'
import {createHash, randomBytes} from 'crypto'
import {resolveTenantConfigFromDb} from '@/lib/tenant-resolver'
import {resolveSigninTenant} from '@/lib/tenant-detection'
import {normalizeOAuthCallbackUrl, signOAuthState} from '@/lib/oauth-state'
import {resolveRequestOrigin} from '@/lib/request-origin'
import {switchPendingCookieName} from '@/lib/session-revalidation'
import {logAuditEvent} from '@/lib/audit-log'

export async function GET(request: NextRequest) {
    const tenant = resolveSigninTenant(
        request.headers.get('host') || '',
        request.nextUrl.searchParams.get('tenant'),
        request.cookies.get('datamaster_tenant')?.value,
    ).tenantCode?.toLowerCase()
    if (!tenant || !/^[a-z0-9_-]{1,50}$/.test(tenant)) {
        return NextResponse.json({error: 'Invalid tenant'}, {status: 400})
    }
    const origin = resolveRequestOrigin(request.headers, request.nextUrl.origin)
    const callbackUrl = normalizeOAuthCallbackUrl(request.nextUrl.searchParams.get('callbackUrl'), origin, `/${tenant}`)
    if (!callbackUrl) return NextResponse.json({error: 'Invalid callbackUrl'}, {status: 400})

    try {
        const config = await resolveTenantConfigFromDb(tenant)
        if (!config) return NextResponse.json({error: 'Tenant Cognito configuration not found'}, {status: 404})
        const verifier = randomBytes(32).toString('base64url')
        const nonce = randomBytes(32).toString('base64url')
        const state = await signOAuthState({tenant, callbackUrl, nonce})
        const redirectUri = process.env.DATAMASTER_CALLBACK_URL || `${origin}/api/auth/callback`
        const url = new URL(config.authorizationUrl)
        url.search = new URLSearchParams({
            response_type: 'code',
            client_id: config.clientId,
            redirect_uri: redirectUri,
            scope: 'openid email profile',
            state,
            nonce,
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
        }).toString()
        const response = NextResponse.redirect(url)
        response.headers.set('Cache-Control', 'no-store')
        const options = {path: '/', httpOnly: true, sameSite: 'lax' as const, secure: new URL(origin).protocol === 'https:', maxAge: 600}
        response.cookies.set(`oauth_state_${tenant}`, state, options)
        response.cookies.set(`oauth_code_verifier_${tenant}`, verifier, options)
        response.cookies.set(`oauth_tenant_${tenant}`, tenant, options)
        response.cookies.set(`oauth_callback_url_${tenant}`, callbackUrl, options)
        response.cookies.set('datamaster_tenant', tenant, {...options, maxAge: 2592000})
        if (request.nextUrl.searchParams.get('switch') === '1') {
            response.cookies.set(switchPendingCookieName(tenant), '1', options)
        }
        logAuditEvent('oauth_start', tenant, request.headers)
        return response
    } catch (error) {
        console.error('Cognito sign-in failed', {tenant, error: error instanceof Error ? error.message : 'Unknown error'})
        return NextResponse.json({error: 'Unable to start Cognito sign-in'}, {status: 500})
    }
}
