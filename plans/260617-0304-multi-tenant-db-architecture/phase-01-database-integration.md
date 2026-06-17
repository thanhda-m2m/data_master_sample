---
phase: 1
title: "Database Integration"
status: completed
priority: P1
effort: "4h"
dependencies: []
completed_at: 2026-06-17
---

# Phase 1: Database Integration

## Overview

Create database query layer for tenant registry and OAuth credentials. Query `buscomps` + `bkmasters` with JOIN, extract JSON `cognito_credentials`, implement in-memory LRU cache with 10-min TTL.

## Requirements

**Functional:**
- Query tenant list from `buscomps` WHERE `loginid IS NOT NULL`
- JOIN `buscomps` + `bkmasters` on `bkid` to get credentials
- Extract nested JSON: `cognito_credentials->>'$.datamaster.app_client_id'`
- Parse `cognito_credentials` JSON in Node.js (not SQL)
- Return typed `TenantConfig` with clientId, clientSecret, region, userPoolId

**Non-functional:**
- Cache tenant configs in-memory (LRU, 10-min TTL)
- Handle malformed JSON gracefully
- Log DB errors without exposing credentials
- Query latency <10ms (cache hit <1ms)

## Architecture

**Database Schema:**
```sql
buscomps:
  bkid INT PRIMARY KEY
  loginid VARCHAR(16)  -- tenant code
  bcname VARCHAR(64)   -- display name
  subdom VARCHAR(8)    -- subdomain

bkmasters:
  bkid SMALLINT PRIMARY KEY (FK to buscomps)
  cognito_credentials JSON
  cognito_region VARCHAR(50)
```

**Query Pattern:**
```sql
SELECT 
  bc.bkid,
  bc.loginid,
  bc.bcname,
  bk.cognito_credentials,
  bk.cognito_region
FROM buscomps bc
INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
WHERE bc.loginid = ?
  AND bk.cognito_credentials IS NOT NULL
```

**Cache Strategy:**
- In-memory Map<tenantCode, {config, expiresAt}>
- 10-min TTL (600s)
- Max 100 entries (LRU eviction)
- Cache hit → return immediately
- Cache miss → query DB + cache result

## Related Code Files

**Create:**
- `src/lib/tenant-resolver.ts` (database resolver + cache)
- `src/lib/tenant-types.ts` (TypeScript interfaces)

**Modify:**
- `src/lib/db.ts` (add typed query helpers)
- `src/lib/env-config.ts` (deprecate, point to tenant-resolver)

**Delete:**
- None (keep env-config for backward compat during migration)

## Implementation Steps

1. **Create `src/lib/tenant-types.ts`:**
   - Define `TenantConfig` interface (userPoolId, clientId, clientSecret, region, loginId, issuer, OAuth URLs)
   - Define `TenantSummary` interface (bkid, loginId, bcname, subdom)
   - Define `CognitoCredentials` interface matching JSON structure

2. **Create `src/lib/tenant-resolver.ts`:**
   - Implement `resolveTenantConfigFromDb(tenantCode: string): Promise<TenantConfig | null>`
   - JOIN query: `buscomps bc INNER JOIN bkmasters bk ON bc.bkid = bk.bkid`
   - Parse `cognito_credentials` JSON in Node.js: `JSON.parse(row.cognito_credentials)`
   - Extract `$.datamaster.app_client_id`, `$.datamaster.app_client_secret`
   - Build issuer URL: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
   - Error handling: return null if JSON malformed or missing keys

3. **Implement in-memory cache:**
   - Create `Map<string, {config: TenantConfig, expiresAt: number}>`
   - `getCachedConfig(tenantCode)` → check cache, return if not expired
   - `setCachedConfig(tenantCode, config)` → store with `Date.now() + 600_000`
   - LRU eviction: if cache size > 100, delete oldest entry

4. **Create `listTenantsFromDb(): Promise<TenantSummary[]>`:**
   - Query: `SELECT bc.bkid, bc.loginid, bc.bcname, bc.subdom FROM buscomps bc INNER JOIN bkmasters bk ON bc.bkid = bk.bkid WHERE bc.loginid IS NOT NULL AND bk.cognito_credentials IS NOT NULL`
   - Return array of tenant summaries

5. **Update `src/lib/db.ts`:**
   - Add generic typed query helper if not exists
   - Ensure connection pool config correct (from .env.local)

6. **Test database queries:**
   - Docker exec: `docker exec -i hz-tak-db-1 mysql -uroot -proot -e "USE zaikodb; SELECT bc.loginid, bk.cognito_credentials FROM buscomps bc INNER JOIN bkmasters bk ON bc.bkid = bk.bkid WHERE bc.loginid = 'takdemo'"`
   - Verify JSON structure matches expected format
   - Test with multiple tenants (TAK1125, takdemo)

## Success Criteria

- [x] `resolveTenantConfigFromDb('takdemo')` returns valid TenantConfig
- [x] `cognito_credentials` JSON parsed correctly (clientId, clientSecret extracted)
- [x] Cache hit returns config in <1ms
- [x] Cache miss queries DB in <10ms
- [x] `listTenantsFromDb()` returns all tenants with non-null credentials
- [x] Malformed JSON returns null (no crash)
- [x] Database connection errors logged (no credential leakage)
- [x] Unit tests pass for cache TTL expiration
- [x] Unit tests pass for LRU eviction

## Risk Assessment

**Risks:**
1. **Malformed JSON in cognito_credentials** (MEDIUM)
   - *Mitigation:* Try-catch around JSON.parse, validate required keys, return null on error
2. **Database connection pool exhaustion** (LOW)
   - *Mitigation:* Cache prevents repeated queries, connection pool limit = 10 (sufficient for cache-hit pattern)
3. **Cache staleness after credential rotation** (MEDIUM)
   - *Mitigation:* 10-min TTL acceptable (credentials rotated infrequently), add manual invalidation endpoint in Phase 5
4. **Missing bkmasters entry for tenant** (LOW)
   - *Mitigation:* LEFT JOIN → check if cognito_credentials IS NOT NULL, return null if missing
