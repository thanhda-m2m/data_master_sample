import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { jwtVerify } from 'jose'
import { resolveTenantConfig } from './env-config'

export interface Session {
  user: {
    id: string
    email: string
    name: string
  }
  tenant: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

type ValidationCacheEntry = {
  expiresAt: number
  result: {
    valid: boolean
    user?: { id: string; email: string; name: string; tenant: string }
    reason?: string
  }
}

const validationCache = new Map<string, ValidationCacheEntry>()

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
      accessToken: typeof payload.accessToken === 'string' ? payload.accessToken : undefined,
      refreshToken: typeof payload.refreshToken === 'string' ? payload.refreshToken : undefined,
      expiresAt: typeof payload.expiresAt === 'number' ? payload.expiresAt : undefined,
    }
  } catch (error) {
    unstable_rethrow(error)
    console.error('Session error:', error)
    return null
  }
}

/**
 * Validate access token through Smart iMATE so revocation/tenant policy stays centralized.
 */
export async function validateTokenViaSmartiMate(accessToken: string, tenant: string): Promise<{ valid: boolean; user?: { id: string; email: string; name: string; tenant: string }; reason?: string }> {
  const config = await resolveTenantConfig(tenant)
  if (!config) {
    return { valid: false, reason: 'Tenant not found' }
  }

  const cacheKey = `${tenant}:${accessToken}`
  const cached = validationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  try {
    const response = await fetch(config.smartimateValidateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: accessToken, tenant }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return { valid: false, reason: `Validation service HTTP ${response.status}` }
    }

    const result = await response.json() as {
      valid?: boolean
      user?: { sub?: string; id?: string; email?: string; name?: string; username?: string }
      reason?: string
    }
    const normalized = result.valid
      ? {
          valid: true,
          user: {
            id: result.user?.id || result.user?.sub || result.user?.username || '',
            email: result.user?.email || '',
            name: result.user?.name || result.user?.username || result.user?.email || '',
            tenant,
          },
        }
      : { valid: false, reason: result.reason || 'Token invalid' }

    if (normalized.valid) {
      validationCache.set(cacheKey, {
        expiresAt: Date.now() + 60_000,
        result: normalized,
      })
    }

    return normalized
  } catch (error) {
    console.error('Smart iMATE token validation failed:', error)
    return { valid: false, reason: 'Validation service unavailable' }
  }
}

export { resolveTenantConfig }
