/**
 * Tenant detection from subdomain or cookie.
 * Supports local dev (*.localhost) and production (*.domain.com).
 */

/**
 * Extract tenant code from subdomain.
 * Returns null if no subdomain detected.
 *
 * Examples:
 * - takdemo.localhost:3000 → "takdemo"
 * - daoanhta.example.com → "daoanhta"
 * - localhost:3000 → null
 * - example.com → null
 *
 * @param hostname - Request hostname (req.headers.host)
 * @returns Tenant code or null
 */
export function extractSubdomainTenant(hostname: string): string | null {
  // Strip port if present
  const host = hostname.split(':')[0]

  // Split by dot
  const parts = host.split('.')

  // No subdomain if only one part (e.g., "localhost")
  if (parts.length < 2) {
    return null
  }

  // Check for *.localhost pattern (local dev)
  if (host.endsWith('.localhost')) {
    return parts[0]
  }

  // Check for *.domain.com pattern (production)
  // Assumes subdomain exists if parts > 2 (e.g., tenant.example.com)
  if (parts.length > 2) {
    return parts[0]
  }

  return null
}

/**
 * Check if hostname is a local development host.
 * Supports localhost, 127.0.0.1, ::1, *.localhost.
 *
 * @param hostname - Request hostname
 * @returns True if local dev host
 */
export function isLocalDevHost(hostname: string): boolean {
  const host = hostname.split(':')[0].toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost')
  )
}

/**
 * Detect tenant from hostname and cookie with priority.
 * Priority: subdomain > cookie > none.
 *
 * @param hostname - Request hostname (req.headers.host)
 * @param cookieTenant - Optional tenant from datamaster_tenant cookie
 * @returns Tenant detection result
 */
export function detectTenant(
  hostname: string,
  cookieTenant?: string
): { tenantCode: string | null; source: 'subdomain' | 'cookie' | 'none' } {
  // Priority 1: Subdomain
  const subdomainTenant = extractSubdomainTenant(hostname)
  if (subdomainTenant) {
    return { tenantCode: subdomainTenant, source: 'subdomain' }
  }

  // Priority 2: Cookie
  if (cookieTenant) {
    return { tenantCode: cookieTenant, source: 'cookie' }
  }

  // Priority 3: None
  return { tenantCode: null, source: 'none' }
}
