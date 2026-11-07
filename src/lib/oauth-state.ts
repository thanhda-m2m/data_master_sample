import {jwtVerify, SignJWT} from 'jose'
import {authSecret} from './auth-secret'

export type OAuthStatePayload = {
    tenant: string
    callbackUrl: string
    nonce: string
}

export type SignedOAuthState = {
    tenant?: string
    callbackUrl?: string
    nonce?: string
}

export type OAuthCookieReader = (name: string) => string | undefined

export type OAuthCallbackState = {
    stateTenant?: string
    storedState?: string
    codeVerifier?: string
    cookieTenant?: string
    callbackUrl: string
    isValid: boolean
}

export function normalizeOAuthCallbackUrl(
    value: string | null,
    requestOrigin: string,
    fallbackPath = '/dashboard'
): string | null {
    const candidate = value || fallbackPath
    if (!candidate.startsWith('/') && !/^https?:\/\//i.test(candidate)) return null
    try {
        const url = new URL(candidate, requestOrigin)
        if (url.origin !== requestOrigin) return null
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return null
    }
}


export async function signOAuthState(payload: OAuthStatePayload) {
    return new SignJWT(payload)
        .setProtectedHeader({alg: 'HS256'})
        .setIssuer('datamaster')
        .setAudience('datamaster-oauth-state')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(authSecret())
}

export async function readSignedOAuthState(state: string | null): Promise<SignedOAuthState | null> {
    if (!state) {
        return null
    }

    try {
        const {payload} = await jwtVerify(state, authSecret(), {
            algorithms: ['HS256'],
            issuer: 'datamaster',
            audience: 'datamaster-oauth-state',
            requiredClaims: ['exp', 'tenant', 'callbackUrl', 'nonce'],
        })
        return {
            tenant: typeof payload.tenant === 'string' ? payload.tenant : undefined,
            callbackUrl: typeof payload.callbackUrl === 'string' ? payload.callbackUrl : undefined,
            nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
        }
    } catch {
        return null
    }
}

export function resolveOAuthCallbackState(
    state: string | null,
    signedState: SignedOAuthState | null,
    readCookie: OAuthCookieReader
): OAuthCallbackState {
    const stateTenant = signedState?.tenant
    const storedState = stateTenant ? readCookie(`oauth_state_${stateTenant}`) : undefined
    const codeVerifier = stateTenant ? readCookie(`oauth_code_verifier_${stateTenant}`) : undefined
    const cookieTenant = stateTenant ? readCookie(`oauth_tenant_${stateTenant}`) : undefined
    const callbackUrl = signedState?.callbackUrl || '/'

    return {
        stateTenant,
        storedState,
        codeVerifier,
        cookieTenant,
        callbackUrl,
        isValid: Boolean(signedState && state && storedState && state === storedState && codeVerifier),
    }
}
