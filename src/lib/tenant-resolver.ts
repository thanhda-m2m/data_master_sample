/**
 * Database-driven tenant resolver with LRU cache.
 * Queries buscomps + bkmasters tables for OAuth credentials.
 */

import { query } from './db'
import type { TenantConfig, TenantSummary, CognitoCredentials } from './tenant-types'

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
  cognito_credentials: string | CognitoCredentials // JSON string or parsed object
  cognito_region: string
  userPoolId: string
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]
    if (value) {
      return value
    }
  }

  return ''
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

/**
 * Parse cognito_credentials JSON and extract datamaster app client credentials.
 * Returns null if JSON malformed or missing required keys.
 * Handles both string (from raw query) and object (from mysql2 JSON type).
 */
function parseCognitoCredentials(data: string | CognitoCredentials): { clientId: string; clientSecret: string } | null {
  try {
    let parsed: CognitoCredentials

    // mysql2 returns JSON columns as objects, not strings
    if (typeof data === 'string') {
      parsed = JSON.parse(data)
    } else if (typeof data === 'object' && data !== null) {
      parsed = data
    } else {
      console.error('Invalid cognito_credentials type', { type: typeof data })
      return null
    }

    const clientId = parsed.datamaster?.app_client_id
    const clientSecret = parsed.datamaster?.app_client_secret

    if (!clientId || !clientSecret) {
      console.error('Missing required keys in cognito_credentials JSON', {
        hasDatamaster: !!parsed.datamaster,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
      })
      return null
    }

    return { clientId, clientSecret }
  } catch (error) {
    console.error('Failed to parse cognito_credentials JSON', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Build OAuth URLs from region and userPoolId.
 */
function envKey(...parts: string[]) {
  return parts.join('_')
}

function cognitoHostedUiBaseUrl() {
  const customDomain = envValue(
    envKey('DATAMASTER', 'COGNITO', 'CUSTOM', 'DOMAIN'),
    envKey('COGNITO', 'CUSTOM', 'DOMAIN')
  )
  if (customDomain) {
    return customDomain.startsWith('http') ? customDomain : `https://${customDomain}`
  }

  return envValue(envKey('COGNITO', 'HOSTED', 'UI', 'BASE', 'URL')) || 'https://cognito.example.com'
}

function buildOAuthUrls(region: string, userPoolId: string) {
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
  const hostedUiBaseUrl = cognitoHostedUiBaseUrl().replace(/\/+$/, '')

  return {
    issuer,
    authorizationUrl: envValue(envKey('COGNITO', 'AUTHORIZE', 'URL')) || `${hostedUiBaseUrl}/oauth2/authorize`,
    tokenUrl: envValue(envKey('COGNITO', 'TOKEN', 'URL')) || `${hostedUiBaseUrl}/oauth2/token`,
    userInfoUrl: envValue(envKey('COGNITO', 'USERINFO', 'URL')) || `${hostedUiBaseUrl}/oauth2/userInfo`,
  }
}

function buildSmartiMateUrls() {
  const publicBaseUrl = (envValue('SMARTIMATE_BASE_URL') || 'http://localhost:8080').replace(/\/+$/, '')
  const internalBaseUrl = (envValue('SMARTIMATE_INTERNAL_BASE_URL') || publicBaseUrl).replace(/\/+$/, '')

  return {
    smartimateAuthorizeUrl: envValue('SMARTIMATE_AUTHORIZE_URL') || `${publicBaseUrl}/oauth2/authorize`,
    smartimateTokenUrl: envValue('SMARTIMATE_TOKEN_URL') || `${internalBaseUrl}/oauth2/token`,
    smartimateValidateUrl: envValue('SMARTIMATE_VALIDATE_URL') || `${internalBaseUrl}/oauth2/validate`,
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
 * Resolve tenant configuration from database by tenant code (loginId).
 *
 * Query pattern:
 * - JOIN buscomps + bkmasters on bkid
 * - WHERE loginid = ? AND cognito_credentials IS NOT NULL
 * - Parse JSON cognito_credentials
 * - Extract $.datamaster.app_client_id and $.datamaster.app_client_secret
 *
 * Returns null if:
 * - Tenant not found in database
 * - cognito_credentials JSON is malformed
 * - Required keys missing in JSON
 * - Database query fails
 *
 * Cache: 10-min TTL, max 100 entries with LRU eviction.
 */
export async function resolveTenantConfigFromDb(tenantCode: string): Promise<TenantConfig | null> {
  // Check cache first
  const cached = getCachedConfig(tenantCode)
  if (cached) {
    return cached
  }

  try {
    const sql = `
      SELECT
        bc.bkid,
        bc.loginid,
        bc.bcname,
        bk.cognito_credentials,
        bk.cognito_region,
        bk.userPoolId
      FROM buscomps bc
      INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
      WHERE bc.loginid = ?
        AND bk.cognito_credentials IS NOT NULL
      LIMIT 1
    `

    const rows = await query<TenantDbRow>(sql, [tenantCode])

    if (rows.length === 0) {
      console.warn('Tenant not found in database', { tenantCode })
      return null
    }

    const row = rows[0]

    // Parse JSON credentials
    const credentials = parseCognitoCredentials(row.cognito_credentials)
    if (!credentials) {
      return null
    }

    // Validate required fields
    if (!row.cognito_region || !row.userPoolId) {
      console.error('Missing required tenant fields', {
        tenantCode,
        hasRegion: !!row.cognito_region,
        hasUserPoolId: !!row.userPoolId,
      })
      return null
    }

    // Build OAuth URLs
    const oauthUrls = buildOAuthUrls(row.cognito_region, row.userPoolId)
    const smartiMateUrls = buildSmartiMateUrls()

    const config: TenantConfig = {
      loginId: row.loginid,
      userPoolId: row.userPoolId,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      region: row.cognito_region,
      cognitoAuthorizeUrl: oauthUrls.authorizationUrl,
      cognitoTokenUrl: oauthUrls.tokenUrl,
      cognitoUserInfoUrl: oauthUrls.userInfoUrl,
      jwksUri: `${oauthUrls.issuer}/.well-known/jwks.json`,
      ...smartiMateUrls,
      ...oauthUrls,
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
 * List all tenants from database with non-null cognito_credentials.
 * Returns tenant summaries (bkid, loginId, bcname, subdom).
 *
 * Query pattern:
 * - JOIN buscomps + bkmasters on bkid
 * - WHERE loginid IS NOT NULL AND cognito_credentials IS NOT NULL
 * - ORDER BY loginid ASC
 */
export async function listTenantsFromDb(): Promise<TenantSummary[]> {
  try {
    const sql = `
      SELECT
        bc.bkid,
        bc.loginid,
        bc.bcname,
        bc.subdom
      FROM buscomps bc
      INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
      WHERE bc.loginid IS NOT NULL
        AND bk.cognito_credentials IS NOT NULL
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
