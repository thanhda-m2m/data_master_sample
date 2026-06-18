type TenantSyncBody = {
    login_id?: string
    tenant_id?: string
    userPoolId?: string
    user_pool_id?: string
    issuer?: string
    clientId?: string
    client_id?: string
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

    if (!loginId || !userPoolId) {
        throw new Error('login_id/tenant_id and userPoolId/issuer required')
    }

    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(loginId)) {
        throw new Error('Invalid login_id format')
    }

    if (!/^arn:aws:cognito-idp:/.test(userPoolId) && !/^[a-zA-Z0-9_-]{1,64}$/.test(userPoolId)) {
        throw new Error('Invalid userPoolId format')
    }

    return {synced: false, env_configured: true, login_id: loginId, userPoolId, region}
}
