import {NextRequest, NextResponse} from 'next/server'
import {resolveTenantConfigFromDb} from '@/lib/tenant-resolver'
import {resolveRequestOrigin} from '@/lib/request-origin'
import {normalizeOAuthCallbackUrl, readSignedOAuthState, resolveOAuthCallbackState} from '@/lib/oauth-state'
import {verifyCognitoIdToken} from '@/lib/cognito'
import {signSession} from '@/lib/session'
import {switchPendingCookieName} from '@/lib/session-revalidation'
import {logAuditEvent} from '@/lib/audit-log'

export async function GET(request: NextRequest) {
    const origin = resolveRequestOrigin(request.headers, request.nextUrl.origin)
    const state = request.nextUrl.searchParams.get('state')
    const signedState = await readSignedOAuthState(state)
    const resolved = resolveOAuthCallbackState(state, signedState, name => request.cookies.get(name)?.value)
    const tenant = resolved.stateTenant
    const responseFor = (url: URL) => {
        const response = NextResponse.redirect(url)
        response.headers.set('Cache-Control', 'no-store')
        if (tenant) {
            for (const prefix of ['oauth_state_', 'oauth_code_verifier_', 'oauth_tenant_', 'oauth_callback_url_']) {
                response.cookies.delete(`${prefix}${tenant}`)
            }
        }
        return response
    }
    const failure = (error: string) => responseFor(new URL(`/auth/error?${new URLSearchParams({error})}`, origin))
    if (!resolved.isValid || !tenant || !signedState?.nonce || resolved.cookieTenant !== tenant) {
        return failure('invalid_session')
    }
    if (request.nextUrl.searchParams.has('error')) return failure('authorization_failed')
    const code = request.nextUrl.searchParams.get('code')
    if (!code) return failure('invalid_session')

    try {
        const config = await resolveTenantConfigFromDb(tenant)
        if (!config) return failure('tenant_not_found')
        const redirectUri = process.env.DATAMASTER_CALLBACK_URL || `${origin}/api/auth/callback`
        const tokenResponse = await fetch(config.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.clientId,
                code,
                redirect_uri: redirectUri,
                code_verifier: resolved.codeVerifier!,
            }),
            cache: 'no-store',
        })
        if (!tokenResponse.ok) {
            console.error('Cognito code exchange failed', {tenant, status: tokenResponse.status})
            return failure('token_exchange_failed')
        }
        const tokens = await tokenResponse.json() as {id_token?: string}
        if (typeof tokens.id_token !== 'string') return failure('token_validation_failed')
        const session = await verifyCognitoIdToken(tokens.id_token, config, signedState.nonce)
        const sessionToken = await signSession(session)
        const callbackUrl = normalizeOAuthCallbackUrl(resolved.callbackUrl, origin, `/${tenant}`)
        if (!callbackUrl) return failure('invalid_callback')
        const response = responseFor(new URL(callbackUrl, origin))
        response.cookies.set('session', sessionToken, {
            path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(origin).protocol === 'https:',
            maxAge: Math.max(0, session.expiresAt - Math.floor(Date.now() / 1000)),
        })
        response.cookies.set('datamaster_tenant', tenant, {
            path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(origin).protocol === 'https:', maxAge: 2592000,
        })
        response.cookies.set(switchPendingCookieName(tenant), '', {
            path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(origin).protocol === 'https:', maxAge: 0,
        })
        logAuditEvent('oauth_complete', tenant, request.headers, {userId: session.user.id})
        return response
    } catch (error) {
        console.error('Cognito callback failed', {tenant, error: error instanceof Error ? error.message : 'Unknown error'})
        return failure('token_validation_failed')
    }
}
