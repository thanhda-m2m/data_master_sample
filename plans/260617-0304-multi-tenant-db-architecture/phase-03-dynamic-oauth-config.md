---
phase: 3
title: "Dynamic OAuth Config"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2]
completed_at: 2026-06-17
---

# Phase 3: Dynamic OAuth Config

## Overview

Replace env-var OAuth config with database-driven resolution. Update signin/callback flows to query tenant credentials from DB, strengthen state parameter validation, prevent tenant confusion attacks.

## Requirements

**Functional:**
- `/api/auth/signin` resolves tenant config from DB (not env vars)
- State JWT contains tenant, re-validated in callback
- `/api/auth/callback` verifies tenant in state matches tenant in request
- Support per-tenant client_id, client_secret, region, userPoolId
- Preserve PKCE flow (code_verifier, code_challenge)

**Non-functional:**
- Config resolution <10ms (cache hit <1ms)
- State JWT signed with AUTH_SECRET (HS256)
- Backward compat: fallback to env vars if DB returns null

## Architecture

**OAuth Flow with DB Config:**
```
1. User clicks tenant → /api/auth/signin?tenant=takdemo
2. Resolve config from DB: resolveTenantConfigFromDb('takdemo')
3. Generate PKCE (code_verifier, code_challenge)
4. Create state JWT: {tenant, codeVerifier, callbackUrl, nonce}
5. Redirect to Smart iMATE: /takdemo/login.php?client_id={from_db}&...
6. Smart iMATE → Cognito → Smart iMATE /oauth2/authorize → callback
7. /api/auth/callback:
   a. Verify state JWT signature
   b. Extract tenant from state
   c. Re-resolve config from DB (prevent tenant substitution)
   d. Validate tenant in state === tenant from cookie/subdomain
   e. Exchange code for tokens
```

**State JWT Structure:**
```typescript
{
  tenant: string        // Re-validated in callback
  codeVerifier: string  // PKCE verifier
  callbackUrl: string   // Where to redirect after auth
  nonce: string         // CSRF protection
  iat: number
  exp: number           // 10-min expiry
}
```

## Related Code Files

**Modify:**
- `src/app/api/auth/signin/route.ts` (replace resolveTenantConfig with DB version)
- `src/app/api/auth/callback/route.ts` (add state tenant re-validation)
- `src/lib/auth.ts` (update validateTokenViaSmartiMate to use DB config)

**Delete:**
- None (keep env-config for backward compat)

## Implementation Steps

1. **Update `/api/auth/signin/route.ts`:**
   - Replace `import {resolveTenantConfig} from '@/lib/env-config'`
   - Import `resolveTenantConfigFromDb` from `@/lib/tenant-resolver`
   - Line 52: `const config = await resolveTenantConfigFromDb(tenant)`
   - If config null → return 404 "Tenant not found or not configured"
   - Preserve PKCE generation (randomBytes(32), sha256 challenge)
   - State JWT already contains tenant ✓ (verify line 63-68)
   - Redirect to Smart iMATE login.php with dynamic client_id from config

2. **Update `/api/auth/callback/route.ts`:**
   - Parse state JWT (already done)
   - Extract tenant from state: `const stateTenant = decoded.tenant as string`
   - **NEW:** Re-validate tenant from DB:
     ```typescript
     const config = await resolveTenantConfigFromDb(stateTenant)
     if (!config) {
       return Response.json({error: 'Tenant no longer valid'}, {status: 403})
     }
     ```
   - **NEW:** Verify tenant consistency:
     ```typescript
     const cookieTenant = request.cookies.get('oauth_tenant')?.value
     if (cookieTenant && cookieTenant !== stateTenant) {
       return Response.json({error: 'Tenant mismatch'}, {status: 403})
     }
     ```
   - Use `config` from DB (not env vars) for token exchange
   - Exchange code at Smart iMATE /oauth2/token with dynamic client_id/client_secret

3. **Update `src/lib/auth.ts`:**
   - Update `validateTokenViaSmartiMate` function
   - Replace `resolveTenantConfig` with `resolveTenantConfigFromDb`
   - Use cached config (already cached in Phase 1)

4. **Deprecate env-config (gradual):**
   - Add deprecation comment to `src/lib/env-config.ts`
   - Keep functions for backward compat (fallback if DB returns null)
   - Update all imports to use `tenant-resolver` instead

5. **Test OAuth flow:**
   - Start from `/api/auth/signin?tenant=takdemo`
   - Verify state JWT contains tenant
   - Complete OAuth flow through Smart iMATE
   - Verify callback validates tenant from state
   - Test with invalid tenant in state → should reject

## Success Criteria

- [ ] `/api/auth/signin?tenant=takdemo` resolves config from DB
- [ ] State JWT contains tenant field (verified in callback)
- [ ] Callback re-validates tenant from DB (not trusting state alone)
- [ ] Tenant mismatch between state and cookie → 403 error
- [ ] OAuth flow completes successfully with DB credentials
- [ ] PKCE code_verifier/code_challenge preserved
- [ ] Token exchange uses dynamic client_id/client_secret from DB
- [ ] Cache hit for config resolution (<1ms)
- [ ] Fallback to env vars if DB returns null (backward compat)

## Risk Assessment

**Risks:**
1. **State tenant substitution attack** (HIGH)
   - *Mitigation:* Re-validate tenant from DB in callback, reject if config no longer exists
2. **Client secret exposure in logs** (MEDIUM)
   - *Mitigation:* Never log client_secret, mask in error messages
3. **Cache poisoning** (LOW)
   - *Mitigation:* Cache keyed by tenant code (no user input), TTL prevents stale data
4. **Smart iMATE doesn't validate tenant** (MEDIUM - unknown)
   - *Mitigation:* Defense-in-depth: validate on DataMaster side, add to unresolved questions for Phase 5
