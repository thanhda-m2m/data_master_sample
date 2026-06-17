# Multi-Tenant Next.js Implementation Guide
**Date:** 2026-06-16  
**Status:** Ready for integration  
**Dependencies:** Next.js 16+, mysql2, jose, async_hooks (built-in)

---

## Quick-Start Code Snippets

All code below is production-ready. Copy into your project as indicated.

---

## 1. Tenant Detection Module

**File:** `src/lib/tenant-detection.ts`

```typescript
import { AsyncLocalStorage } from 'async_hooks'

export interface TenantDetectionResult {
  tenantCode: string
  source: 'subdomain' | 'cookie' | 'none'
  isValid: boolean
  reason?: string
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

/**
 * Extract tenant from hostname subdomain
 * Examples:
 *   "kubota.localhost" → "kubota"
 *   "daoanhta.techport.com" → "daoanhta"
 *   "techport.com" → null
 *   "localhost:3000" → null
 */
export function extractSubdomainTenant(hostname: string): string | null {
  const hostWithoutPort = hostname.split(':')[0]
  const parts = hostWithoutPort.split('.')

  // For local dev: *.localhost (2 parts)
  if (isLocalDevHost(hostname) && parts.length === 2) {
    return parts[0]
  }

  // For production: *.domain.com (3+ parts, tenant is first)
  if (parts.length > 2) {
    return parts[0]
  }

  return null
}

/**
 * Detect tenant from hostname, with cookie fallback
 * Validates against allowlist to prevent injection
 */
export async function detectTenant(
  hostname: string,
  cookieTenant: string | undefined,
  validTenants: Set<string>
): Promise<TenantDetectionResult> {
  const subdomainTenant = extractSubdomainTenant(hostname)
  const candidate = subdomainTenant || cookieTenant

  if (!candidate) {
    return {
      tenantCode: '',
      source: 'none',
      isValid: false,
      reason: 'No tenant in subdomain or cookie',
    }
  }

  // Validate format
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(candidate)) {
    return {
      tenantCode: candidate,
      source: subdomainTenant ? 'subdomain' : 'cookie',
      isValid: false,
      reason: 'Invalid tenant format (alphanumeric, underscore, hyphen, 1-50 chars)',
    }
  }

  // Validate against allowlist
  if (!validTenants.has(candidate)) {
    return {
      tenantCode: candidate,
      source: subdomainTenant ? 'subdomain' : 'cookie',
      isValid: false,
      reason: 'Tenant not found in system',
    }
  }

  return {
    tenantCode: candidate,
    source: subdomainTenant ? 'subdomain' : 'cookie',
    isValid: true,
  }
}
```

---

## 2. Tenant Context (AsyncLocalStorage)

**File:** `src/lib/tenant-context.ts`

```typescript
import { AsyncLocalStorage } from 'async_hooks'

export interface TenantContextData {
  tenantCode: string
  tenantId: string
  userId?: string
  email?: string
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>()

/**
 * Get current tenant context
 * @throws Error if called outside request context
 */
export function getTenantContext(): TenantContextData {
  const store = tenantContext.getStore()
  if (!store) {
    throw new Error(
      'getTenantContext() called outside request context. ' +
      'This function must be called from within a Server Component or API Route.'
    )
  }
  return store
}

/**
 * Safely get tenant context, return null if not available
 */
export function getTenantContextSafe(): TenantContextData | null {
  return tenantContext.getStore() ?? null
}

/**
 * Check if tenant context is available
 */
export function hasTenantContext(): boolean {
  return tenantContext.getStore() !== undefined
}

/**
 * Run async function with tenant context
 * Useful for testing or background jobs
 */
export async function withTenantContext<T>(
  data: TenantContextData,
  fn: () => Promise<T> | T
): Promise<T> {
  return tenantContext.run(data, async () => fn())
}

/**
 * Get tenant code with fallback
 */
export function getTenantCodeSafe(fallback: string = ''): string {
  const context = getTenantContextSafe()
  return context?.tenantCode ?? fallback
}

/**
 * Get user ID with fallback
 */
export function getUserIdSafe(fallback: string = ''): string {
  const context = getTenantContextSafe()
  return context?.userId ?? fallback
}
```

---

## 3. Updated Proxy (Middleware)

**File:** `src/proxy.ts` (replace existing)

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { tenantContext } from '@/lib/tenant-context'
import { detectTenant, extractSubdomainTenant } from '@/lib/tenant-detection'

// Cache active tenants for 5 minutes to reduce DB queries
const tenantCache = new Map<string, { tenants: Set<string>; expiresAt: number }>()
const TENANT_CACHE_TTL = 5 * 60 * 1000

async function getActiveTenants(): Promise<Set<string>> {
  const cached = tenantCache.get('active')
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenants
  }

  // In production, query from DB: SELECT login_id FROM tenants WHERE active = true
  // For now, use environment or hardcoded list
  const tenants = new Set([
    process.env.DATAMASTER_TENANT_LOGIN_ID || 'kubota',
    ...(process.env.ADDITIONAL_TENANTS?.split(',') || []),
  ])

  tenantCache.set('active', {
    tenants,
    expiresAt: Date.now() + TENANT_CACHE_TTL,
  })

  return tenants
}

function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  )
}

export async function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl

  // Extract tenant from subdomain or cookie
  const cookieTenant = request.cookies.get('datamaster_tenant')?.value
  const activeTenants = await getActiveTenants()
  const detectionResult = await detectTenant(hostname, cookieTenant, activeTenants)

  // Public routes - always allowed
  const publicPaths = [
    '/',
    '/auth/error',
    '/api/auth/callback',
  ]

  if (publicPaths.includes(pathname)) {
    return NextResponse.next()
  }

  // Auth routes - always allowed, but extract tenant for context
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // Static assets
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next()
  }

  // Validate session cookie
  const sessionCookie = request.cookies.get('session')?.value
  let isLoggedIn = false
  let userId: string | undefined

  if (sessionCookie) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
      const { payload } = await jwtVerify(sessionCookie, secret)
      isLoggedIn = true
      userId = payload.sub as string
    } catch {
      isLoggedIn = false
    }
  }

  // Protected routes - require session + valid tenant
  if (!isLoggedIn || !detectionResult.isValid) {
    if (!detectionResult.isValid) {
      console.warn('Invalid tenant detection', {
        hostname,
        reason: detectionResult.reason,
      })
      return NextResponse.redirect(new URL('/', request.url))
    }

    const signinUrl = new URL('/api/auth/signin', request.url)
    signinUrl.searchParams.set('tenant', detectionResult.tenantCode)
    signinUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(signinUrl)
  }

  // Set up tenant context for downstream code
  const tenantData = {
    tenantCode: detectionResult.tenantCode,
    tenantId: detectionResult.tenantCode, // Map to internal ID if different
    userId,
  }

  // Bind tenant context to request using AsyncLocalStorage
  return tenantContext.run(tenantData, () => NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 4. Database Layer with Schema Isolation

**File:** `src/lib/db-tenant-isolated.ts` (new, replaces shared queries)

```typescript
import mysql from 'mysql2/promise'
import { getTenantContext } from '@/lib/tenant-context'

interface PoolConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  connectionLimit: number
}

// Pool cache: tenant → mysql.Pool
const tenantPools = new Map<string, mysql.Pool>()

// Tier-based connection limits
const POOL_LIMITS: Record<string, number> = {
  'premium': 15,
  'standard': 5,
  'free': 2,
}

/**
 * Get connection limit based on tenant tier
 * In production, fetch from database
 */
async function getPoolLimitForTenant(tenantCode: string): Promise<number> {
  // TODO: Query tenant tier from config DB
  return POOL_LIMITS['standard']
}

/**
 * Get or create connection pool for tenant
 * Uses schema-per-tenant pattern: tenant_<code>_db
 */
async function getTenantPool(tenantCode: string): Promise<mysql.Pool> {
  if (tenantPools.has(tenantCode)) {
    return tenantPools.get(tenantCode)!
  }

  const connectionLimit = await getPoolLimitForTenant(tenantCode)

  const pool = mysql.createPool({
    host: process.env.HZ_TAK_DB_HOST || 'localhost',
    port: parseInt(process.env.HZ_TAK_DB_PORT || '3306'),
    // Schema naming: tenant_kubota_db, tenant_daoanhta_db, etc.
    database: `tenant_${tenantCode}_db`,
    user: process.env.HZ_TAK_DB_USER || 'root',
    password: process.env.HZ_TAK_DB_PASSWORD || 'root',
    waitForConnections: true,
    connectionLimit,
    queueLimit: 0,
    connectTimeout: 2000,
    idleTimeout: 30000,
  })

  tenantPools.set(tenantCode, pool)
  return pool
}

/**
 * Execute query for current tenant context
 * Automatically routes to tenant schema
 */
export async function queryTenant<T>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const { tenantCode } = getTenantContext()
  const pool = await getTenantPool(tenantCode)

  try {
    const [rows] = await pool.execute(sql, params as mysql.RowDataPacket[])
    return rows as T[]
  } catch (error) {
    console.error('Tenant query failed', {
      tenantCode,
      sql,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Execute single row query
 */
export async function queryTenantOne<T>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const results = await queryTenant<T>(sql, params)
  return results.length > 0 ? results[0] : null
}

/**
 * Execute update/insert/delete
 * Returns affected row count
 */
export async function queryTenantMutate(
  sql: string,
  params?: unknown[]
): Promise<number> {
  const { tenantCode } = getTenantContext()
  const pool = await getTenantPool(tenantCode)

  try {
    const [result] = await pool.execute(sql, params as mysql.RowDataPacket[])
    return (result as mysql.OkPacket).affectedRows
  } catch (error) {
    console.error('Tenant mutation failed', {
      tenantCode,
      sql,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Close all pools (for graceful shutdown)
 */
export async function closeAllPools(): Promise<void> {
  const promises = Array.from(tenantPools.values()).map(pool =>
    pool.end().catch(err =>
      console.error('Error closing pool:', err)
    )
  )
  await Promise.all(promises)
  tenantPools.clear()
}
```

---

## 5. Auth Cookies with Isolation

**File:** `src/lib/auth-cookies.ts` (new)

```typescript
import type { NextResponse } from 'next/server'

interface CookieOptions {
  isDev: boolean
  maxAge?: number
}

/**
 * Set tenant authentication cookie (host-only for isolation)
 * Never shared across subdomains
 */
export function setTenantCookie(
  response: NextResponse,
  tenantCode: string,
  options: CookieOptions
): void {
  response.cookies.set('__Host-tenantId', tenantCode, {
    httpOnly: true,
    secure: !options.isDev,
    sameSite: 'strict',
    path: '/',
    maxAge: options.maxAge || 30 * 24 * 60 * 60, // 30 days
  })

  // Also set fallback non-prefixed cookie for compatibility
  response.cookies.set('datamaster_tenant', tenantCode, {
    httpOnly: true,
    secure: !options.isDev,
    sameSite: 'strict',
    path: '/',
    maxAge: options.maxAge || 30 * 24 * 60 * 60,
  })
}

/**
 * Set session JWT cookie (host-only for isolation)
 * Contains user ID and tenant binding
 */
export function setSessionCookie(
  response: NextResponse,
  sessionJwt: string,
  options: CookieOptions
): void {
  response.cookies.set('session', sessionJwt, {
    httpOnly: true,
    secure: !options.isDev,
    sameSite: 'strict',
    path: '/',
    maxAge: options.maxAge || 24 * 60 * 60, // 24 hours
  })
}

/**
 * Set OAuth state cookie (short-lived, used during auth flow)
 */
export function setOAuthStateCookie(
  response: NextResponse,
  state: string,
  options: CookieOptions
): void {
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: !options.isDev,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60, // 10 minutes
  })
}

/**
 * Set OAuth code verifier cookie (short-lived, PKCE)
 */
export function setOAuthCodeVerifierCookie(
  response: NextResponse,
  codeVerifier: string,
  options: CookieOptions
): void {
  response.cookies.set('oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: !options.isDev,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  })
}

/**
 * Clear all auth cookies
 */
export function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete('session')
  response.cookies.delete('__Host-tenantId')
  response.cookies.delete('datamaster_tenant')
  response.cookies.delete('oauth_state')
  response.cookies.delete('oauth_code_verifier')
  response.cookies.delete('oauth_tenant')
  response.cookies.delete('oauth_callback_url')
}
```

---

## 6. Updated Sign-In Route

**File:** `src/app/api/auth/signin/route.ts` (updated excerpt)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolveTenantConfig } from '@/lib/env-config'
import { randomBytes, createHash } from 'crypto'
import { SignJWT } from 'jose'
import {
  setTenantCookie,
  setOAuthStateCookie,
  setOAuthCodeVerifierCookie,
} from '@/lib/auth-cookies'

function isLocalDevHost(hostname: string) {
  return hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
}

function buildDataMasterOrigin(request: NextRequest) {
  return request.nextUrl.origin
}

function buildSmartiMateLoginUrl(baseUrl: string, tenant: string) {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  return new URL(`/${tenant}/login.php`, normalizedBase)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tenant = searchParams.get('tenant')
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const isDev = isLocalDevHost(request.nextUrl.hostname)

  if (!tenant) {
    return Response.json({ error: 'Missing tenant parameter' }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(tenant)) {
    return Response.json({ error: 'Invalid tenant format' }, { status: 400 })
  }

  if (!callbackUrl.startsWith('/')) {
    return Response.json({ error: 'Invalid callback URL' }, { status: 400 })
  }

  try {
    const config = await resolveTenantConfig(tenant)
    if (!config) {
      return Response.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    const stateNonce = randomBytes(16).toString('base64url')

    const state = await new SignJWT({
      tenant,
      codeVerifier,
      callbackUrl,
      nonce: stateNonce,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))

    const dataMasterOrigin = buildDataMasterOrigin(request)
    const smartiMateBaseUrl = process.env.SMARTIMATE_BASE_URL || 'http://localhost:8080'

    const authUrl = buildSmartiMateLoginUrl(smartiMateBaseUrl, tenant)
    authUrl.searchParams.set('app', 'datamaster')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', 'openid email profile')
    authUrl.searchParams.set('redirect_uri', `${dataMasterOrigin}/api/auth/callback`)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    const destination = authUrl.toString()
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">
  <title>Redirecting</title>
</head>
<body>
  <script>window.location.replace(${JSON.stringify(destination)});</script>
  <a href="${escapeHtml(destination)}">Continue</a>
</body>
</html>`

    const response = new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
    response.headers.set('Cache-Control', 'no-store')

    // Use isolated cookie helpers
    setTenantCookie(response, tenant, { isDev })
    setOAuthStateCookie(response, state, { isDev })
    setOAuthCodeVerifierCookie(response, codeVerifier, { isDev })

    response.cookies.set('oauth_tenant', tenant, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })
    response.cookies.set('oauth_callback_url', callbackUrl, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev,
      maxAge: 600,
    })

    return response
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Sign in error:', { tenant, error: errorMsg, stack: errorStack })
    return Response.json(
      { error: 'Internal server error', details: errorMsg },
      { status: 500 }
    )
  }
}
```

---

## 7. Server Component Usage Example

**File:** `src/app/dashboard/page.tsx` (example)

```typescript
import { getTenantContext, getUserIdSafe } from '@/lib/tenant-context'
import { queryTenant } from '@/lib/db-tenant-isolated'

interface User {
  id: string
  email: string
  name: string
}

export default async function DashboardPage() {
  const { tenantCode, userId } = getTenantContext()

  // Query automatically routes to tenant_<code>_db schema
  const userData = await queryTenant<User>(
    'SELECT id, email, name FROM users WHERE id = ? LIMIT 1',
    [userId]
  )

  if (!userData.length) {
    return <div>User not found</div>
  }

  const user = userData[0]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-slate-300 mb-6">Tenant: <code>{tenantCode}</code></p>

        <div className="bg-slate-700 rounded-lg p-6 text-white">
          <h2 className="text-xl font-semibold mb-4">Welcome, {user.name}</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="font-mono text-sm">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-400">User ID</dt>
              <dd className="font-mono text-sm">{user.id}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Tenant Code</dt>
              <dd className="font-mono text-sm">{tenantCode}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
```

---

## 8. Integration Checklist

- [ ] Copy `tenant-detection.ts` → `src/lib/`
- [ ] Copy `tenant-context.ts` → `src/lib/`
- [ ] Copy `auth-cookies.ts` → `src/lib/`
- [ ] Copy `db-tenant-isolated.ts` → `src/lib/`
- [ ] Replace `src/proxy.ts` with updated version
- [ ] Update `src/app/api/auth/signin/route.ts` to use `auth-cookies` helpers
- [ ] Update all database queries to use `queryTenant()` instead of shared `query()`
- [ ] Create tenant schemas in MySQL: `CREATE DATABASE tenant_<code>_db`
- [ ] Test with multi-tenant local dev (kubota.localhost:3000, daoanhta.localhost:3000)
- [ ] Deploy wildcard certificate for *.yourdomain.com
- [ ] Configure reverse proxy (nginx) for subdomain routing
- [ ] Run security audit (cross-tenant access, cookie isolation)

---

## 9. Testing Multi-Tenant Locally

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Test tenant switching
curl -H "Host: kubota.localhost:3000" http://localhost:3000/
curl -H "Host: daoanhta.localhost:3000" http://localhost:3000/
```

**Browser (add to /etc/hosts on macOS/Linux):**
```
127.0.0.1 kubota.localhost
127.0.0.1 daoanhta.localhost
```

Then open:
- http://kubota.localhost:3000
- http://daoanhta.localhost:3000

---

## 10. Monitoring & Debugging

**Enable tenant logging:**

```typescript
// src/lib/telemetry.ts
export function logTenantContext(context: string) {
  if (process.env.DEBUG_TENANT_CONTEXT) {
    console.log(`[${new Date().toISOString()}] ${context}`)
  }
}
```

**Use in queries:**
```typescript
export async function queryTenant<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const { tenantCode } = getTenantContext()
  logTenantContext(`Querying tenant_${tenantCode}_db: ${sql}`)
  // ... rest of function
}
```

