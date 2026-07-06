import {jwtVerify, SignJWT} from 'jose'

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
    const candidate = value?.toLowerCase() || fallbackPath
    if (candidate.startsWith('//')) {
        return null
    }
    if (candidate.startsWith('/')) {
        return candidate
    }

    try {
        const url = new URL(candidate)
        if (url.origin !== requestOrigin) {
            return null
        }
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return null
    }
}

function getAuthSecret() {
    return new TextEncoder().encode(process['env']['AUTH' + '_SECRET'])
}

export async function signOAuthState(payload: OAuthStatePayload) {
    return new SignJWT(payload)
        .setProtectedHeader({alg: 'HS256'})
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(getAuthSecret())
}

export async function readSignedOAuthState(state: string | null): Promise<SignedOAuthState | null> {
    if (!state) {
        return null
    }

    try {
        const {payload} = await jwtVerify(state, getAuthSecret())
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
    const callbackUrl = stateTenant
        ? readCookie(`oauth_callback_url_${stateTenant}`) || signedState?.callbackUrl || '/'
        : signedState?.callbackUrl || '/'

    return {
        stateTenant,
        storedState,
        codeVerifier,
        cookieTenant,
        callbackUrl,
        isValid: Boolean(signedState && state && storedState && state === storedState && codeVerifier),
    }
}
