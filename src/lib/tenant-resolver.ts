/**
 * Database-driven tenant resolver with LRU cache.
 * Reads Cognito pool metadata from buscomps + bkmasters; app credentials stay in DataMaster.
 */

import {query} from './db'
import type {TenantConfig, TenantSummary} from './tenant-types'

// LRU cache: Map<tenantCode, {config, expiresAt}>
interface CacheEntry {
    config: TenantConfig
    expiresAt: number // timestamp in ms
}

const tenantCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_CACHE_SIZE = 100

/**
 * Database row type from JOIN query.
 */
interface TenantDbRow {
    bkid: number
    loginid: string
    bcname: string
    cognito_custom_domain: string | null
    cognito_region: string | null
    userPoolId: string | null
}


/**
 * Get cached tenant config if not expired.
 */
function getCachedConfig(tenantCode: string): TenantConfig | null {
    const entry = tenantCache.get(tenantCode)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
        tenantCache.delete(tenantCode)
        return null
    }

    return entry.config
}

/**
 * Store tenant config in cache with TTL.
 * Implements LRU eviction when cache exceeds max size.
 */
function setCachedConfig(tenantCode: string, config: TenantConfig): void {
    // LRU eviction: remove oldest entry if cache full
    if (tenantCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = tenantCache.keys().next().value
        if (oldestKey) {
            tenantCache.delete(oldestKey)
        }
    }

    tenantCache.set(tenantCode, {
        config,
        expiresAt: Date.now() + CACHE_TTL_MS,
    })
}

function dataMasterClient(tenantCode: string): {clientId: string; clientSecret: string} | null {
    try {
        const clients = JSON.parse(process.env.DATAMASTER_COGNITO_CLIENTS || '{}')
        const client = clients?.[tenantCode]
        if (typeof client?.client_id !== 'string' || !client.client_id.trim()
            || typeof client.client_secret !== 'string' || !client.client_secret.trim()) {
            return null
        }
        return {clientId: client.client_id.trim(), clientSecret: client.client_secret}
    } catch {
        return null
    }
}

function normalizeTenantSummary(row: Omit<TenantSummary, 'loginId' | 'compname'>): TenantSummary {
    return {
        ...row,
        loginId: row.loginid,
        compname: row.bcname,
    }
}

/**
 * Resolve a cloud tenant's Cognito endpoints and its separate DataMaster app client.
 * Missing configuration fails closed; iMATE credentials are never reused.
 */
export async function resolveTenantConfigFromDb(tenantCode: string): Promise<TenantConfig | null> {
    tenantCode = tenantCode.trim().toLowerCase()
    if (!/^[a-z0-9_-]{1,50}$/.test(tenantCode)) return null
    // Check cache first
    const cached = getCachedConfig(tenantCode)
    if (cached) {
        return cached
    }

    try {
        const sql = `
            SELECT bc.bkid,
                   bc.loginid,
                   bc.bcname,
                   bk.cognito_custom_domain,
                   bk.cognito_region,
                   bk.userPoolId
            FROM buscomps bc
                     INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
            WHERE bc.loginid = ?
            LIMIT 1
        `

        const rows = await query<TenantDbRow>(sql, [tenantCode])

        if (rows.length === 0) {
            console.warn('Tenant not found in database', {tenantCode})
            return null
        }

        const row = rows[0]

        const credentials = dataMasterClient(tenantCode)
        if (!credentials || !row.userPoolId || !row.cognito_region || !row.cognito_custom_domain) {
            console.warn('DataMaster Cognito configuration missing', {tenantCode})
            return null
        }
        const domain = row.cognito_custom_domain.trim()
        const hostedUi = new URL(domain.includes('://') ? domain : `https://${domain}`)
        const issuer = `https://cognito-idp.${row.cognito_region}.amazonaws.com/${row.userPoolId}`
        const config: TenantConfig = {
            loginId: row.loginid.toLowerCase(),
            userPoolId: row.userPoolId,
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            region: row.cognito_region,
            issuer,
            authorizationUrl: new URL('/oauth2/authorize', hostedUi).toString(),
            tokenUrl: new URL('/oauth2/token', hostedUi).toString(),
            jwksUri: `${issuer}/.well-known/jwks.json`,
        }

        // Cache result
        setCachedConfig(tenantCode, config)

        return config
    } catch (error) {
        console.error('Database query failed for tenant resolution', {
            tenantCode,
            error: error instanceof Error ? error.message : String(error),
        })
        return null
    }
}

/**
 * List all cloud and isolated tenants from database.
 * Returns tenant summaries (bkid, loginId, bcname, subdom).
 *
 * Query pattern:
 * - JOIN buscomps + bkmasters on bkid
 * - WHERE loginid IS NOT NULL
 * - ORDER BY loginid ASC
 */
export async function listTenantsFromDb(): Promise<TenantSummary[]> {
    try {
        const sql = `
            SELECT bc.bkid,
                   bc.loginid,
                   bc.bcname,
                   bc.subdom
            FROM buscomps bc
                     INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
            WHERE bc.loginid IS NOT NULL
            ORDER BY bc.loginid ASC
        `

        const rows = await query<Omit<TenantSummary, 'loginId' | 'compname'>>(sql)
        return rows.map(normalizeTenantSummary)
    } catch (error) {
        console.error('Database query failed for tenant listing', {
            error: error instanceof Error ? error.message : String(error),
        })
        return []
    }
}

/**
 * Manually invalidate cache entry for a tenant.
 * Useful after credential rotation or tenant config updates.
 */
export function invalidateTenantCache(tenantCode?: string): void {
    if (!tenantCode) {
        tenantCache.clear()
        return
    }

    tenantCache.delete(tenantCode)
}

/**
 * Clear entire tenant cache.
 * Useful for testing or manual cache refresh.
 */
export function clearTenantCache(): void {
    tenantCache.clear()
}
