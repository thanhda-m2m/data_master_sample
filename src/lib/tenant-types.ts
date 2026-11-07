/**
 * TypeScript interfaces for multi-tenant configuration.
 * Tenant configs are loaded from database (buscomps + bkmasters tables).
 */

export interface TenantConfig {
    loginId: string
    userPoolId: string
    clientId: string
    clientSecret: string
    region: string
    issuer: string
    authorizationUrl: string
    tokenUrl: string
    jwksUri: string
}

/**
 * Tenant summary for listing all available tenants.
 * Derived from buscomps table.
 * Field names match database column names (lowercase).
 */
export interface TenantSummary {
    bkid: number // business key ID
    loginid: string // tenant code
    loginId: string // camelCase alias for UI/auth callers
    bcname: string // display name
    compname?: string // optional alias for older UI callers
    subdom: string | null // subdomain
}
