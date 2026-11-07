import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createServer} from 'node:http'
import {once} from 'node:events'
import type {AddressInfo} from 'node:net'
import {exportJWK, generateKeyPair, SignJWT} from 'jose'
import type {JWTPayload} from 'jose'
import {verifyCognitoIdToken} from '../cognito'
import type {TenantConfig} from '../tenant-types'

let privateKey: CryptoKey
let config: TenantConfig
const server = createServer()

beforeAll(async () => {
    const keys = await generateKeyPair('RS256')
    privateKey = keys.privateKey
    const jwk = {...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig'}
    server.on('request', (_request, response) => {
        response.writeHead(200, {'Content-Type': 'application/json'})
        response.end(JSON.stringify({keys: [jwk]}))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const port = (server.address() as AddressInfo).port
    config = {
        loginId: 'thanhda', userPoolId: 'pool', region: 'ap-northeast-1',
        clientId: 'datamaster-client', clientSecret: 'secret',
        issuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/pool',
        authorizationUrl: 'https://hosted.example/oauth2/authorize', tokenUrl: 'https://hosted.example/oauth2/token',
        jwksUri: `http://127.0.0.1:${port}/jwks.json`,
    }
})
afterAll(async () => {
    server.close()
    await once(server, 'close')
})

async function token(overrides: JWTPayload = {}) {
    return new SignJWT({
        sub: 'user-123', email: 'user@example.com', name: 'Example User', phone_number: '+819000000000',
        'custom:tenant_id': 'thanhda', token_use: 'id', nonce: 'browser-nonce',
        iss: config.issuer, aud: config.clientId, exp: Math.floor(Date.now() / 1000) + 3600,
        ...overrides,
    }).setProtectedHeader({alg: 'RS256', kid: 'test-key'}).sign(privateKey)
}

describe('Cognito ID token verification', () => {
    it('accepts a signed, tenant-bound identity from the requested app client', async () => {
        await expect(verifyCognitoIdToken(await token(), config, 'browser-nonce')).resolves.toMatchObject({
            tenant: 'thanhda', user: {id: 'user-123', email: 'user@example.com', phoneNumber: '+819000000000'},
        })
    })

    it.each([
        ['another app client', {aud: 'imate-client'}],
        ['another issuer', {iss: 'https://other.example/pool'}],
        ['another tenant', {'custom:tenant_id': 'other'}],
        ['missing tenant', {'custom:tenant_id': undefined}],
        ['another browser request', {nonce: 'other-nonce'}],
        ['an access token instead of an ID token', {token_use: 'access'}],
        ['an expired token', {exp: Math.floor(Date.now() / 1000) - 60}],
    ])('rejects %s', async (_label, overrides) => {
        await expect(verifyCognitoIdToken(await token(overrides), config, 'browser-nonce')).rejects.toThrow()
    })
})
