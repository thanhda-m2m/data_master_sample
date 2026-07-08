/**
 * Tenant detection from subdomain or cookie.
 * Supports local dev (*.localhost) and production (*.domain.com).
 */

function stripPort(hostname: string): string {
    return hostname.split(':')[0].toLowerCase()
}

function configuredBaseHost(): string {
    return (process['env']['NEXT_PUBLIC_BASE_DOMAIN'] || '').trim().toLowerCase()
}

/**
 * Check if hostname is an IP address (IPv4 or IPv6).
 */
function isIpAddress(host: string): boolean {
    // IPv4: 4 numeric parts separated by dots
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/
    // IPv6: contains colons
    const ipv6Pattern = /:/
    return ipv4Pattern.test(host) || ipv6Pattern.test(host)
}

/**
 * Extract tenant code from subdomain.
 * Returns null if no subdomain detected.
 *
 * Examples:
 * - takdemo.localhost:3000 → "takdemo"
 * - daoanhta.example.com → "daoanhta"
 * - localhost:3000 → null
 * - example.com → null
 * - 10.0.10.12 → null (IP addresses are not subdomains)
 *
 * @param hostname - Request hostname (req.headers.host)
 * @returns Tenant code or null
 */
export function extractSubdomainTenant(hostname: string): string | null {
    const host = stripPort(hostname)
    const baseHost = configuredBaseHost()

    // IP addresses should not be treated as subdomains
    if (isIpAddress(host)) {
        return null
    }

    if (baseHost) {
        if (host === baseHost) {
            return null
        }

        const suffix = `.${baseHost}`
        if (host.endsWith(suffix)) {
            const subdomain = host.slice(0, -suffix.length)
            return subdomain ? subdomain.split('.')[0] : null
        }
    }

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
    const host = stripPort(hostname)
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
        return {tenantCode: subdomainTenant, source: 'subdomain'}
    }

    // Priority 2: Cookie
    if (cookieTenant) {
        return {tenantCode: cookieTenant, source: 'cookie'}
    }

    // Priority 3: None
    return {tenantCode: null, source: 'none'}
}

/**
 * Resolve tenant for an explicit sign-in request.
 * A fresh tenant selection from the query string must beat stale cookie state.
 * Path-based only: query > cookie > none.
 */
export function resolveSigninTenant(
    hostname: string,
    queryTenant?: string | null,
    cookieTenant?: string
): { tenantCode: string | null; source: 'query' | 'cookie' | 'none' } {
    if (queryTenant) {
        return {tenantCode: queryTenant, source: 'query'}
    }

    if (cookieTenant) {
        return {tenantCode: cookieTenant, source: 'cookie'}
    }

    return {tenantCode: null, source: 'none'}
}
