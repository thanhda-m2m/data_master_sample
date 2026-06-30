import type {NextRequest} from 'next/server'
import {NextResponse} from 'next/server'
import {jwtVerify} from 'jose'
import {detectTenant} from './lib/tenant-detection'
import {listTenantsFromDb} from './lib/tenant-resolver'
import {runWithTenant} from './lib/tenant-context'

// Tenant allowlist cache with 5-min TTL
interface TenantAllowlistCache {
    allowlist: Set<string>
    expiresAt: number
}

let tenantAllowlistCache: TenantAllowlistCache | null = null
const ALLOWLIST_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Build tenant allowlist from database with 5-min TTL cache.
 * Returns Set of valid tenant codes (buscomps.loginid).
 */
async function getTenantAllowlist(): Promise<Set<string>> {
    // Return cached allowlist if not expired
    if (tenantAllowlistCache && Date.now() < tenantAllowlistCache.expiresAt) {
        return tenantAllowlistCache.allowlist
    }

    // Query database for all tenants
    const tenants = await listTenantsFromDb()
    const allowlist = new Set(tenants.map((t) => t.loginid))

    // Cache result with TTL
    tenantAllowlistCache = {
        allowlist,
        expiresAt: Date.now() + ALLOWLIST_CACHE_TTL_MS,
    }

    return allowlist
}

export async function proxy(request: NextRequest) {
    const {pathname} = request.nextUrl
    const hostname = request.headers.get('host') || ''

    // Skip tenant validation for host.docker.internal (Docker bridge network)
    if (hostname.includes('host.docker.internal')) {
        return NextResponse.next()
    }

    // Detect tenant from subdomain or cookie
    const cookieTenant = request.cookies.get('datamaster_tenant')?.value
    const {tenantCode, source} = detectTenant(hostname, cookieTenant)

    // Validate tenant against allowlist
    let tenant = ''
    if (tenantCode) {
        const allowlist = await getTenantAllowlist()
        if (allowlist.has(tenantCode)) {
            tenant = tenantCode
        } else {
            // Invalid tenant code - clear cookie and redirect to root
            console.warn('Invalid tenant code rejected', {tenantCode, source})
            const response = NextResponse.redirect(new URL('/', request.url))
            response.cookies.delete('datamaster_tenant')
            return response
        }
    }

    // Validate session cookie
    const sessionCookie = request.cookies.get('session')?.value
    let isLoggedIn = false

    if (sessionCookie) {
        try {
            const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
            await jwtVerify(sessionCookie, secret)
            isLoggedIn = true
        } catch {
            isLoggedIn = false
        }
    }

    // Public routes (always accessible)
    if (pathname === '/') {
        return NextResponse.next()
    }

    // Auth routes + server-to-server tenant sync routes (always accessible).
    if (
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/admin') ||
        pathname === '/api/oauth/register-provider' ||
        pathname.startsWith('/auth') ||
        pathname === '/api/test-db' ||
        pathname === '/api/input-support-assist'
    ) {
        return NextResponse.next()
    }

    // Static assets
    if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
        return NextResponse.next()
    }

    // Protected routes - redirect to signin if no session
    if (!isLoggedIn) {
        if (!tenant) {
            return NextResponse.redirect(new URL('/', request.url))
        }

        const signinUrl = new URL('/api/auth/signin', request.url)
        signinUrl.searchParams.set('tenant', tenant)
        signinUrl.searchParams.set('callbackUrl', pathname)
        return NextResponse.redirect(signinUrl)
    }

    // Bind tenant context to AsyncLocalStorage for request lifecycle
    // This allows route handlers to access tenant via getCurrentTenant()
    if (tenant) {
        return runWithTenant(tenant, () => NextResponse.next())
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
