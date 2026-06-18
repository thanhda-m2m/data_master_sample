/**
 * TypeScript interfaces for multi-tenant configuration.
 * Tenant configs are loaded from database (buscomps + bkmasters tables).
 */

/**
 * Cognito credentials JSON structure stored in bkmasters.cognito_credentials.
 * Example: {"datamaster": {"app_client_id": "...", "app_client_secret": "..."}}
 */
export interface CognitoCredentials {
    datamaster?: {
        app_client_id?: string
        app_client_secret?: string
    }
}

/**
 * Full tenant OAuth configuration derived from database.
 * Used by NextAuth.js providers and middleware.
 */
export interface TenantConfig {
    loginId: string // tenant code (buscomps.loginid)
    userPoolId: string // Cognito User Pool ID
    clientId: string // OAuth app client ID (from JSON)
    clientSecret: string // OAuth app client secret (from JSON)
    region: string // AWS region (bkmasters.cognito_region)
    issuer: string // https://cognito-idp.{region}.amazonaws.com/{userPoolId}
    authorizationUrl: string // OAuth authorization endpoint
    tokenUrl: string // OAuth token endpoint
    userInfoUrl: string // OAuth userinfo endpoint
    cognitoAuthorizeUrl: string // Backward-compatible alias
    cognitoTokenUrl: string // Backward-compatible alias
    cognitoUserInfoUrl: string // Backward-compatible alias
    jwksUri: string // Cognito JWKS endpoint
    smartimateAuthorizeUrl: string // Smart iMATE authorize endpoint
    smartimateTokenUrl: string // Smart iMATE token endpoint
    smartimateValidateUrl: string // Smart iMATE validate endpoint
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
