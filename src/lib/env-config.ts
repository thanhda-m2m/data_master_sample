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

function tenantEnvKey(tenantCode: string) {
  return tenantCode.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function envValue(...names: string[]) {
  for (const name of names) {
    const value = process['env'][name]
    if (value) {
      return value
    }
  }
  return ''
}

function configuredTenant() {
  return process['env']['DATAMASTER_TENANT_LOGIN_ID'] || ''
}

function cognitoBaseUrl() {
  const customDomain = envValue('DATAMASTER_COGNITO_CUSTOM_DOMAIN', 'COGNITO_CUSTOM_DOMAIN')
  if (customDomain) {
    return customDomain.startsWith('http') ? customDomain : `https://${customDomain}`
  }

  return envValue('COGNITO_HOSTED_UI_BASE_URL') || 'https://cognito.example.com'
}

export async function resolveTenantConfig(tenantCode: string): Promise<TenantConfig | null> {
  const loginId = configuredTenant()
  if (!loginId || tenantCode !== loginId) {
    return null
  }

  const tenantKey = tenantEnvKey(loginId)
  const region = envValue('DATAMASTER_COGNITO_REGION', 'AWS_REGION') || 'ap-northeast-1'
  const userPoolId = envValue('DATAMASTER_COGNITO_USER_POOL_ID', 'COGNITO_USER_POOL_ID')
  const clientId = envValue(
    `DATAMASTER_COGNITO_CLIENT_ID_${tenantKey}`,
    'DATAMASTER_COGNITO_CLIENT_ID',
    'SMARTIMATE_CLIENT_ID'
  )
  const clientSecret = envValue(
    `DATAMASTER_COGNITO_CLIENT_SECRET_${tenantKey}`,
    'DATAMASTER_COGNITO_CLIENT_SECRET',
    'SMARTIMATE_CLIENT_SECRET'
  )
  const smartiMateBaseUrl = envValue('SMARTIMATE_BASE_URL') || 'http://localhost:8080'
  const hostedUiBaseUrl = cognitoBaseUrl()
  const issuer = userPoolId ? `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` : ''

  return {
    userPoolId,
    clientId,
    clientSecret,
    region,
    loginId,
    issuer,
    cognitoAuthorizeUrl: envValue('COGNITO_AUTHORIZE_URL') || `${hostedUiBaseUrl}/oauth2/authorize`,
    cognitoTokenUrl: envValue('COGNITO_TOKEN_URL') || `${hostedUiBaseUrl}/oauth2/token`,
    cognitoUserInfoUrl: envValue('COGNITO_USERINFO_URL') || `${hostedUiBaseUrl}/oauth2/userInfo`,
    jwksUri: envValue('COGNITO_JWKS_URI') || (issuer ? `${issuer}/.well-known/jwks.json` : ''),
    smartimateAuthorizeUrl: envValue('SMARTIMATE_AUTHORIZE_URL') || `${smartiMateBaseUrl}/oauth2/authorize`,
    smartimateTokenUrl: envValue('SMARTIMATE_TOKEN_URL') || `${smartiMateBaseUrl}/oauth2/token`,
    smartimateValidateUrl: envValue('SMARTIMATE_VALIDATE_URL') || `${smartiMateBaseUrl}/oauth2/validate`,
  }
}

export async function listTenants(): Promise<TenantSummary[]> {
  const loginId = configuredTenant()
  if (!loginId) {
    return []
  }

  const tenantName = process['env']['DATAMASTER_TENANT_NAME'] || loginId
  return [{
    bkid: 1,
    loginId,
    compname: tenantName,
    bcname: tenantName,
  }]
}
