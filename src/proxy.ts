import type {NextRequest} from 'next/server'
import {NextResponse} from 'next/server'
import {jwtVerify} from 'jose'
import {resolveTenantConfigFromDb} from './lib/tenant-resolver'
import {runWithTenant} from './lib/tenant-context'

const TENANT_PATH_FORMAT = /^[a-zA-Z0-9_-]{1,50}$/
const RESERVED_PATH_SEGMENTS = new Set(['api', 'auth', 'dashboard', '_next', 'favicon.ico'])

function extractPathTenant(pathname: string): string | null {
    const firstSegment = pathname.split('/').filter(Boolean)[0]
    if (!firstSegment || RESERVED_PATH_SEGMENTS.has(firstSegment)) {
        return null
    }

    try {
        const tenantCode = decodeURIComponent(firstSegment)
        return TENANT_PATH_FORMAT.test(tenantCode) ? tenantCode : null
    } catch {
        return null
    }
}

export async function proxy(request: NextRequest) {
    const {pathname} = request.nextUrl
    const hostname = request.headers.get('host') || ''

    // Skip tenant validation for host.docker.internal (Docker bridge network)
    if (hostname.includes('host.docker.internal')) {
        return NextResponse.next()
    }

    // Detect tenant from path or cookie fallback.
    // Priority: path segment > cookie fallback.
    const cookieTenant = request.cookies.get('datamaster_tenant')?.value
    const pathTenant = extractPathTenant(pathname)?.toLowerCase()
    const tenantCode = pathTenant || cookieTenant
    const source = pathTenant ? 'path' : cookieTenant ? 'cookie' : 'none'

    // Validate tenant with a direct database lookup.
    let tenant = ''
    if (tenantCode) {
        console.log("current tenant code", tenantCode);
        const tenantConfig = await resolveTenantConfigFromDb(tenantCode)
        if (tenantConfig) {
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
        pathname === '/api/input-support-assist' ||
        pathname === '/api/v1/input-support/input-support-assist'
    ) {
        return NextResponse.next()
    }

    // Static assets
    if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
        return NextResponse.next()
    }

    const isTenantRootPath = Boolean(pathTenant && pathname.split('/').filter(Boolean).length === 1)

    // Protected routes - redirect to signin if no session
    if (!isLoggedIn) {
        if (tenant && isTenantRootPath) {
            return NextResponse.next()
        }

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
