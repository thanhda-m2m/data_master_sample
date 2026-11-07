import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {clearTenantCache, invalidateTenantCache, resolveTenantConfigFromDb} from '../tenant-resolver'
import {query} from '../db'

vi.mock('../db', () => ({query: vi.fn()}))

const row = {
    bkid: 495, loginid: 'thanhda', bcname: 'Thanhda',
    cognito_region: 'ap-northeast-1', userPoolId: 'ap-northeast-1_Pool',
    cognito_custom_domain: 'tenant.auth.ap-northeast-1.amazoncognito.com',
    cognito_credentials: {app_client_id: 'imate-client', app_client_secret: 'imate-secret'},
}

beforeEach(() => {
    clearTenantCache()
    vi.clearAllMocks()
    vi.stubEnv('DATAMASTER_COGNITO_CLIENTS', JSON.stringify({
        thanhda: {client_id: 'datamaster-client', client_secret: 'datamaster-secret'},
    }))
    vi.mocked(query).mockResolvedValue([row])
})
afterEach(() => {vi.unstubAllEnvs(); vi.useRealTimers()})

describe('DataMaster tenant credentials', () => {
    it('uses the separate app client, not iMATE credentials in the flat database JSON', async () => {
        const config = await resolveTenantConfigFromDb('THANHDA')
        expect(config).toMatchObject({
            loginId: 'thanhda', clientId: 'datamaster-client', clientSecret: 'datamaster-secret',
            issuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Pool',
            authorizationUrl: 'https://tenant.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize',
            tokenUrl: 'https://tenant.auth.ap-northeast-1.amazoncognito.com/oauth2/token',
        })
    })

    it.each(['{}', '{broken', '{"thanhda":{"client_id":"only-id"}}'])('never falls back to iMATE credentials for %s', async clients => {
        vi.stubEnv('DATAMASTER_COGNITO_CLIENTS', clients)
        await expect(resolveTenantConfigFromDb('thanhda')).resolves.toBeNull()
    })

    it('does not reuse another tenant\'s app client', async () => {
        vi.mocked(query).mockResolvedValue([{...row, loginid: 'other'}])
        await expect(resolveTenantConfigFromDb('other')).resolves.toBeNull()
    })

    it.each(['cognito_region', 'userPoolId', 'cognito_custom_domain'])('rejects missing pool metadata: %s', async key => {
        vi.mocked(query).mockResolvedValue([{...row, [key]: null}])
        await expect(resolveTenantConfigFromDb('thanhda')).resolves.toBeNull()
    })

    it('refreshes the trusted issuer and endpoints after invalidation', async () => {
        await resolveTenantConfigFromDb('thanhda')
        vi.mocked(query).mockResolvedValue([{...row, userPoolId: 'ap-northeast-1_Rotated', cognito_custom_domain: 'rotated.example.com'}])
        invalidateTenantCache('thanhda')
        await expect(resolveTenantConfigFromDb('thanhda')).resolves.toMatchObject({
            issuer: 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Rotated',
            tokenUrl: 'https://rotated.example.com/oauth2/token',
        })
    })

    it('does not retain a rotated tenant issuer beyond the cache lifetime', async () => {
        vi.useFakeTimers()
        await resolveTenantConfigFromDb('thanhda')
        vi.mocked(query).mockResolvedValue([{...row, userPoolId: 'ap-northeast-1_Rotated'}])
        expect((await resolveTenantConfigFromDb('thanhda'))?.userPoolId).toBe('ap-northeast-1_Pool')
        vi.advanceTimersByTime(10 * 60 * 1000 + 1)
        expect((await resolveTenantConfigFromDb('thanhda'))?.userPoolId).toBe('ap-northeast-1_Rotated')
    })
})
