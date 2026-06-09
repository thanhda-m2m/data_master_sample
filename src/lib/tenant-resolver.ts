import { query } from './db'

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

// In-memory cache (TTL: 5 minutes)
const cache = new Map<string, { config: TenantConfig; expiresAt: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function resolveTenantConfig(
  tenantCode: string
): Promise<TenantConfig | null> {
  // Check cache
  const cached = cache.get(tenantCode)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config
  }

  // Query database
  const rows = await query<{
    userpoolid: string
    cognito_app_client_id: string
    cognito_region: string
    cognito_enabled: boolean
    cognito_custom_domain: string
    cognito_datamaster_client_id: string
    cognito_app_clients_json: string
    loginid: string
    smartimate_authorize_url: string
    smartimate_token_url: string
    smartimate_validate_url: string
    client_secret: string
  }>(
    `SELECT b.userPoolId AS userpoolid, b.cognito_app_client_id, b.cognito_region,
            b.cognito_enabled, b.cognito_custom_domain, b.cognito_datamaster_client_id,
            b.cognito_app_clients_json, c.loginid,
            b.smartimate_authorize_url, b.smartimate_token_url, b.smartimate_validate_url,
            b.client_secret
     FROM buscomps c
     INNER JOIN bkmasters b ON c.bkid = b.bkid
     WHERE c.loginid = ?
     LIMIT 1`,
    [tenantCode]
  )

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  const smartiMateBaseUrl = process["env"]["SMARTIMATE_BASE_URL"] || 'http://localhost:8080'
  const appClients = parseAppClientsJson(row.cognito_app_clients_json)
  const dataMasterClient = appClients.datamaster || {}
  const clientId =
    dataMasterClient.client_id ||
    row.cognito_datamaster_client_id ||
    row.cognito_app_client_id ||
    process['env'].DATAMASTER_COGNITO_CLIENT_ID ||
    process['env'].SMARTIMATE_CLIENT_ID ||
    'datamaster'
  const clientSecret =
    dataMasterClient.client_secret ||
    row.client_secret ||
    process['env']['DATAMASTER_COGNITO_CLIENT_SECRET'] ||
    process['env']['SMARTIMATE_CLIENT_SECRET'] ||
    'datamaster-local-secret'
  const issuer = row.userpoolid
    ? `https://cognito-idp.${row.cognito_region || 'ap-northeast-1'}.amazonaws.com/${row.userpoolid}`
    : ''
  const cognitoBaseUrl = resolveCognitoBaseUrl(row)
  const jwksUri = row.smartimate_validate_url?.startsWith('https://cognito-idp.')
    ? row.smartimate_validate_url
    : issuer
      ? `${issuer}/.well-known/jwks.json`
      : ''

  const config: TenantConfig = {
    userPoolId: row.userpoolid || '',
    clientId,
    clientSecret,
    region: row.cognito_region || 'ap-northeast-1',
    loginId: row.loginid,
    issuer,
    cognitoAuthorizeUrl: row.smartimate_authorize_url || `${cognitoBaseUrl}/oauth2/authorize`,
    cognitoTokenUrl: row.smartimate_token_url || `${cognitoBaseUrl}/oauth2/token`,
    cognitoUserInfoUrl: row.smartimate_validate_url?.includes('/oauth2/userInfo')
      ? row.smartimate_validate_url
      : `${cognitoBaseUrl}/oauth2/userInfo`,
    jwksUri,
    smartimateAuthorizeUrl: `${smartiMateBaseUrl}/oauth/authorize`,
    smartimateTokenUrl: `${smartiMateBaseUrl}/oauth/token`,
    smartimateValidateUrl: `${smartiMateBaseUrl}/oauth2/validate`,
  }

  // Store in cache
  cache.set(tenantCode, {
    config,
    expiresAt: Date.now() + CACHE_TTL,
  })

  return config
}

export function clearTenantCache(tenantCode?: string) {
  if (tenantCode) {
    cache.delete(tenantCode)
  } else {
    cache.clear()
  }
}

function parseAppClientsJson(raw: string | null | undefined): Record<string, { client_id?: string; client_secret?: string }> {
  if (!raw) {
    return {}
  }

  try {
    const decoded = JSON.parse(raw)
    return decoded && typeof decoded === 'object' ? decoded : {}
  } catch {
    return {}
  }
}

function resolveCognitoBaseUrl(row: { cognito_custom_domain?: string; smartimate_authorize_url?: string; smartimate_token_url?: string }) {
  if (row.smartimate_authorize_url?.startsWith('https://')) {
    const url = new URL(row.smartimate_authorize_url)
    return `${url.protocol}//${url.host}`
  }

  if (row.smartimate_token_url?.startsWith('https://')) {
    const url = new URL(row.smartimate_token_url)
    return `${url.protocol}//${url.host}`
  }

  if (row.cognito_custom_domain) {
    return `https://${row.cognito_custom_domain}`
  }

  return process['env']['COGNITO_HOSTED_UI_BASE_URL'] || 'https://cognito.example.com'
}

export interface TenantSummary {
  bkid: number
  loginId: string
  compname: string
  bcname: string
}

export async function listTenants(): Promise<TenantSummary[]> {
  const rows = await query<{
    bkid: number
    loginid: string
    bcname: string
    cstype: string
    compname: string
  }>(
    `SELECT c.bkid, c.loginid, c.bcname, c.cstype, COALESCE(b.compname, '') AS compname
     FROM buscomps c
     LEFT JOIN bkmasters b ON c.bkid = b.bkid
     ORDER BY c.bkid`,
    []
  )
  return rows.map(r => ({
    bkid: r.bkid,
    loginId: r.loginid || '',
    compname: r.compname || r.bcname || '',
    bcname: r.bcname || '',
  }))
}
