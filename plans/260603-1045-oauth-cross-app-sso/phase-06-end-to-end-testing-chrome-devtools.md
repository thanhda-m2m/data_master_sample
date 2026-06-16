---
phase: 6
title: "End-to-End Testing with Chrome DevTools"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-01-create-oauth-server-class", "phase-02-token-validation-revoke-endpoints", "phase-03-tenant-provisioning-sync-to-datamaster", "phase-04-datamaster-oauth-client-integration-smart-imate", "phase-05-sso-button-implementation"]
---

# Phase 6: End-to-End Testing with Chrome DevTools

## Overview

Verify all 5 OAuth flows work end-to-end using Chrome DevTools for network inspection, cookie validation, and token analysis.

## Requirements

- Functional: All flows pass with real Cognito tokens
- Non-functional: Network tab shows correct request/response patterns

## Test Scenarios

### Flow 1: Cross-App SSO (DataMaster → Smart iMATE)
1. Login to DataMaster
2. Click "Login to Smart iMATE" button
3. Verify: redirected to Smart iMATE dashboard without re-auth
4. DevTools: check Network tab for /oauth/authorize → /callback chain

### Flow 2: Session Check & Authentication
1. Clear all cookies
2. Navigate to DataMaster protected route
3. Verify: redirect to Smart iMATE login
4. Login with Cognito credentials
5. Verify: redirected back to DataMaster with session
6. DevTools: verify Cognito token exchange, session cookie set

### Flow 3: Token Exchange & User Info
1. After login, check session contents
2. Verify: access_token, refresh_token, id_token present
3. Call Smart iMATE /userinfo endpoint
4. Verify: returns correct user info (id, email, name, tenant)

### Flow 4: Token Refresh & API Access
1. Wait for access_token expiry (or force expiry)
2. Make API request
3. Verify: automatic token refresh
4. Verify: new tokens returned, API request succeeds
5. DevTools: check /oauth2/token refresh flow

### Flow 5: Reverse SSO (Smart iMATE → DataMaster)
1. Login to Smart iMATE
2. Click "Login to DataMaster" button
3. Verify: redirected to DataMaster dashboard without re-auth
4. DevTools: check session cookie reuse

### Flow 6: Tenant Provisioning Sync
1. Create new tenant in Smart iMATE admin
2. Verify: tenant appears in DataMaster DB within 5 seconds
3. Login to new tenant — verify Cognito User Pool works

### Flow 7: Token Revocation
1. Login to both apps
2. Revoke token via Smart iMATE admin
3. Verify: DataMaster API calls return 401
4. Verify: user redirected to login

## Related Code Files

- No code changes — testing only
- Use Chrome DevTools MCP for network inspection
- Document results in `plans/reports/testing-e2e-results.md`

## Success Criteria

- [ ] All 7 flows pass without errors
- [ ] Network requests show correct OAuth patterns
- [ ] Session cookies httpOnly, secure, sameSite=Lax
- [ ] Token validation goes through Smart iMATE (not direct Cognito)
- [ ] Revoked tokens rejected within 5 seconds

## Risk Assessment

- **MEDIUM**: Cognito rate limiting — use test accounts, not production
- **LOW**: Cookie cross-origin issues — test on same domain or use localhost aliases

## Security Considerations

- Test with real credentials — use test accounts only
- Verify no tokens exposed in URLs or client-side JS
- Confirm X-Internal-Call header required for validation endpoint

## Next Steps

- Document test results
- Create PR with all changes
- Run /ck:journal to archive decisions
