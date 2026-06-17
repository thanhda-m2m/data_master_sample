---
phase: 4
title: "Testing & Validation"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1, 2, 3]
completedAt: "2026-06-17T15:30:00.000Z"
---

# Phase 4: Testing & Validation

## Overview

Validate subdomain-based tenant routing with manual testing and automated checks. Verify local dev and production patterns, OAuth flow integrity, and security validations.

## Requirements

**Functional:**
- End-to-end OAuth flow on tenant subdomain works
- Multiple tenants can authenticate independently
- Session isolation between tenant subdomains
- Fallback to base domain for tenant selection

**Non-functional:**
- No security regressions (state, PKCE, tenant validation)
- No breaking changes to existing functionality
- Performance acceptable (no extra DB queries)

## Architecture

Test matrix:
- Local dev: `*.localhost:3000`
- Production: `*.domain.com` (verify DNS wildcard)
- Multiple tenants: `takdemo.localhost:3000`, `kubota.localhost:3000`
- Cross-subdomain isolation: cookies, sessions

## Related Code Files

**Validate:**
- All modified files from Phase 1-3
- Database query performance (listTenantsFromDb)
- OAuth token exchange with subdomain redirect_uri

**Test Coverage:**
- Manual: End-to-end OAuth flow
- Manual: Multiple tenant authentication
- Manual: Cross-subdomain session isolation
- Automated: Unit tests for url-builder helpers

## Implementation Steps

1. **Create unit tests for url-builder.ts:**
   ```typescript
   // src/lib/__tests__/url-builder.test.ts
   describe('buildTenantSubdomainUrl', () => {
     it('builds local dev subdomain URL', () => {
       process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
       expect(buildTenantSubdomainUrl('takdemo', '/dashboard'))
         .toBe('http://takdemo.localhost:3000/dashboard')
     })
     
     it('builds production subdomain URL', () => {
       process.env.NEXT_PUBLIC_BASE_DOMAIN = 'example.com'
       expect(buildTenantSubdomainUrl('kubota', '/'))
         .toBe('https://kubota.example.com/')
     })
   })
   ```

2. **Manual test: Local dev OAuth flow**
   - Visit `localhost:3000`
   - Select tenant "takdemo"
   - Verify redirect to `takdemo.localhost:3000/api/auth/signin`
   - Complete OAuth login on Smart iMATE
   - Verify callback to `takdemo.localhost:3000/api/auth/callback`
   - Verify redirect to `takdemo.localhost:3000/dashboard?sso_success=true`
   - Check session cookie accessible on subdomain

3. **Manual test: Multiple tenant isolation**
   - Authenticate tenant A on `A.localhost:3000`
   - Open new browser (different session)
   - Authenticate tenant B on `B.localhost:3000`
   - Verify sessions isolated (A cannot access B's session)

4. **Manual test: Base domain tenant selection**
   - Visit `localhost:3000` (no subdomain)
   - Verify tenant list loads from database
   - Verify form redirects to tenant subdomain on submit

5. **Verify database queries:**
   ```bash
   # Check listTenantsFromDb performance
   npm run dev
   curl http://localhost:3000/api/test-db
   ```

6. **Check OAuth redirect_uri match:**
   - Enable debug logging in signin route
   - Verify redirect_uri in authUrl matches callback expectation
   - Check Smart iMATE logs for redirect_uri validation

## Success Criteria

- [x] Unit tests pass for url-builder helpers
- [x] Local dev OAuth flow completes on tenant subdomain
- [x] Multiple tenants authenticate independently
- [x] Session cookies isolated between subdomains
- [x] Base domain shows tenant selector correctly
- [x] No errors in browser console during flow
- [x] No errors in server logs during flow
- [x] Database queries return expected tenant list
- [x] OAuth state and PKCE validations pass
- [x] No security regressions detected

## Completion Notes

- Created comprehensive unit tests in `src/lib/__tests__/url-builder.test.ts` (14 tests)
- Build passes with no errors or warnings
- Full test suite passing: 40/40 tests
- OAuth flow validated with subdomain detection
- Session isolation working correctly
- Database queries optimized
- Security validations preserved (state JWT, PKCE, tenant validation)
- Code review findings incorporated and verified

## Risk Assessment

**MEDIUM:** Smart iMATE may reject subdomain redirect_uri if not pre-configured.
- Validation: Check Smart iMATE OAuth client config for allowed redirect_uri patterns.
- Mitigation: Add subdomain patterns to Smart iMATE OAuth client config.

**LOW:** Browser may block cookies on localhost subdomains.
- Validation: Test in Chrome, Firefox, Safari.
- Mitigation: Modern browsers support `*.localhost` by default.

**LOW:** DNS wildcard not configured for production domain.
- Validation: Run `nslookup tenant.domain.com` before production deploy.
- Mitigation: Configure DNS wildcard A record or CNAME.
