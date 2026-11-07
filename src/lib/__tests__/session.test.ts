import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {readSession, signSession} from '../session'
import {signOAuthState} from '../oauth-state'

beforeEach(() => vi.stubEnv('AUTH_SECRET', 'session-test-secret-at-least-32-bytes'))
afterEach(() => vi.unstubAllEnvs())

const identity = {tenant: 'thanhda', user: {id: 'user-123', email: 'user@example.com', name: 'Example'}}

describe('DataMaster session lifetime and token purpose', () => {
    it('restores the verified identity only before its Cognito expiry', async () => {
        const session = {...identity, expiresAt: Math.floor(Date.now() / 1000) + 300}
        await expect(readSession(await signSession(session))).resolves.toEqual(session)
        await expect(readSession(await signSession({...session, expiresAt: Math.floor(Date.now() / 1000) - 1}))).resolves.toBeNull()
    })

    it('does not accept an OAuth state token as an application session', async () => {
        const state = await signOAuthState({tenant: 'thanhda', callbackUrl: '/thanhda', nonce: 'nonce'})
        await expect(readSession(state)).resolves.toBeNull()
    })

    it('does not accept a modified session signature', async () => {
        const token = await signSession({...identity, expiresAt: Math.floor(Date.now() / 1000) + 300})
        const [header, payload, signature] = token.split('.')
        const tampered = `${header}.${payload}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
        await expect(readSession(tampered)).resolves.toBeNull()
    })
})
