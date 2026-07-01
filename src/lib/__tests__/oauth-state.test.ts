import {beforeEach, describe, expect, it} from 'vitest'
import {jwtVerify, SignJWT} from 'jose'
import {
    normalizeOAuthCallbackUrl,
    readSignedOAuthState,
    resolveOAuthCallbackState,
    signOAuthState,
} from '../oauth-state'

function authSecret() {
    return new TextEncoder().encode(process['env']['AUTH' + '_SECRET'])
}

describe('oauth-state', () => {
    beforeEach(() => {
        process['env']['AUTH' + '_SECRET'] = 'test-auth-secret-with-enough-length'
    })

    it('signs state without browser-carried code verifier material', async () => {
        const state = await signOAuthState({
            tenant: 'takdemo',
            callbackUrl: '/dashboard',
            nonce: 'state-nonce',
        })

        const {payload} = await jwtVerify(state, authSecret())

        expect(payload).toMatchObject({
            tenant: 'takdemo',
            callbackUrl: '/dashboard',
            nonce: 'state-nonce',
        })
        expect(payload).not.toHaveProperty('codeVerifier')
    })

    it('does not expose legacy codeVerifier fields from signed state', async () => {
        const legacyState = await new SignJWT({
            tenant: 'takdemo',
            callbackUrl: '/dashboard',
            nonce: 'state-nonce',
            codeVerifier: 'legacy-url-carried-verifier',
        })
            .setProtectedHeader({alg: 'HS256'})
            .setIssuedAt()
            .setExpirationTime('10m')
            .sign(authSecret())

        const signedState = await readSignedOAuthState(legacyState)

        expect(signedState).toEqual({
            tenant: 'takdemo',
            callbackUrl: '/dashboard',
            nonce: 'state-nonce',
        })
        expect(signedState).not.toHaveProperty('codeVerifier')
    })

    it('requires signed state, matching state cookie, and verifier cookie', () => {
        const state = 'returned-state'
        const result = resolveOAuthCallbackState(
            state,
            {tenant: 'takdemo', callbackUrl: '/dashboard', nonce: 'state-nonce'},
            name => ({
                oauth_state_takdemo: state,
                oauth_code_verifier_takdemo: 'cookie-verifier',
                oauth_tenant_takdemo: 'takdemo',
                oauth_callback_url_takdemo: '/dashboard',
            })[name]
        )

        expect(result).toMatchObject({
            stateTenant: 'takdemo',
            storedState: state,
            codeVerifier: 'cookie-verifier',
            cookieTenant: 'takdemo',
            callbackUrl: '/dashboard',
            isValid: true,
        })
    })

    it('rejects callback state when the state cookie is missing', () => {
        const result = resolveOAuthCallbackState(
            'returned-state',
            {tenant: 'takdemo', callbackUrl: '/dashboard', nonce: 'state-nonce'},
            name => ({
                oauth_code_verifier_takdemo: 'cookie-verifier',
            })[name]
        )

        expect(result.isValid).toBe(false)
        expect(result.codeVerifier).toBe('cookie-verifier')
        expect(result.storedState).toBeUndefined()
    })

    it('rejects callback state when the stored state does not match', () => {
        const result = resolveOAuthCallbackState(
            'returned-state',
            {tenant: 'takdemo', callbackUrl: '/dashboard', nonce: 'state-nonce'},
            name => ({
                oauth_state_takdemo: 'other-state',
                oauth_code_verifier_takdemo: 'cookie-verifier',
            })[name]
        )

        expect(result.isValid).toBe(false)
        expect(result.storedState).toBe('other-state')
    })

    it('rejects legacy self-contained state when verifier cookie is missing', async () => {
        const legacyState = await new SignJWT({
            tenant: 'takdemo',
            callbackUrl: '/dashboard',
            nonce: 'state-nonce',
            codeVerifier: 'legacy-url-carried-verifier',
        })
            .setProtectedHeader({alg: 'HS256'})
            .setIssuedAt()
            .setExpirationTime('10m')
            .sign(authSecret())
        const signedState = await readSignedOAuthState(legacyState)

        const result = resolveOAuthCallbackState(
            legacyState,
            signedState,
            name => ({
                oauth_state_takdemo: legacyState,
            })[name]
        )

        expect(result.isValid).toBe(false)
        expect(result.codeVerifier).toBeUndefined()
    })

    it('normalizes redirect_url aliases to same-origin callback paths', () => {
        expect(normalizeOAuthCallbackUrl('/issued/path?x=1', 'https://datamaster.example.com')).toBe('/issued/path?x=1')
        expect(normalizeOAuthCallbackUrl('https://datamaster.example.com/issued/path#done', 'https://datamaster.example.com')).toBe('/issued/path#done')
        expect(normalizeOAuthCallbackUrl(null, 'https://datamaster.example.com')).toBe('/dashboard')
        expect(normalizeOAuthCallbackUrl(null, 'https://datamaster.example.com', '/takdemo')).toBe('/takdemo')
    })

    it('rejects unsafe post-login redirect URLs', () => {
        expect(normalizeOAuthCallbackUrl('//evil.example.com/path', 'https://datamaster.example.com')).toBeNull()
        expect(normalizeOAuthCallbackUrl('https://evil.example.com/path', 'https://datamaster.example.com')).toBeNull()
        expect(normalizeOAuthCallbackUrl('not-a-path', 'https://datamaster.example.com')).toBeNull()
    })
})
