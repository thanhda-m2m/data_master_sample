import { query } from './db'
import { clearTenantCache } from './tenant-resolver'

type TenantSyncBody = {
  login_id?: string
  tenant_id?: string
  userPoolId?: string
  user_pool_id?: string
  issuer?: string
  clientId?: string
  client_id?: string
  clientSecret?: string
  client_secret?: string
  region?: string
  cognito_region?: string
  authorization_endpoint?: string
  token_endpoint?: string
  userinfo_endpoint?: string
  jwks_uri?: string
}

function parseUserPoolId(body: TenantSyncBody) {
  if (body.userPoolId || body.user_pool_id) {
    return body.userPoolId || body.user_pool_id || ''
  }

  const issuer = body.issuer || ''
  const match = issuer.match(/\/([^/]+)$/)
  return match ? match[1] : ''
}

function parseRegion(body: TenantSyncBody) {
  if (body.region || body.cognito_region) {
    return body.region || body.cognito_region || 'ap-northeast-1'
  }

  const issuer = body.issuer || ''
  const match = issuer.match(/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/)
  return match ? match[1] : 'ap-northeast-1'
}

export function isTenantSyncAuthorized(headers: Headers) {
  const secret = process['env']['SMARTIMATE_WEBHOOK_SECRET'] || process['env']['DATAMASTER_API_KEY'] || ''
  const webhookSecret = headers.get('x-webhook-secret') || ''
  const bearer = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

  return Boolean(secret) && (webhookSecret === secret || bearer === secret)
}

export async function syncTenantProvider(body: TenantSyncBody) {
  const loginId = body.login_id || body.tenant_id || ''
  const userPoolId = parseUserPoolId(body)
  const region = parseRegion(body)
  const clientId = body.clientId || body.client_id || ''
  const clientSecret = body.clientSecret || body.client_secret || ''

  if (!loginId || !userPoolId || !clientId) {
    throw new Error('login_id/tenant_id, userPoolId/issuer, and clientId/client_id required')
  }

  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(loginId)) {
    throw new Error('Invalid login_id format')
  }

  if (!/^arn:aws:cognito-idp:/.test(userPoolId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(userPoolId)) {
    throw new Error('Invalid userPoolId format')
  }

  await query(
    `INSERT INTO bkmasters (
       login_id,
       userPoolId,
       cognito_app_client_id,
       cognito_region,
       cognito_enabled,
       smartimate_authorize_url,
       smartimate_token_url,
       smartimate_validate_url,
       client_secret
     )
     VALUES (?, ?, ?, ?, true, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       userPoolId = VALUES(userPoolId),
       cognito_app_client_id = VALUES(cognito_app_client_id),
       cognito_region = VALUES(cognito_region),
       cognito_enabled = true,
       smartimate_authorize_url = VALUES(smartimate_authorize_url),
       smartimate_token_url = VALUES(smartimate_token_url),
       smartimate_validate_url = VALUES(smartimate_validate_url),
       client_secret = VALUES(client_secret),
       updated_at = NOW()`,
    [
      loginId,
      userPoolId,
      clientId,
      region,
      body.authorization_endpoint || '',
      body.token_endpoint || '',
      body.userinfo_endpoint || body.jwks_uri || '',
      clientSecret,
    ]
  )

  clearTenantCache(loginId)

  return { synced: true, login_id: loginId }
}
