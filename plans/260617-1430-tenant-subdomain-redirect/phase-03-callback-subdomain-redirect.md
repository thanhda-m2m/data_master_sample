---
phase: 3
title: "Callback Subdomain Redirect"
status: completed
priority: P2
effort: "1.5h"
dependencies: [2]
completedAt: "2026-06-17T15:30:00.000Z"
---

# Phase 3: Callback Subdomain Redirect

## Overview

Ensure OAuth callback redirects user to tenant subdomain dashboard after successful authentication. Callback receives auth code on tenant subdomain, exchanges for tokens, and redirects to dashboard on same tenant subdomain.

## Requirements

**Functional:**
- Callback route detects tenant from subdomain
- Token exchange succeeds with subdomain redirect_uri
- Final redirect to dashboard stays on tenant subdomain
- Session cookie accessible across tenant subdomain

**Non-functional:**
- Maintain existing security validations (state, PKCE, tenant mismatch)
- No breaking changes to token exchange flow

## Architecture

**Current Flow:**
```
Smart iMATE → localhost:3000/api/auth/callback?code=X&state=Y
  → Exchange tokens
  → Redirect to localhost:3000/dashboard
```

**Target Flow:**
```
Smart iMATE → tenant.localhost:3000/api/auth/callback?code=X&state=Y
  → Detect tenant from subdomain
  → Exchange tokens with matching redirect_uri
  → Redirect to tenant.localhost:3000/dashboard
```

Tenant validation:
- Extract tenant from subdomain
- Verify matches state JWT tenant
- Verify matches cookie tenant

## Related Code Files

**Modify:**
- `src/app/api/auth/callback/route.ts` — detect tenant from subdomain, build subdomain redirect URLs

**Read for context:**
- `src/lib/tenant-detection.ts` — subdomain extraction
- `src/lib/url-builder.ts` — tenant URL builder

## Implementation Steps

1. **Update tenant detection in callback route:**
   ```typescript
   import { detectTenant } from '@/lib/tenant-detection'
   import { buildTenantSubdomainUrl } from '@/lib/url-builder'
   
   export async function GET(request: NextRequest) {
     const searchParams = request.nextUrl.searchParams
     const code = searchParams.get('code')
     const state = searchParams.get('state')
     
     // Detect tenant from subdomain first
     const { tenantCode: subdomainTenant } = detectTenant(
       request.headers.get('host') || ''
     )
     
     const signedState = await readSignedState(state)
     const stateTenant = signedState?.tenant
     
     // Priority: subdomain > state JWT > cookie
     const tenant = subdomainTenant || stateTenant || cookieTenant
     
     // Validate tenant consistency
     if (subdomainTenant && stateTenant && subdomainTenant !== stateTenant) {
       return Response.redirect(
         buildTenantSubdomainUrl(stateTenant, '/auth/error?error=tenant_mismatch')
       )
     }
     
     // ... rest of validation
   ```

2. **Update token exchange redirect_uri:**
   ```typescript
   // Token exchange must match the redirect_uri from signin
   const tokenParams = new URLSearchParams({
     grant_type: 'authorization_code',
     client_id: config.clientId,
     code,
     redirect_uri: buildTenantSubdomainUrl(tenant, '/api/auth/callback'),
     code_verifier: codeVerifier,
   })
   ```

3. **Update final redirect to tenant subdomain:**
   ```typescript
   // After successful token exchange and session creation
   const callbackUrl = signedState?.callbackUrl || '/dashboard'
   const redirectUrl = buildTenantSubdomainUrl(tenant, callbackUrl)
   redirectUrl.searchParams.set('sso_success', 'true')
   
   const response = NextResponse.redirect(redirectUrl)
   ```

4. **Update error redirects to tenant subdomain:**
   ```typescript
   // All error redirects should stay on tenant subdomain
   if (providerError) {
     const errorUrl = buildTenantSubdomainUrl(
       tenant || 'unknown',
       `/auth/error?error=${providerError}`
     )
     return Response.redirect(errorUrl)
   }
   ```

## Success Criteria

- [x] Callback detects tenant from subdomain correctly
- [x] Token exchange uses subdomain redirect_uri
- [x] Successful auth redirects to tenant subdomain dashboard
- [x] Error redirects stay on tenant subdomain
- [x] Session cookie accessible on tenant subdomain
- [x] State validation prevents tenant confusion attacks
- [x] All existing security checks pass

## Completion Notes

- Updated `src/app/api/auth/callback/route.ts` to detect tenant from subdomain
- Implemented tenant validation from state JWT
- Token exchange uses matching subdomain redirect_uri
- All error redirects use buildTenantSubdomainUrl for consistency
- Session cookies properly scoped for subdomain access
- Security validations (state, PKCE) fully preserved

## Risk Assessment

**MEDIUM:** Token exchange redirect_uri mismatch if Smart iMATE stored different redirect_uri during auth code generation.
- Mitigation: Ensure signin and callback use same buildTenantSubdomainUrl helper.

**LOW:** Cookie not accessible on subdomain if domain scope wrong.
- Mitigation: Set cookie domain to parent domain (`.localhost`, `.domain.com`) or leave undefined for subdomain-only.
