import {beforeEach, describe, expect, it, vi} from 'vitest'
import {
    clearTenantCache,
    invalidateTenantCache,
    listTenantsFromDb,
    resolveTenantConfigFromDb,
} from '../tenant-resolver'
import * as db from '../db'

vi.mock('../db', () => ({
    query: vi.fn(),
}))

describe('tenant-resolver', () => {
    beforeEach(() => {
        clearTenantCache()
        vi.clearAllMocks()
        const cognitoKey = (...parts: string[]) => parts.join('_')
        delete process.env[cognitoKey('DATAMASTER', 'COGNITO', 'CUSTOM', 'DOMAIN')]
        delete process.env[cognitoKey('COGNITO', 'CUSTOM', 'DOMAIN')]
        delete process.env[cognitoKey('COGNITO', 'HOSTED', 'UI', 'BASE', 'URL')]
        delete process.env[cognitoKey('COGNITO', 'AUTHORIZE', 'URL')]
        delete process.env[cognitoKey('COGNITO', 'TOKEN', 'URL')]
        delete process.env[cognitoKey('COGNITO', 'USERINFO', 'URL')]
        delete process['env']['SMARTIMATE_BASE_URL']
        delete process['env']['SMARTIMATE_INTERNAL_BASE_URL']
        delete process['env']['SMARTIMATE_AUTHORIZE_URL']
        delete process['env']['SMARTIMATE_TOKEN_URL']
        delete process['env']['SMARTIMATE_VALIDATE_URL']
    })

    describe('resolveTenantConfigFromDb', () => {
        it('resolves tenant config from database', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'takdemo',
                    bcname: 'Takdemo Demo',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'test-client-id',
                            app_client_secret: 'test-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            const config = await resolveTenantConfigFromDb('takdemo')

            expect(config).not.toBeNull()
            expect(config?.loginId).toBe('takdemo')
            expect(config?.clientId).toBe('test-client-id')
            expect(config?.clientSecret).toBe('test-client-secret')
            expect(config?.region).toBe('ap-northeast-1')
            expect(config?.userPoolId).toBe('ap-northeast-1_TestPool')
            expect(config?.authorizationUrl).toContain('/oauth2/authorize')
            expect(config?.tokenUrl).toContain('/oauth2/token')
            expect(config?.userInfoUrl).toContain('/oauth2/userInfo')
            expect(config?.cognitoAuthorizeUrl).toBe(config?.authorizationUrl)
            expect(config?.cognitoTokenUrl).toBe(config?.tokenUrl)
            expect(config?.cognitoUserInfoUrl).toBe(config?.userInfoUrl)
            expect(config?.jwksUri).toContain('/.well-known/jwks.json')
            expect(config?.smartimateTokenUrl).toContain('/oauth2/token')
        })

        it('routes backend Smart iMATE calls through the private base URL', async () => {
            process['env']['SMARTIMATE_BASE_URL'] = 'https://smartimate.example.com/'
            process['env']['SMARTIMATE_INTERNAL_BASE_URL'] = 'http://10.0.12.34:8080/'
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'private-route',
                    bcname: 'Private Route Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'private-client-id',
                            app_client_secret: 'private-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_PrivatePool',
                },
            ])

            const config = await resolveTenantConfigFromDb('private-route')

            expect(config?.smartimateAuthorizeUrl).toBe('https://smartimate.example.com/oauth2/authorize')
            expect(config?.smartimateTokenUrl).toBe('http://10.0.12.34:8080/oauth2/token')
            expect(config?.smartimateValidateUrl).toBe('http://10.0.12.34:8080/oauth2/validate')
        })

        it('preserves explicit backend endpoint overrides', async () => {
            process['env']['SMARTIMATE_INTERNAL_BASE_URL'] = 'http://10.0.12.34:8080'
            process['env']['SMARTIMATE_TOKEN_URL'] = 'http://10.0.20.10/internal/token'
            process['env']['SMARTIMATE_VALIDATE_URL'] = 'http://10.0.20.11/internal/validate'
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'endpoint-overrides',
                    bcname: 'Endpoint Override Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'override-client-id',
                            app_client_secret: 'override-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_OverridePool',
                },
            ])

            const config = await resolveTenantConfigFromDb('endpoint-overrides')

            expect(config?.smartimateTokenUrl).toBe('http://10.0.20.10/internal/token')
            expect(config?.smartimateValidateUrl).toBe('http://10.0.20.11/internal/validate')
        })

        it('uses hosted UI URLs for OAuth endpoints while preserving the user-pool issuer', async () => {
            process.env[['COGNITO', 'HOSTED', 'UI', 'BASE', 'URL'].join('_')] = 'https://auth.example.com/'
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'hosted',
                    bcname: 'Hosted Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'hosted-client-id',
                            app_client_secret: 'hosted-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            const config = await resolveTenantConfigFromDb('hosted')

            expect(config?.issuer).toBe(
                'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_TestPool'
            )
            expect(config?.cognitoAuthorizeUrl).toBe('https://auth.example.com/oauth2/authorize')
            expect(config?.cognitoTokenUrl).toBe('https://auth.example.com/oauth2/token')
            expect(config?.cognitoUserInfoUrl).toBe('https://auth.example.com/oauth2/userInfo')
        })

        it('returns null for tenant not found', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([])
            await expect(resolveTenantConfigFromDb('nonexistent')).resolves.toBeNull()
        })

        it('returns null for malformed JSON', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'badtenant',
                    bcname: 'Bad Tenant',
                    cognito_credentials: 'invalid-json{',
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            await expect(resolveTenantConfigFromDb('badtenant')).resolves.toBeNull()
        })

        it('returns null for missing datamaster keys', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'incomplete',
                    bcname: 'Incomplete Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'only-client-id',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            await expect(resolveTenantConfigFromDb('incomplete')).resolves.toBeNull()
        })

        it('caches tenant config with TTL', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([
                {
                    bkid: 1,
                    loginid: 'cached',
                    bcname: 'Cached Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'cached-client-id',
                            app_client_secret: 'cached-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            await resolveTenantConfigFromDb('cached')
            await resolveTenantConfigFromDb('cached')

            expect(db.query).toHaveBeenCalledTimes(1)
        })

        it('invalidates cache entry manually', async () => {
            vi.mocked(db.query).mockResolvedValue([
                {
                    bkid: 1,
                    loginid: 'invalidate',
                    bcname: 'Invalidate Tenant',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'invalidate-client-id',
                            app_client_secret: 'invalidate-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            await resolveTenantConfigFromDb('invalidate')
            invalidateTenantCache('invalidate')
            await resolveTenantConfigFromDb('invalidate')

            expect(db.query).toHaveBeenCalledTimes(2)
        })

        it('clears all cache entries when invalidating without a tenant code', async () => {
            const makeRow = (loginid: string) => ({
                bkid: 1,
                loginid,
                bcname: `Tenant ${loginid}`,
                cognito_credentials: JSON.stringify({
                    datamaster: {
                        app_client_id: `${loginid}-client-id`,
                        app_client_secret: `${loginid}-client-secret`,
                    },
                }),
                cognito_region: 'ap-northeast-1',
                userPoolId: 'ap-northeast-1_TestPool',
            })

            vi.mocked(db.query)
                .mockResolvedValueOnce([makeRow('tenant-a')])
                .mockResolvedValueOnce([makeRow('tenant-b')])
                .mockResolvedValueOnce([makeRow('tenant-a')])
                .mockResolvedValueOnce([makeRow('tenant-b')])

            await resolveTenantConfigFromDb('tenant-a')
            await resolveTenantConfigFromDb('tenant-b')
            invalidateTenantCache()
            await resolveTenantConfigFromDb('tenant-a')
            await resolveTenantConfigFromDb('tenant-b')

            expect(db.query).toHaveBeenCalledTimes(4)
        })

        it('handles database errors gracefully', async () => {
            vi.mocked(db.query).mockRejectedValueOnce(new Error('Connection failed'))
            await expect(resolveTenantConfigFromDb('error-tenant')).resolves.toBeNull()
        })
    })

    describe('listTenantsFromDb', () => {
        it('lists all tenants with credentials', async () => {
            vi.mocked(db.query).mockResolvedValueOnce([
                {bkid: 1, loginid: 'tenant1', bcname: 'Tenant 1', subdom: 't1'},
                {bkid: 2, loginid: 'tenant2', bcname: 'Tenant 2', subdom: 't2'},
            ])

            await expect(listTenantsFromDb()).resolves.toEqual([
                {
                    bkid: 1,
                    loginid: 'tenant1',
                    loginId: 'tenant1',
                    bcname: 'Tenant 1',
                    compname: 'Tenant 1',
                    subdom: 't1',
                },
                {
                    bkid: 2,
                    loginid: 'tenant2',
                    loginId: 'tenant2',
                    bcname: 'Tenant 2',
                    compname: 'Tenant 2',
                    subdom: 't2',
                },
            ])
        })

        it('returns empty array on database error', async () => {
            vi.mocked(db.query).mockRejectedValueOnce(new Error('Connection failed'))
            await expect(listTenantsFromDb()).resolves.toEqual([])
        })
    })

    describe('cache TTL expiration', () => {
        it('expires cache after TTL', async () => {
            vi.useFakeTimers()
            vi.setSystemTime(new Date('2026-06-17T00:00:00Z'))
            vi.mocked(db.query).mockResolvedValue([
                {
                    bkid: 1,
                    loginid: 'ttl-test',
                    bcname: 'TTL Test',
                    cognito_credentials: JSON.stringify({
                        datamaster: {
                            app_client_id: 'ttl-client-id',
                            app_client_secret: 'ttl-client-secret',
                        },
                    }),
                    cognito_region: 'ap-northeast-1',
                    userPoolId: 'ap-northeast-1_TestPool',
                },
            ])

            await resolveTenantConfigFromDb('ttl-test')
            vi.advanceTimersByTime(5 * 60 * 1000)
            await resolveTenantConfigFromDb('ttl-test')
            vi.advanceTimersByTime(6 * 60 * 1000)
            await resolveTenantConfigFromDb('ttl-test')

            expect(db.query).toHaveBeenCalledTimes(2)
            vi.useRealTimers()
        })
    })

    describe('LRU cache eviction', () => {
        it('evicts the oldest entry when cache exceeds max size', async () => {
            const makeRow = (loginid: string) => ({
                bkid: 1,
                loginid,
                bcname: `Tenant ${loginid}`,
                cognito_credentials: JSON.stringify({
                    datamaster: {
                        app_client_id: `${loginid}-client-id`,
                        app_client_secret: `${loginid}-client-secret`,
                    },
                }),
                cognito_region: 'ap-northeast-1',
                userPoolId: 'ap-northeast-1_TestPool',
            })

            for (let i = 0; i < 100; i += 1) {
                vi.mocked(db.query).mockResolvedValueOnce([makeRow(`tenant${i}`)])
                await resolveTenantConfigFromDb(`tenant${i}`)
            }

            vi.mocked(db.query).mockResolvedValueOnce([makeRow('tenant100')])
            await resolveTenantConfigFromDb('tenant100')

            vi.mocked(db.query).mockResolvedValueOnce([makeRow('tenant0')])
            await resolveTenantConfigFromDb('tenant0')

            expect(db.query).toHaveBeenCalledTimes(102)
        })
    })
})
