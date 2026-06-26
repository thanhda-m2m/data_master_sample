# Multi-Tenant Next.js Architecture Research Report
**Date:** 2026-06-16  
**Scope:** Subdomain-based tenant routing, isolation strategies, production considerations  
**Status:** COMPLETE

---

## Executive Summary

Your current implementation (`src/proxy.ts` + `src/lib/auth.ts`) has **solid fundamentals** but needs systematic hardening in three areas:

1. **Cookie isolation** — Currently using fallback to `datamaster_tenant` cookie creates cross-subdomain leakage risk
2. **Tenant context propagation** — No async-local tenant binding; unsafe to assume tenant stays consistent across server component tree
3. **Production DNS/SSL** — Wildcard subdomains untested; per-tenant database pooling not yet implemented

**Recommendation:** Implement AsyncLocalStorage-based tenant context binding + host-scoped cookies + dynamic per-tenant connection pooling before production deployment.

---

## 1. Subdomain-Based Tenant Routing (VERIFIED)

### Current State
Your `src/proxy.ts` already implements hostname extraction:
```typescript
const parts = hostname.split('.')
const tenantCandidate = parts.length > 2 ? parts[0] : request.cookies.get('datamaster_tenant')?.value || ''
```

**Strengths:**
- ✅ Validates tenant format regex: `^[a-zA-Z0-9_-]{1,50}$`
- ✅ Falls back to cookie when not in subdomain (allows login flow)
- ✅ Works for local dev (*.localhost:3000)

**Weaknesses identified:**
- ⚠️ Cookie fallback (`datamaster_tenant`) set with no `Domain` attribute → browser-scoped to exact hostname only (acceptable but fragile)
- ⚠️ No validation that extracted subdomain matches expected tenant list (could accept any string that passes regex)
- ⚠️ No test for path-based routing fallback if DNS fails

### Best Practice Implementation

**Pattern: Hostname + Fallback + Validation**

```typescript
// src/lib/tenant-detection.ts
export interface TenantDetectionResult {
  tenantCode: string
  source: 'subdomain' | 'cookie' | 'none'
  isValid: boolean
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

function extractSubdomainTenant(hostname: string): string | null {
  const parts = hostname.split(':')[0].split('.') // Strip port, split by dot
  
  // subdomain.localhost → subdomain
  // subdomain.domain.com → subdomain
  // localhost:3000 → null (no subdomain)
  // domain.com → null (no subdomain)
  
  if (parts.length > 2) {
    return parts[0]
  }
  if (isLocalDevHost(hostname) && parts.length === 2) {
    return parts[0]
  }
  return null
}

export async function detectTenant(
  hostname: string,
  cookieTenant: string | undefined,
  validTenants: Set<string>
): Promise<TenantDetectionResult> {
  const subdomainTenant = extractSubdomainTenant(hostname)
  
  // Priority: subdomain > cookie > none
  const candidate = subdomainTenant || cookieTenant
  if (!candidate) {
    return { tenantCode: '', source: 'none', isValid: false }
  }
  
  // Validate format
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(candidate)) {
    return { tenantCode: candidate, source: subdomainTenant ? 'subdomain' : 'cookie', isValid: false }
  }
  
  // Validate against allowed tenants (prevents arbitrary tenant codes)
  const isValid = validTenants.has(candidate)
  
  return {
    tenantCode: candidate,
    source: subdomainTenant ? 'subdomain' : 'cookie',
    isValid,
  }
}
```

**Rationale:**
- Explicit source tracking helps debug routing issues
- `validTenants` set comes from database/config (prevents injection attacks)
- Separates hostname parsing from business logic validation

---

## 2. Tenant Isolation Strategies (CRITICAL SECURITY)

### Current Issues

Your auth flow stores multiple tenant-related cookies:
```typescript
response.cookies.set('oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: !isDev })
response.cookies.set('datamaster_tenant', tenant, { httpOnly: true, sameSite: 'lax', secure: !isDev })
```

**Problem:** No `Domain` attribute set → browser defaults to host-only. This is **actually correct for isolation** but creates fragility:
- If a user is logged into `tenant1.yourdomain.com` and then visits `tenant2.yourdomain.com`, they'll be redirected to login (cookie doesn't cross subdomains)
- User must log in separately for each tenant

### Per-Tenant Cookie Strategy

**Option A: Host-Only Isolation (Current, Recommended for Security)**
```typescript
// Each subdomain gets its own session cookie, never shared
response.cookies.set('session', sessionJwt, {
  httpOnly: true,
  secure: !isDev,
  sameSite: 'strict', // Stronger: no cross-site submissions
  path: '/',
  // NO Domain attribute = host-only
  maxAge: 24 * 60 * 60,
})

// Tenant ID as separate host-only cookie (redundant but safe)
response.cookies.set('__Host-tenantId', tenant, {
  httpOnly: true,
  secure: !isDev,
  sameSite: 'strict',
  path: '/',
  maxAge: 30 * 24 * 60 * 60,
})
```

**Why:** Prevents accidental tenant bleeding if a bug in your code extracts the wrong tenant from headers.

**Option B: Cross-Subdomain Session (Lower Security, Convenience)**
```typescript
// Only use if Smart iMATE session is truly cross-tenant-aware
response.cookies.set('session', sessionJwt, {
  httpOnly: true,
  secure: !isDev,
  sameSite: 'lax',
  path: '/',
  domain: '.yourdomain.com', // Shared across subdomains
  maxAge: 24 * 60 * 60,
})

// But still validate tenant from request, NOT cookie
```

**Why:** User can navigate between tenants without re-logging in. **Requires server-side tenant validation on every request** (which you already do in proxy.ts).

**Recommendation:** Use **Option A** (host-only) until you have a business need for cross-tenant sessions. Isolation is worth the UX trade-off.

### Database Isolation Patterns

Your current `src/lib/db.ts` uses a single shared pool:
```typescript
const pool = mysql.createPool({
  host: process.env.HZ_TAK_DB_HOST || 'localhost',
  database: process.env.HZ_TAK_DB_NAME || 'tbtech',
  // ...
  connectionLimit: 10,
})
```

**Three patterns, ranked by isolation + complexity:**

#### Pattern 1: Row-Level Isolation (Best for Cost, Requires Discipline)
**Setup:** Single database, single schema, all tables have `tenant_id` column.

```typescript
// src/lib/db-isolated.ts
import mysql from 'mysql2/promise'
import { AsyncLocalStorage } from 'async_hooks'

const tenantContext = new AsyncLocalStorage<string>()

const pool = mysql.createPool({
  host: process.env.HZ_TAK_DB_HOST,
  database: process.env.HZ_TAK_DB_NAME,
  connectionLimit: 20, // Shared pool, higher limit
})

export async function queryWithTenant<T>(
  sql: string,
  params: unknown[],
  tenantId: string
): Promise<T[]> {
  const modifiedSql = sql.replace('WHERE', 'WHERE tenant_id = ? AND')
  const modifiedParams = [tenantId, ...params]
  const [rows] = await pool.execute(modifiedSql, modifiedParams as mysql.RowDataPacket[])
  return rows as T[]
}

export function getTenantContext(): string {
  return tenantContext.getStore() || ''
}

export function withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantContext.run(tenantId, fn)
}
```

**Pros:**
- ✅ Single database = lowest operational overhead
- ✅ Easy backups and migrations
- ✅ Scales to thousands of tenants

**Cons:**
- ❌ One WHERE clause bug = entire dataset exposed
- ❌ Must enforce `tenant_id` on every query (no DB-level enforcement)
- ❌ Bulk operations risky (UPDATE without tenant_id filter = disaster)

**Use when:** You have strong code review + testing discipline.

#### Pattern 2: Schema-Per-Tenant (Good Balance)
**Setup:** Single database, separate schema for each tenant (`tenant_001_schema`, `tenant_002_schema`, etc.).

```typescript
// src/lib/db-schema-isolated.ts
const tenantPools = new Map<string, mysql.Pool>()

async function getTenantPool(tenantId: string): Promise<mysql.Pool> {
  if (!tenantPools.has(tenantId)) {
    const pool = mysql.createPool({
      host: process.env.HZ_TAK_DB_HOST,
      database: `tenant_${tenantId}`, // Schema name includes tenant
      connectionLimit: 5, // Smaller per-tenant limit
      waitForConnections: true,
      connectionTimeout: 2000,
    })
    tenantPools.set(tenantId, pool)
  }
  return tenantPools.get(tenantId)!
}

export async function queryForTenant<T>(
  sql: string,
  params: unknown[],
  tenantId: string
): Promise<T[]> {
  const pool = await getTenantPool(tenantId)
  const [rows] = await pool.execute(sql, params as mysql.RowDataPacket[])
  return rows as T[]
}
```

**Pros:**
- ✅ Schema-level isolation (accidental WHERE omission = data only for that schema)
- ✅ Easy to add per-tenant migrations
- ✅ Medium operational overhead

**Cons:**
- ⚠️ Connection pool per tenant = higher memory (10 tenants = 10 pools)
- ⚠️ Migration complexity (run DDL on all schemas)

**Use when:** You have 10-100 tenants and strong security requirements.

#### Pattern 3: Database-Per-Tenant (Strongest Isolation)
**Setup:** Separate database instance per tenant (managed via secrets manager).

```typescript
// src/lib/db-tenant-isolated.ts
const tenantPools = new Map<string, mysql.Pool>()
const tenantConfigs = new Map<string, { host: string; database: string; user: string; password: string }>()

async function loadTenantConfig(tenantId: string) {
  // Load from secrets manager (AWS Secrets, HashiCorp Vault, etc.)
  // For local dev: load from env or config file
  const key = `TENANT_${tenantId}_DB_URL`
  const config = process.env[key]
  if (!config) throw new Error(`No config for ${tenantId}`)
  
  const url = new URL(config)
  return {
    host: url.hostname,
    database: url.pathname.slice(1),
    user: url.username,
    password: url.password,
  }
}

async function getTenantPool(tenantId: string): Promise<mysql.Pool> {
  if (!tenantPools.has(tenantId)) {
    const config = await loadTenantConfig(tenantId)
    const pool = mysql.createPool({
      ...config,
      connectionLimit: 5,
      waitForConnections: true,
    })
    tenantPools.set(tenantId, pool)
    tenantConfigs.set(tenantId, config)
  }
  return tenantPools.get(tenantId)!
}

export async function queryForTenant<T>(
  sql: string,
  params: unknown[],
  tenantId: string
): Promise<T[]> {
  const pool = await getTenantPool(tenantId)
  const [rows] = await pool.execute(sql, params as mysql.RowDataPacket[])
  return rows as T[]
}
```

**Pros:**
- ✅ Complete isolation (one tenant's DB breach ≠ others affected)
- ✅ Per-tenant capacity tuning (some tenants get bigger instances)
- ✅ Easy to move tenants between hosts

**Cons:**
- ❌ Highest operational overhead (manage N database instances)
- ❌ Scaling to thousands of tenants becomes expensive
- ❌ Cross-tenant queries/reports impossible

**Use when:** Tenants are large/important or have compliance mandates (SOC 2, HIPAA).

### Recommendation for Your Project
**Start with Pattern 2 (Schema-Per-Tenant):**
- You already have per-tenant config management (`resolveTenantConfig`)
- Your Smart iMATE integration suggests you'll scale to 20-50+ tenants
- Schema-level isolation matches your security model

---

## 3. Tenant Context Propagation in Server Components

### Current Gap
Your `src/lib/auth.ts` extracts tenant from JWT in the session cookie, but there's no **async-local binding** of tenant context to the entire request. If a server component deep in your tree needs the tenant ID, it has to re-extract it from cookies.

**Risk:** If `getSession()` is called at different points in the tree, you could get mismatched tenant context.

### Solution: AsyncLocalStorage-Based Tenant Context

```typescript
// src/lib/tenant-context.ts
import { AsyncLocalStorage } from 'async_hooks'
import type { NextRequest, NextResponse } from 'next/server'

interface TenantContextData {
  tenantCode: string
  tenantId: string
  userId?: string
}

export const tenantContext = new AsyncLocalStorage<TenantContextData>()

/**
 * Get current tenant context (server-only, must be called within request context)
 */
export function getTenantContext(): TenantContextData {
  const store = tenantContext.getStore()
  if (!store) {
    throw new Error('getTenantContext called outside request context')
  }
  return store
}

/**
 * Check if we're in an async context with tenant data
 */
export function hasTenantContext(): boolean {
  return tenantContext.getStore() !== undefined
}

/**
 * Run a function with tenant context (for testing, internal use)
 */
export function withTenantContext<T>(
  data: TenantContextData,
  fn: () => Promise<T> | T
): Promise<T> {
  return tenantContext.run(data, async () => fn())
}
```

### Integration with Proxy/Middleware

```typescript
// src/proxy.ts (updated)
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { tenantContext } from '@/lib/tenant-context'
import { detectTenant } from '@/lib/tenant-detection'
import { resolveTenantConfig } from '@/lib/env-config'

export async function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl
  const sessionCookie = request.cookies.get('session')?.value

  // Extract tenant from subdomain or cookie
  const cookieTenant = request.cookies.get('datamaster_tenant')?.value
  const detectionResult = await detectTenant(
    hostname,
    cookieTenant,
    new Set(['kubota', 'daoanhta']) // Load from DB or config
  )

  if (!detectionResult.isValid) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  const { tenantCode } = detectionResult

  // Validate session and extract user
  let userId: string | undefined
  if (sessionCookie) {
    try {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET!)
      const { payload } = await jwtVerify(sessionCookie, secret)
      userId = payload.sub as string
    } catch {
      // Invalid session
    }
  }

  // Bind tenant context to request
  const tenantData = {
    tenantCode,
    tenantId: tenantCode, // Map to your internal ID if needed
    userId,
  }

  // Use run() to set context for downstream code
  return tenantContext.run(tenantData, () => NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### Usage in Server Components

```typescript
// src/app/dashboard/page.tsx
import { getTenantContext } from '@/lib/tenant-context'
import { queryForTenant } from '@/lib/db-schema-isolated'

export default async function DashboardPage() {
  const { tenantCode, userId } = getTenantContext()

  // Query uses tenantCode automatically
  const userData = await queryForTenant(
    'SELECT * FROM users WHERE id = ?',
    [userId],
    tenantCode
  )

  return (
    <div>
      <h1>Dashboard for {tenantCode}</h1>
      <pre>{JSON.stringify(userData, null, 2)}</pre>
    </div>
  )
}
```

---

## 4. Production Considerations

### DNS Wildcard Configuration

**For `yourdomain.com` (example: `techport.com`):**

```bash
# In your DNS provider (Route53, Cloudflare, etc.)
*.techport.com  A  203.0.113.1  (your load balancer IP)
techport.com    A  203.0.113.1
```

**Local development (.localhost):**
```bash
# No DNS needed, browsers accept *.localhost natively
# kubota.localhost:3000
# daoanhta.localhost:3000
```

### SSL/TLS Wildcard Certificate

**Option A: Let's Encrypt (Free)**
```bash
certbot certonly --dns-route53 \
  -d "techport.com" \
  -d "*.techport.com" \
  --agree-tos \
  --email admin@techport.com
```

**Option B: AWS Certificate Manager (Free for AWS-hosted domains)**
```bash
# Create via AWS console
# Certificate: *.techport.com + techport.com
# Validation: DNS CNAME (auto-created by ACM)
```

**Option C: Self-signed (Development only)**
```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout server.key \
  -out server.crt \
  -days 365 \
  -nodes \
  -subj "/CN=*.localhost"
```

### Reverse Proxy Setup (nginx example)

```nginx
# /etc/nginx/sites-available/techport.com
upstream nextjs_app {
  server localhost:3000;
  keepalive 32;
}

server {
  listen 443 ssl http2;
  server_name ~^(?<tenant>[a-zA-Z0-9_-]+)\.techport\.com$ techport.com;

  ssl_certificate /etc/letsencrypt/live/techport.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/techport.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  # Pass subdomain to Next.js via Host header
  location / {
    proxy_pass http://nextjs_app;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
  }
}

server {
  listen 80;
  server_name _;
  return 301 https://$host$request_uri;
}
```

### Connection Pool Scaling

**For schema-per-tenant pattern:**

```typescript
// src/lib/db-schema-isolated-advanced.ts
const tenantPools = new Map<string, mysql.Pool>()
const POOL_SIZE_BY_TIER: Record<string, number> = {
  'premium': 15,     // Large tenants
  'standard': 5,     // Medium
  'free': 2,         // Small
}

async function getTenantPoolSize(tenantId: string): Promise<number> {
  const tier = await getTenantTier(tenantId) // Fetch from config DB
  return POOL_SIZE_BY_TIER[tier] || 5
}

async function getTenantPool(tenantId: string): Promise<mysql.Pool> {
  if (!tenantPools.has(tenantId)) {
    const size = await getTenantPoolSize(tenantId)
    const pool = mysql.createPool({
      host: process.env.HZ_TAK_DB_HOST,
      database: `tenant_${tenantId}`,
      connectionLimit: size,
      waitForConnections: true,
      idleTimeout: 30000,
      connectionTimeout: 2000,
    })
    tenantPools.set(tenantId, pool)
  }
  return tenantPools.get(tenantId)!
}
```

### Monitoring & Alerts

**Metrics to track per tenant:**
- Connection pool utilization (target: 60-80%)
- Query latency (p50, p95, p99)
- Authentication failures
- Cross-tenant access attempts (should be 0)

```typescript
// src/lib/telemetry.ts
export async function logTenantAccess(tenantCode: string, userId: string, path: string) {
  const timestamp = new Date().toISOString()
  console.log(JSON.stringify({
    type: 'tenant_access',
    timestamp,
    tenantCode,
    userId,
    path,
  }))
  // Send to monitoring system (Datadog, Prometheus, etc.)
}

export async function logTenantError(tenantCode: string, error: Error) {
  const timestamp = new Date().toISOString()
  console.error(JSON.stringify({
    type: 'tenant_error',
    timestamp,
    tenantCode,
    error: error.message,
    stack: error.stack,
  }))
}
```

---

## 5. Common Pitfalls & Mitigations

| Pitfall | Impact | Mitigation |
|---------|--------|-----------|
| **Cookie without Domain → cross-subdomain sharing** | Tenant A can access Tenant B's session | Use host-only cookies (no Domain attribute) |
| **WHERE clause bug in row-level isolation** | Entire DB exposed | Schema-per-tenant or row-level security policies (MySQL 8.0+) |
| **Single connection pool, one tenant dominates** | Other tenants starved | Per-tenant pools + connection limits per tier |
| **Tenant extracted from URL only, no validation** | Arbitrary tenant codes accepted | Validate against DB list of active tenants |
| **AsyncLocalStorage context lost on setTimeout** | Tenant context undefined in callbacks | Use `tenantContext.run()` or pass tenantId explicitly |
| **Wildcard cert doesn't cover base domain** | SSL error on techport.com | Include both *.techport.com and techport.com in cert |
| **JWT includes stale tenant ID** | User sees wrong tenant data after migration | Re-issue JWT on tenant reassignment, cache tenant config |

---

## 6. Recommended Implementation Path

### Phase 1: Immediate (1-2 days)
1. ✅ Verify current proxy.ts cookie isolation (host-only is correct)
2. ✅ Add `validTenants` check in tenant detection (prevent injection)
3. ✅ Implement AsyncLocalStorage tenant context binding

### Phase 2: Short-term (1 week)
1. Migrate from single shared pool to schema-per-tenant pattern
2. Add per-tenant connection pooling with tier-based limits
3. Implement telemetry/monitoring for tenant isolation

### Phase 3: Production readiness (2 weeks)
1. Wildcard DNS + SSL certificate setup
2. Reverse proxy (nginx) configuration + testing
3. Security audit (penetration test cross-tenant access)
4. Load testing with multi-tenant scenario

---

## Sources & References

- [Next.js Proxy/Middleware Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/middleware)
- [MDN Set-Cookie Header Specification](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [Node.js AsyncLocalStorage API](https://nodejs.org/api/async_hooks.html#async_hooks_class_asynclocalstorage)
- Current codebase: `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/env-config.ts`

---

## Unresolved Questions

1. **Smart iMATE session scope** — Does Smart iMATE's OAuth session support cross-tenant access, or is it per-tenant? Affects cookie Domain strategy.
2. **Tenant migration** — How often do users need to switch tenants? Affects whether to implement cross-subdomain sessions.
3. **Compliance requirements** — Any HIPAA/SOC2/PCI-DSS mandates that force database-per-tenant model?
4. **User count per tenant** — Expected scale? (Affects pool sizing strategy.)
5. **Custom domain support** — Will customers ever use their own domain (e.g., app.their-company.com) instead of subdomain?

