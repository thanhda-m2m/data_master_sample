import {listTenantsFromDb, resolveTenantConfigFromDb} from './tenant-resolver'

export interface TenantConfig {
    userPoolId: string
    clientId: string
    clientSecret: string
    region: string
    loginId: string
    issuer: string
    cognitoAuthorizeUrl: string
    cognitoTokenUrl: string
    cognitoUserInfoUrl: string
    jwksUri: string
    smartimateAuthorizeUrl: string
    smartimateTokenUrl: string
    smartimateValidateUrl: string
}

export interface TenantSummary {
    bkid: number
    loginId: string
    compname: string
    bcname: string
}

export async function resolveTenantConfig(tenantCode: string): Promise<TenantConfig | null> {
    return await resolveTenantConfigFromDb(tenantCode)
}

export async function listTenants(): Promise<TenantSummary[]> {
    const dbTenants = await listTenantsFromDb()
    return dbTenants.map((tenant) => ({
        bkid: tenant.bkid,
        loginId: tenant.loginId,
        compname: tenant.compname || tenant.bcname,
        bcname: tenant.bcname,
    }))
}
