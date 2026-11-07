import {createRemoteJWKSet, jwtVerify} from 'jose'
import type {JWTVerifyGetKey} from 'jose'
import type {Session} from './session'
import type {TenantConfig} from './tenant-types'

const keySets = new Map<string, JWTVerifyGetKey>()

export async function verifyCognitoIdToken(
    token: string,
    config: TenantConfig,
    nonce: string,
): Promise<Session> {
    let keys = keySets.get(config.jwksUri)
    if (!keys) {
        keys = createRemoteJWKSet(new URL(config.jwksUri))
        keySets.set(config.jwksUri, keys)
    }
    const {payload} = await jwtVerify(token, keys, {
        algorithms: ['RS256'],
        issuer: config.issuer,
        audience: config.clientId,
        requiredClaims: ['exp', 'sub', 'nonce', 'email', 'token_use', 'custom:tenant_id'],
    })
    if (payload.token_use !== 'id' || !nonce || payload.nonce !== nonce
        || typeof payload.sub !== 'string' || !payload.sub
        || typeof payload.email !== 'string' || !payload.email
        || typeof payload['custom:tenant_id'] !== 'string'
        || payload['custom:tenant_id'].toLowerCase() !== config.loginId.toLowerCase()) {
        throw new Error('Cognito identity does not match the authorization request')
    }
    return {
        user: {
            id: payload.sub,
            email: payload.email,
            name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email,
            phoneNumber: typeof payload.phone_number === 'string' ? payload.phone_number : undefined,
        },
        tenant: config.loginId.toLowerCase(),
        expiresAt: payload.exp!,
    }
}
