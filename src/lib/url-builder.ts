/**
 * Tenant subdomain URL builder utilities
 */

export const DEFAULT_BASE_DOMAIN = 'localhost:3000'

/**
 * Build full URL with tenant subdomain
 * @param tenant - Tenant code/login ID (alphanumeric, hyphens, underscores only)
 * @param path - Path to append (default: '/')
 * @returns Full URL with tenant subdomain (e.g., http://takdemo.localhost:3000/dashboard)
 * @throws Error if tenant format is invalid
 */
export function buildTenantSubdomainUrl(
    tenant: string,
    path: string = '/'
): string {
    // Validate tenant format to prevent subdomain injection
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
        throw new Error(`Invalid tenant format: ${tenant}`)
    }

    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || DEFAULT_BASE_DOMAIN
    const protocol = baseDomain.includes('localhost') ? 'http' : 'https'

    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    return `${protocol}://${tenant}.${baseDomain}${normalizedPath}`
}

/**
 * Check if running in local development environment
 * @returns true if base domain includes 'localhost'
 */
export function isLocalDev(): boolean {
    const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || ''
    return baseDomain.includes('localhost')
}

/**
 * Extract base domain from full domain (strip subdomain)
 * @param host - Full hostname (e.g., 'takdemo.localhost:3000')
 * @returns Base domain (e.g., 'localhost:3000')
 */
export function extractBaseDomain(host: string): string {
    // Split host and port
    const [hostname, port] = host.split(':')

    // For localhost, strip first subdomain part
    if (hostname.includes('localhost')) {
        const base = hostname.replace(/^[^.]+\./, '')
        return port ? `${base}:${port}` : base
    }

    // For production domains, extract last two parts (domain.com)
    const parts = hostname.split('.')
    const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : hostname

    return port ? `${baseDomain}:${port}` : baseDomain
}
