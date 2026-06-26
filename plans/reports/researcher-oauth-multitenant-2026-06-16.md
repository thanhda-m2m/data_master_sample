# OAuth 2.0 + PKCE Multi-Tenant Architecture Research Report

**Date:** 2026-06-16  
**Scope:** Dynamic OAuth configuration, tenant context preservation, security isolation in PKCE flows  
**Research Focus:** Per-tenant OAuth client management, state parameter validation, code_verifier isolation  

---

## Executive Summary

Current implementation stores OAuth credentials as environment variables (single-tenant model). To scale to multi-tenant with per-tenant OAuth configs:

1. **Migrate from env vars to database-driven tenant configs** — enables dynamic client_id/client_secret rotation
2. **Harden state parameter as signed JWT containing tenant context** — prevents cross-tenant confusion attacks
3. **Isolate code_verifier per authorization session** — RFC 7636 + multi-tenant CSRF risk mitigation
4. **Add tenant-aware session management** — ensure token validation respects tenant boundaries

**Recommendation ranking:**
1. **Implement database-backed tenant config** (HIGH priority, foundation for all multi-tenant security)
2. **Strengthen state validation with signed JWT** (HIGH priority, prevents state confusion attacks)
3. **Add explicit tenant binding in token exchange** (MEDIUM priority, defense-in-depth)
4. **Implement session validation per-tenant** (MEDIUM priority, ongoing session safety)

---

## Current State Analysis

### Existing Implementation (Verified)

**Auth Flow:**
- `/api/auth/signin` → generates PKCE, redirects to Smart iMATE login.php
- `/api/auth/callback` → exchanges auth code for tokens
- State stored as signed JWT with tenant + codeVerifier + callbackUrl embedded

**Tenant Resolution:**
- `resolveTenantConfig(tenantCode)` reads from environment variables
- Single tenant per deployment (line 52-55 in env-config.ts: `if (!loginId || tenantCode !== loginId) return null`)
- Client credentials hard-coded: `DATAMASTER_COGNITO_CLIENT_ID_{TENANT}` or fallback to `DATAMASTER_COGNITO_CLIENT_ID`

**Storage:**
- MySQL connection pool (mysql2) at `src/lib/db.ts`
- No tenant configuration schema currently exists in codebase

### Current Risks

| Risk | Severity | Details |
|------|----------|---------|
| **Single-tenant lock** | CRITICAL | env-config line 53 rejects any tenant not matching `DATAMASTER_TENANT_LOGIN_ID` |
| **State parameter leakage** | HIGH | State stored as encrypted JWT + browser cookie; if both compromised, token reuse possible |
| **No per-tenant token validation cache** | MEDIUM | Validation cache (auth.ts:27-72) keys on `${tenant}:${accessToken}` but no tenant isolation in cache itself |
| **Tenant confusion via state** | MEDIUM | State JWT contains tenant, but no explicit binding in `/oauth2/token` exchange; Smart iMATE endpoint not tenant-aware |
| **No audit trail** | LOW | Tenant switches or cross-tenant token attempts not logged |

---

## Research Findings

### 1. OAuth 2.0 + PKCE Standards Compliance

**RFC 7636 (PKCE) Requirements:**
- Code verifier must be cryptographically random, 256-bit minimum entropy (verified: randomBytes(32) = 256 bits ✓)
- S256 (SHA-256) challenge method required (verified: sha256 + base64url ✓)
- Server must bind code_challenge to authorization code (Smart iMATE responsibility)
- Token endpoint validates verifier matches challenge (Smart iMATE responsibility)

**OpenID Connect Core 1.0 State Validation:**
- State MUST be returned in callback and compared to request state (verified: callback validates ✓)
- State used for CSRF mitigation via cryptographic binding to browser cookie
- RECOMMENDED for Authorization Code Flow, REQUIRED if present

**Multi-Tenant Extension (Not in base specs):**
- State parameter can encode tenant identity (current implementation does this ✓)
- Tenant must be validated at token exchange (NOT currently enforced in DataMaster callback)
- Code exchange must fail if tenant context changes between redirect and callback

### 2. Database-Driven Tenant Configuration

**Pattern: Tenant Registry Table**

```
tenants
├── id (UUID or int)
├── tenant_code (string, unique) — login ID used in URLs/state
├── oauth_client_id (string, per-tenant)
├── oauth_client_secret (string, encrypted)
├── smartimate_base_url (string)
├── cognito_user_pool_id (string)
├── cognito_region (string)
├── cognito_userinfo_url (string)
├── status (enum: active, suspended, archived)
├── created_at (timestamp)
├── updated_at (timestamp)
└── rotated_secrets_at (timestamp) — audit trail for secret rotation
```

**Query Pattern:**
```typescript
async function resolveTenantConfigFromDb(tenantCode: string): Promise<TenantConfig | null> {
  const result = await query<any>(
    'SELECT * FROM tenants WHERE tenant_code = ? AND status = ?',
    [tenantCode, 'active']
  )
  return result.length > 0 ? mapRowToTenantConfig(result[0]) : null
}
```

**Benefits:**
- No deployment needed for tenant onboarding
- Client secret rotation without redeployment
- Per-tenant feature flags (e.g., disable SSO for a tenant)
- Audit trail of configuration changes

**Trade-offs:**
- Adds I/O latency to auth endpoints (mitigated by caching with TTL)
- Requires schema migrations for new fields
- Secret encryption at-rest needed

### 3. State Parameter Security in Multi-Tenant Context

**Current State Structure (verified from signin route):**
```typescript
state = SignJWT({
  tenant,
  codeVerifier,
  callbackUrl,
  nonce: stateNonce,
})
.setExpirationTime('10m')
.sign(AUTH_SECRET)
```

**Vulnerability: State Reuse Across Tenants**
- If attacker intercepts state token and user, attacker can submit code to callback with original state
- State validates signature (HS256 with AUTH_SECRET), but tenant field not re-validated at token exchange
- **Attack scenario:** Attacker uses state from Tenant A with authorization code from Tenant B
  - Callback reads tenant from state JWT (Tenant A)
  - Exchanges code with Smart iMATE (but code is from Tenant B)
  - Smart iMATE validation may succeed if authorization code space overlaps or is predictable

**Hardening (Recommended):**

1. **Re-validate tenant from signed state:**
   ```typescript
   // In callback route
   const signedStatePayload = await readSignedState(state)
   const cookieTenant = cookieStore.get('oauth_tenant')?.value
   
   if (signedStatePayload?.tenant !== cookieTenant) {
     return Response.redirect('/auth/error?error=tenant_mismatch')
   }
   ```

2. **Bind code to tenant in token exchange:**
   ```typescript
   const tokenParams = new URLSearchParams({
     grant_type: 'authorization_code',
     client_id: config.clientId,
     code,
     redirect_uri,
     code_verifier: codeVerifier,
     tenant: tenant,  // ← Explicit tenant parameter
   })
   ```

3. **Add nonce validation (OIDC):**
   - Current state includes `nonce: randomBytes(16)`, but nonce never validated in id_token
   - If id_token is returned from Smart iMATE, should validate `nonce` claim matches state JWT

### 4. Code Verifier Isolation in Multi-Tenant Sessions

**Current Pattern (verified):**
```typescript
// signin route
response.cookies.set('oauth_code_verifier', codeVerifier, {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: !isDev,
  maxAge: 600,
})
```

**RFC 7636 Compliance:**
- Verifier stored in httpOnly cookie (prevents JS access) ✓
- SameSite=lax prevents cross-site submission ✓
- 10-minute TTL (maxAge: 600) matches state TTL ✓

**Multi-Tenant Isolation Check:**
- Verifier is cryptographically unique per request (randomBytes(32)) ✓
- Verifier never leaked across cookie boundaries (each request gets its own) ✓
- **Gap:** If multiple auth tabs open for different tenants, both cookies exist on same origin
  - Browser collision risk: low (each set overwrites previous with new value)
  - But if user rapidly switches tenants, cookie state may be stale
  - **Mitigation:** Add tenant_code to cookie name: `oauth_code_verifier_${tenant}`

**Recommended Enhancement:**
```typescript
response.cookies.set(`oauth_code_verifier_${tenant}`, codeVerifier, { /* ... */ })
response.cookies.set(`oauth_state_${tenant}`, state, { /* ... */ })
// In callback, read tenant-specific cookies
const codeVerifier = cookieStore.get(`oauth_code_verifier_${tenant}`)?.value
```

This prevents cross-tenant cookie collision if user has multiple auth sessions open.

### 5. Token Validation & Session Management Per-Tenant

**Current Pattern (verified in auth.ts:62-115):**
```typescript
export async function validateTokenViaSmartiMate(
  accessToken: string,
  tenant: string
): Promise<{ valid: boolean; user?; reason? }> {
  const cacheKey = `${tenant}:${accessToken}`
  const cached = validationCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }
  // Fetch from Smart iMATE /oauth2/validate endpoint
}
```

**Strengths:**
- Tenant + token cache key prevents cross-tenant pollution ✓
- 60-second cache TTL balances performance vs. revocation speed ✓
- Fetches from Smart iMATE (centralized validation) ✓

**Gaps:**
- Cache is in-memory (lost on restart); no shared cache across instances
- No session revocation mechanism if tenant is suspended
- No audit log of validation failures (suspicious activity detection)

**Recommended Enhancement:**
```typescript
// Add session table for audit & revocation
sessions
├── id (UUID)
├── session_token (hash of JWT)
├── user_id (from id_token)
├── tenant_id (foreign key to tenants)
├── created_at
├── expires_at
├── revoked_at (null = active)
├── last_validated_at
└── validation_failure_count

// Check revocation before cache lookup
const session = await db.query(
  'SELECT revoked_at FROM sessions WHERE session_token = ? AND tenant_id = ?',
  [sessionHash, tenantId]
)
if (session[0]?.revoked_at) {
  return { valid: false, reason: 'Session revoked' }
}
```

---

## Security Checklist

### Pre-Deployment Validation

- [ ] **Tenant Context Binding**
  - [ ] State JWT includes signed tenant identifier
  - [ ] Callback validates state tenant matches request tenant
  - [ ] Token exchange endpoint enforces tenant parameter
  - [ ] Smart iMATE endpoint validates tenant ownership of authorization code

- [ ] **Code Verifier Isolation**
  - [ ] Code verifier cookies namespaced by tenant (e.g., `oauth_code_verifier_{tenant}`)
  - [ ] Verifier entropy ≥ 256 bits (verified: randomBytes(32) ✓)
  - [ ] No verifier reuse across requests
  - [ ] Verifier TTL matches state TTL (10 minutes)

- [ ] **State Parameter**
  - [ ] State must be valid, unexpired JWT
  - [ ] State signature verified with AUTH_SECRET
  - [ ] State tenant field extracted and re-validated in callback
  - [ ] State nonce (if present) validated against id_token nonce claim

- [ ] **Tenant Configuration**
  - [ ] Client credentials loaded from database, not env vars
  - [ ] Client secret encrypted at rest
  - [ ] Configuration queries filtered by tenant_code AND status='active'
  - [ ] Configuration cache TTL ≤ 5 minutes (enables secret rotation)

- [ ] **Session Management**
  - [ ] Session JWT includes tenant identifier
  - [ ] Session validation enforces tenant match
  - [ ] Session revocation possible without redeployment
  - [ ] Suspicious activity logged (repeated validation failures, cross-tenant attempts)

- [ ] **Audit Trail**
  - [ ] Log all OAuth token exchanges (tenant, user, timestamp, success/failure)
  - [ ] Log all tenant configuration changes
  - [ ] Log session revocations with reason
  - [ ] No sensitive data in logs (secrets, code_verifier values)

---

## Architecture Recommendations

### Phase 1: Database-Driven Tenant Config (Foundation)

**Prerequisite:** Existing MySQL connection already available (src/lib/db.ts)

**Changes:**
1. Create `tenants` table (see schema above)
2. Migrate `resolveTenantConfig()` to query database instead of env vars
3. Add configuration cache with configurable TTL
4. Implement fallback to env vars during migration (feature flag)

**Files to modify:**
- `src/lib/env-config.ts` — refactor to DB-first with env fallback
- `src/lib/db.ts` — add tenant query helpers
- `.env.local` / `.env.example` — add `TENANT_CONFIG_CACHE_TTL_SECONDS`

**Risk:** Low (read-only initially; env vars remain as fallback)

---

### Phase 2: Harden State Parameter & Tenant Binding

**Changes:**
1. Update signin route to include explicit tenant in state JWT
2. Update callback route to re-validate tenant from state JWT
3. Add tenant parameter to token exchange with Smart iMATE
4. Rename OAuth cookies to include tenant (e.g., `oauth_state_{tenant}`)

**Files to modify:**
- `src/app/api/auth/signin/route.ts` — verify tenant in state JWT
- `src/app/api/auth/callback/route.ts` — re-validate tenant, add tenant to token params
- Security: Add validation logs

**Risk:** Medium (changes token exchange flow; requires Smart iMATE validation of tenant param)

---

### Phase 3: Session Validation & Revocation

**Changes:**
1. Create `sessions` table with revocation support
2. Update session creation to insert into sessions table
3. Add revocation check to `validateTokenViaSmartiMate()`
4. Implement `/api/auth/revoke` endpoint for admin use

**Files to modify:**
- `src/lib/auth.ts` — add session revocation lookup
- `src/app/api/auth/callback/route.ts` — insert session record
- `src/app/api/auth/revoke/route.ts` — new admin endpoint

**Risk:** Low (adds validation layer; does not break existing flows)

---

### Phase 4: Audit Trail & Suspicious Activity Detection

**Changes:**
1. Add logging table `auth_audit_log`
2. Log all OAuth events (signin, callback, validation, revocation)
3. Alert on suspicious patterns (repeated failures, cross-tenant attempts)

**Files to modify:**
- `src/lib/auth.ts` — add audit logging
- `src/app/api/auth/*.ts` — emit audit events
- Monitoring: Set up alerting for audit patterns

**Risk:** Low (logging only; no impact on flows)

---

## Code Patterns & Examples

### Pattern 1: Database-Driven Tenant Config

```typescript
// src/lib/tenant-config.ts (NEW)

const configCache = new Map<string, { config: TenantConfig; expiresAt: number }>()

export async function resolveTenantConfigFromDb(
  tenantCode: string
): Promise<TenantConfig | null> {
  // Check cache
  const cached = configCache.get(tenantCode)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config
  }

  // Query database
  try {
    const rows = await query<any>(
      `SELECT id, oauth_client_id, oauth_client_secret, smartimate_base_url, 
              cognito_user_pool_id, cognito_region, cognito_userinfo_url
       FROM tenants 
       WHERE tenant_code = ? AND status = 'active'`,
      [tenantCode]
    )

    if (rows.length === 0) {
      return null
    }

    const row = rows[0]
    const config: TenantConfig = {
      tenantId: row.id,
      clientId: row.oauth_client_id,
      clientSecret: decryptSecret(row.oauth_client_secret),
      smartimateBaseUrl: row.smartimate_base_url,
      region: row.cognito_region,
      // ... other fields
    }

    // Cache for 5 minutes
    configCache.set(tenantCode, {
      config,
      expiresAt: Date.now() + 300_000,
    })

    return config
  } catch (error) {
    console.error('Failed to load tenant config:', { tenantCode, error })
    return null
  }
}
```

### Pattern 2: Tenant-Aware State Validation

```typescript
// In /api/auth/callback route

const signedStatePayload = await readSignedState(state)
const cookieTenant = cookieStore.get(`oauth_tenant_${tenant}`)?.value

// VALIDATION: State tenant must match request tenant
if (!signedStatePayload?.tenant) {
  return Response.redirect('/auth/error?error=invalid_state')
}

if (signedStatePayload.tenant !== tenant) {
  console.error('Tenant mismatch in state validation', {
    stateTenant: signedStatePayload.tenant,
    requestTenant: tenant,
  })
  return Response.redirect('/auth/error?error=tenant_mismatch')
}

// VALIDATION: Code verifier must be present
if (!codeVerifier) {
  return Response.redirect('/auth/error?error=invalid_code_verifier')
}
```

### Pattern 3: Tenant-Scoped Token Exchange

```typescript
// In /api/auth/callback route, token exchange

const tokenParams = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: config.clientId,
  code,
  redirect_uri: `${request.nextUrl.origin}/api/auth/callback`,
  code_verifier: codeVerifier,
})

// Add explicit tenant parameter (Smart iMATE must validate ownership)
if (config.tenantId) {
  tokenParams.set('tenant_id', String(config.tenantId))
}

if (config.clientSecret) {
  tokenParams.set('client_secret', config.clientSecret)
}

const tokenResponse = await fetch(config.smartimateTokenUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: tokenParams,
})
```

---

## Adoption Risk Assessment

| Dimension | Risk | Mitigation |
|-----------|------|-----------|
| **Maturity** | LOW | OAuth 2.0 & PKCE are industry standards; database-driven config is common SaaS pattern |
| **Breaking Changes** | MEDIUM | Token exchange flow changes; requires Smart iMATE update to accept tenant parameter |
| **Deployment** | MEDIUM | Database migration + schema; requires downtime window or blue-green deploy |
| **Performance** | LOW | Database config queries cached; I/O impact negligible |
| **Rollback** | MEDIUM | If Smart iMATE update fails, can revert to env-var config with feature flag |
| **Team Knowledge** | LOW | OAuth 2.0 is well-documented; team already familiar with current flow |

---

## Sources & References

### Standards
- **RFC 7636 (PKCE):** https://datatracker.ietf.org/doc/html/rfc7636 — Code verifier generation, validation, entropy requirements
- **OpenID Connect Core 1.0:** https://openid.net/specs/openid-connect-core-1_0.html — State parameter validation, CSRF mitigation

### Best Practices
- **Multi-tenant SaaS auth:** Okta, Auth0, AWS Cognito all use database-driven tenant config with per-tenant client credentials
- **PKCE security:** RFC 7636 Section 7 (Security Considerations)
- **State parameter:** OWASP OAuth 2.0 Cheat Sheet (state binding to prevent CSRF/code injection)

### Verified in Current Codebase
- `src/app/api/auth/signin/route.ts` — PKCE generation, state JWT structure
- `src/app/api/auth/callback/route.ts` — State validation, token exchange
- `src/lib/env-config.ts` — Current env-var single-tenant config
- `src/lib/auth.ts` — Session management, token validation cache

---

## Unresolved Questions

1. **Smart iMATE Capability:** Does Smart iMATE `/oauth2/token` endpoint support tenant parameter? If not, enforcement must happen at DataMaster (verify tenant ownership of code via separate endpoint).

2. **Secret Encryption:** What encryption strategy for stored client_secret in database? AES-256-GCM with key rotation, or cloud KMS (AWS Secrets Manager)?

3. **Multi-Region Deployment:** If DataMaster deploys across regions, how to sync tenant config? Single global MySQL, or region-specific replicas?

4. **Client Secret Rotation:** How frequently should client secrets rotate? What's the grace period for old secrets during rotation?

5. **SmartiMate Integration:** Are there breaking changes needed in Smart iMATE to support tenant-scoped token validation, or is tenant context already passed in session?

---

## Recommendation Summary

**Adopt this approach in 4 phases over 2–3 sprints:**

1. **Week 1:** Database-driven config (foundation, low risk)
2. **Week 1–2:** Harden state + tenant binding (requires Smart iMATE coordination)
3. **Week 2–3:** Session revocation (adds safety layer)
4. **Week 3+:** Audit & monitoring (operational excellence)

**Highest-impact changes:**
- Migrate to database-driven tenant config (enables dynamic scaling without redeployment)
- Re-validate tenant in state JWT at callback (prevents cross-tenant token confusion)

**Next step:** Clarify Smart iMATE tenant parameter support before Phase 2 implementation.
