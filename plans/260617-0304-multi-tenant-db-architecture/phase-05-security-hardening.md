---
phase: 5
title: "Security Hardening"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2, 3]
completed_at: 2026-06-17
---

# Phase 5: Security Hardening

## Overview

Harden multi-tenant security: namespace OAuth cookies by tenant, add cache invalidation endpoint, implement audit logging for tenant switches, add rate limiting for tenant enumeration.

## Requirements

**Functional:**
- Namespace OAuth cookies: `oauth_state_{tenant}`, `oauth_code_verifier_{tenant}`
- Manual cache invalidation endpoint: `/api/admin/cache/invalidate`
- Audit log: tenant selection, OAuth start, OAuth completion, validation failures
- Rate limit: tenant list endpoint (10 req/min per IP)
- Input validation: tenant code format, JSON schema validation for credentials

**Non-functional:**
- Cookie isolation prevents cross-tenant session confusion
- Cache invalidation <100ms
- Audit logs stored securely (no PII in plaintext)

## Architecture

**Cookie Namespacing:**
```typescript
// Before: oauth_state (shared across tenants)
response.cookies.set('oauth_state', state, {...})

// After: oauth_state_takdemo (tenant-specific)
response.cookies.set(`oauth_state_${tenant}`, state, {...})
```

**Audit Log Schema:**
```typescript
{
  timestamp: ISO8601,
  event: 'tenant_select' | 'oauth_start' | 'oauth_complete' | 'validation_failure',
  tenant: string,
  ip: string,
  userAgent: string,
  userId?: string,  // If authenticated
  error?: string     // If validation failure
}
```

## Related Code Files

**Create:**
- `src/app/api/admin/cache/invalidate/route.ts` (cache invalidation endpoint)
- `src/lib/audit-log.ts` (audit logging functions)
- `src/lib/rate-limit.ts` (rate limiting middleware)

**Modify:**
- `src/app/api/auth/signin/route.ts` (namespace cookies, add audit log)
- `src/app/api/auth/callback/route.ts` (namespace cookies, add audit log)
- `src/app/page.tsx` (add rate limiting)
- `src/lib/tenant-resolver.ts` (add cache invalidation function)

**Delete:**
- None

## Implementation Steps

1. **Namespace OAuth cookies:**
   - Update `signin/route.ts`:
     - Line 117-151: Replace `oauth_state` with `oauth_state_${tenant}`
     - Replace `oauth_code_verifier` with `oauth_code_verifier_${tenant}`
     - Replace `oauth_tenant` with `oauth_tenant_${tenant}` (or keep shared)
   - Update `callback/route.ts`:
     - Read cookies with tenant-specific names
     - Extract tenant from state first, then read `oauth_code_verifier_${tenant}`

2. **Create cache invalidation endpoint:**
   - Create `src/app/api/admin/cache/invalidate/route.ts`:
     ```typescript
     import {invalidateTenantCache} from '@/lib/tenant-resolver'
     
     export async function POST(request: Request) {
       const authHeader = request.headers.get('authorization')
       const apiKey = process.env.DATAMASTER_API_KEY
       if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
         return Response.json({error: 'Unauthorized'}, {status: 401})
       }
       
       const {tenant} = await request.json()
       invalidateTenantCache(tenant)  // Clear specific tenant or all
       return Response.json({success: true})
     }
     ```
   - Update `tenant-resolver.ts`: add `invalidateTenantCache(tenant?: string)` function

3. **Implement audit logging:**
   - Create `src/lib/audit-log.ts`:
     ```typescript
     export function logAuditEvent(event: string, tenant: string, ip: string, details?: any) {
       console.log(JSON.stringify({
         timestamp: new Date().toISOString(),
         event,
         tenant,
         ip,
         ...details
       }))
     }
     ```
   - Add to `signin/route.ts`: `logAuditEvent('oauth_start', tenant, request.ip)`
   - Add to `callback/route.ts`: `logAuditEvent('oauth_complete', tenant, request.ip)`
   - Add to `callback/route.ts` error paths: `logAuditEvent('validation_failure', tenant, request.ip, {error})`

4. **Add rate limiting:**
   - Create `src/lib/rate-limit.ts`:
     ```typescript
     const rateLimitMap = new Map<string, {count: number, resetAt: number}>()
     
     export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
       const now = Date.now()
       const record = rateLimitMap.get(ip)
       
       if (!record || record.resetAt < now) {
         rateLimitMap.set(ip, {count: 1, resetAt: now + windowMs})
         return true
       }
       
       if (record.count >= limit) {
         return false
       }
       
       record.count++
       return true
     }
     ```
   - Update `page.tsx`: Add rate limit check before `listTenantsFromDb()` (10 req/min per IP)

5. **Input validation:**
   - Add JSON schema validation to `tenant-resolver.ts`:
     ```typescript
     function validateCognitoCredentials(creds: any): boolean {
       return creds &&
         typeof creds.datamaster?.app_client_id === 'string' &&
         typeof creds.datamaster?.app_client_secret === 'string'
     }
     ```
   - Reject tenants with invalid credentials during config resolution

## Success Criteria

- [ ] OAuth cookies namespaced by tenant (`oauth_state_takdemo`)
- [ ] Cache invalidation endpoint works: `POST /api/admin/cache/invalidate` with API key
- [ ] Audit logs written for: tenant select, OAuth start, OAuth complete, validation failures
- [ ] Rate limit enforced: 10 req/min per IP on tenant list
- [ ] Tenant code format validated (regex: `^[a-zA-Z0-9_-]{1,50}$`)
- [ ] JSON credentials validated (required keys present)
- [ ] Cross-tenant cookie confusion prevented (verified with multi-tenant test)

## Risk Assessment

**Risks:**
1. **Cookie namespace collision** (LOW)
   - *Mitigation:* Tenant code regex prevents special chars, max 50 chars
2. **Rate limit bypass via IP rotation** (MEDIUM)
   - *Mitigation:* Acceptable for MVP, add Redis-backed rate limiting later
3. **Audit log storage unbounded** (MEDIUM)
   - *Mitigation:* Console.log for MVP, integrate log aggregator (CloudWatch, Datadog) in production
4. **Cache invalidation authentication** (HIGH if no auth)
   - *Mitigation:* Require API key in Authorization header, validate against DATAMASTER_API_KEY env var
