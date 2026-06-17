---
phase: 2
title: "Tenant Detection & Routing"
status: completed
priority: P1
effort: "3h"
dependencies: [1]
completed_at: 2026-06-17
---

# Phase 2: Tenant Detection & Routing

## Overview

Implement subdomain-based tenant detection with allowlist validation and AsyncLocalStorage context propagation. Update middleware to extract tenant from hostname, validate against DB tenant list, bind tenant context for request lifecycle.

## Requirements

**Functional:**
- Extract tenant from subdomain: `takdemo.localhost:3000` → `takdemo`
- Fallback to `datamaster_tenant` cookie if no subdomain
- Validate extracted tenant against DB tenant list (allowlist)
- Bind tenant context to AsyncLocalStorage for request lifecycle
- Support local dev: `*.localhost:3000`
- Reject invalid tenant codes (fail closed)

**Non-functional:**
- Tenant detection latency <5ms (cache hit)
- AsyncLocalStorage overhead negligible (<1ms)
- Cookie isolation per subdomain (host-scoped)

## Architecture

**Tenant Detection Priority:**
1. Subdomain from hostname (highest priority)
2. `datamaster_tenant` cookie (fallback during OAuth flow)
3. None → redirect to tenant selector

**AsyncLocalStorage Pattern:**
```typescript
// src/lib/tenant-context.ts
import { AsyncLocalStorage } from 'async_hooks'

const tenantContext = new AsyncLocalStorage<string>()

export function runWithTenant<T>(tenantCode: string, fn: () => T): T {
  return tenantContext.run(tenantCode, fn)
}

export function getCurrentTenant(): string | undefined {
  return tenantContext.getStore()
}
```

**Middleware Flow:**
```
Request → proxy.ts
  ↓
Extract hostname → parse subdomain
  ↓
Validate against tenant allowlist (cache)
  ↓
Bind tenant to AsyncLocalStorage
  ↓
Continue to route handler
```

## Related Code Files

**Create:**
- `src/lib/tenant-context.ts` (AsyncLocalStorage binding)
- `src/lib/tenant-detection.ts` (subdomain extraction + validation)

**Modify:**
- `src/proxy.ts` (use tenant-detection, bind context, allowlist validation)
- `src/middleware.ts` (if exists, integrate tenant context)

**Delete:**
- None

## Implementation Steps

1. **Create `src/lib/tenant-detection.ts`:**
   - `extractSubdomainTenant(hostname: string): string | null`
     - Strip port: `hostname.split(':')[0]`
     - Split by dot, check parts.length
     - If `*.localhost` → return first part
     - If `*.domain.com` (parts > 2) → return first part
     - Else return null
   - `isLocalDevHost(hostname: string): boolean`
     - Check if localhost, 127.0.0.1, ::1, or ends with .localhost
   - `detectTenant(hostname: string, cookieTenant: string | undefined): {tenantCode: string, source: 'subdomain' | 'cookie' | 'none'}`

2. **Create `src/lib/tenant-context.ts`:**
   - Import `AsyncLocalStorage` from `async_hooks`
   - Create `tenantContext = new AsyncLocalStorage<string>()`
   - Export `runWithTenant(tenantCode, fn)` → `tenantContext.run(tenantCode, fn)`
   - Export `getCurrentTenant()` → `tenantContext.getStore()`

3. **Update `src/proxy.ts`:**
   - Import `detectTenant` from `tenant-detection`
   - Import `listTenantsFromDb` from `tenant-resolver` (Phase 1)
   - Import `runWithTenant` from `tenant-context`
   - Build tenant allowlist: `const tenants = await listTenantsFromDb(); const allowlist = new Set(tenants.map(t => t.loginId))`
   - Cache allowlist with 5-min TTL (avoid querying on every request)
   - Extract tenant via `detectTenant(hostname, cookieTenant)`
   - Validate: `if (tenantCode && !allowlist.has(tenantCode))` → return 403 or redirect to `/`
   - Wrap handler in `runWithTenant`: `return runWithTenant(tenantCode, () => NextResponse.next())`

4. **Update cookie isolation:**
   - Ensure `datamaster_tenant` cookie has no `Domain` attribute (host-only by default)
   - Document cookie isolation strategy in code comments

5. **Handle edge cases:**
   - No subdomain + no cookie → redirect to `/` (tenant selector)
   - Invalid tenant code (not in allowlist) → redirect to `/` with error message
   - Malformed hostname → reject request

## Success Criteria

- [ ] `takdemo.localhost:3000/dashboard` → tenant detected as `takdemo`
- [ ] `localhost:3000` (no subdomain) → fallback to `datamaster_tenant` cookie
- [ ] Invalid tenant code → 403 or redirect to `/` (not silently accepted)
- [ ] `getCurrentTenant()` returns correct tenant in route handlers
- [ ] Tenant allowlist cached (DB not queried on every request)
- [ ] Allowlist cache invalidates after 5 min
- [ ] AsyncLocalStorage context isolated per request (concurrent requests don't mix tenants)

## Risk Assessment

**Risks:**
1. **Tenant allowlist cache stale** (LOW)
   - *Mitigation:* 5-min TTL acceptable (new tenants can wait 5 min), manual refresh endpoint
2. **AsyncLocalStorage performance overhead** (LOW)
   - *Mitigation:* Node.js native implementation, negligible overhead (<1ms)
3. **Cookie collision across subdomains** (LOW)
   - *Mitigation:* Host-only cookies prevent cross-subdomain leakage (verified by research)
4. **Subdomain parsing edge cases** (MEDIUM)
   - *Mitigation:* Unit tests for various hostname formats (localhost, *.localhost, *.domain.com, IPv6)
