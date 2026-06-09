import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { resolveTenantConfig } from "./tenant-resolver"

export interface Session {
  user: {
    id: string
    email: string
    name: string
  }
  tenant: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('session')?.value

    if (!sessionToken) {
      return null
    }

    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    const { payload } = await jwtVerify(sessionToken, secret)

    return {
      user: {
        id: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string,
      },
      tenant: payload.tenant as string,
      accessToken: payload.accessToken as string,
      refreshToken: payload.refreshToken as string,
      expiresAt: payload.expiresAt as number,
    }
  } catch (error) {
    unstable_rethrow(error)
    console.error('Session error:', error)
    return null
  }
}

/**
 * Validate Cognito access token for callers that need a fresh token check.
 * Kept under the old function name so existing demo routes keep compiling.
 */
export async function validateTokenViaSmartiMate(accessToken: string, tenant: string): Promise<{ valid: boolean; user?: { id: string; email: string; name: string; tenant: string }; reason?: string }> {
  const config = await resolveTenantConfig(tenant)
  if (!config) {
    return { valid: false, reason: 'Tenant not found' }
  }

  try {
    const jwks = createRemoteJWKSet(new URL(config.jwksUri))
    const { payload } = await jwtVerify(accessToken, jwks, {
      issuer: config.issuer,
    })

    if (payload.client_id && payload.client_id !== config.clientId) {
      return { valid: false, reason: 'Token client mismatch' }
    }

    return {
      valid: true,
      user: {
        id: (payload.sub || payload.username || '') as string,
        email: (payload.email || '') as string,
        name: (payload.name || payload.username || payload.sub || '') as string,
        tenant,
      },
    }
  } catch (error) {
    console.error('Cognito token validation failed:', error)
    return { valid: false, reason: 'Validation service unavailable' }
  }
}

export { resolveTenantConfig }
