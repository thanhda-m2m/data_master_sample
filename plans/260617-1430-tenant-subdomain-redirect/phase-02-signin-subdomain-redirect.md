---
phase: 2
title: "Signin Subdomain Redirect"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
completedAt: "2026-06-17T15:30:00.000Z"
---

# Phase 2: Signin Subdomain Redirect

## Overview

Modify tenant selection flow to redirect to tenant subdomain before starting OAuth. Form submission from `app/page.tsx` redirects to tenant subdomain, then subdomain initiates OAuth flow.

## Requirements

**Functional:**
- Tenant selection form redirects to `tenant.domain/api/auth/signin`
- Subdomain inherits tenant context from URL
- OAuth redirect_uri includes tenant subdomain
- Maintain PKCE and state security

**Non-functional:**
- No open redirect vulnerabilities
- Preserve existing OAuth security (state JWT, PKCE)

## Architecture

**Current Flow:**
```
localhost:3000/
  → form action="/api/auth/signin?tenant=X"
  → OAuth on localhost:3000
```

**Target Flow:**
```
localhost:3000/
  → form action="http://X.localhost:3000/api/auth/signin"
  → OAuth on X.localhost:3000
  → redirect_uri includes X.localhost:3000
```

Tenant detection hierarchy:
1. Subdomain (from hostname)
2. Query param (fallback for initial redirect)
3. Cookie (existing sessions)

## Related Code Files

**Modify:**
- `src/app/page.tsx` — form action to tenant subdomain URL
- `src/app/api/auth/signin/route.ts` — detect tenant from subdomain first, use redirect_uri with subdomain

**Read for context:**
- `src/lib/tenant-detection.ts` — subdomain extraction logic
- `src/lib/url-builder.ts` — tenant URL helpers

## Implementation Steps

1. **Update form action in `src/app/page.tsx`:**
   ```typescript
   import { buildTenantSubdomainUrl } from '@/lib/url-builder'
   
   // Replace:
   <form action="/api/auth/signin" method="get">
   
   // With client-side redirect:
   <form onSubmit={(e) => {
     e.preventDefault()
     const tenant = new FormData(e.currentTarget).get('tenant')
     window.location.href = buildTenantSubdomainUrl(
       tenant,
       '/api/auth/signin'
     )
   }}>
   ```

2. **Update signin route tenant detection in `src/app/api/auth/signin/route.ts`:**
   ```typescript
   import { detectTenant } from '@/lib/tenant-detection'
   
   export async function GET(request: NextRequest) {
     const searchParams = request.nextUrl.searchParams
     const queryTenant = searchParams.get('tenant')
     const cookieTenant = request.cookies.get('datamaster_tenant')?.value
     
     // Priority: subdomain > query > cookie
     const { tenantCode, source } = detectTenant(
       request.headers.get('host') || '',
       cookieTenant
     )
     const tenant = tenantCode || queryTenant
     
     if (!tenant) {
       return Response.json({error: 'Missing tenant'}, {status: 400})
     }
     
     // Build redirect_uri with tenant subdomain
     const redirectUri = buildTenantSubdomainUrl(tenant, '/api/auth/callback')
     
     // ... rest of OAuth flow
     authUrl.searchParams.set('redirect_uri', redirectUri)
   ```

3. **Update cookie domain scope:**
   ```typescript
   // Set cookies on parent domain for cross-subdomain access
   const baseDomain = extractBaseDomain(request.headers.get('host') || '')
   response.cookies.set('datamaster_tenant', tenant, {
     domain: isLocalDev() ? undefined : `.${baseDomain}`,
     // ... other options
   })
   ```

## Success Criteria

- [x] Form submission redirects to tenant subdomain
- [x] Signin route detects tenant from subdomain
- [x] OAuth redirect_uri includes tenant subdomain
- [x] Cookies set with correct domain scope
- [x] No open redirect vulnerabilities (validate tenant exists in DB)
- [x] PKCE and state JWT security preserved

## Completion Notes

- Updated `src/app/page.tsx` form to redirect to tenant subdomain on submit
- Modified `src/app/api/auth/signin/route.ts` to detect tenant from subdomain first
- Implemented cookie domain scoping for cross-subdomain access
- Maintained full OAuth security (state JWT, PKCE flow)
- Verified tenant exists in database before redirect
- All security validations passing

## Risk Assessment

**MEDIUM:** OAuth redirect_uri mismatch if Smart iMATE validates exact match.
- Mitigation: Verify Smart iMATE accepts subdomain redirect_uri or configure wildcard.

**MEDIUM:** Cookie domain scope issues between base and subdomain.
- Mitigation: Set domain to `.localhost` or `.domain.com` for parent domain cookies.
