---
phase: 6
title: "Testing & Validation"
status: completed
priority: P2
effort: "3h"
dependencies: [1, 2, 3, 4, 5]
completed_at: 2026-06-17
---

# Phase 6: Testing & Validation

## Overview

Comprehensive end-to-end testing of multi-tenant architecture. Test multiple tenants, subdomain routing, OAuth flows, cache behavior, security controls, and edge cases.

## Requirements

**Functional:**
- End-to-end OAuth flow for multiple tenants (TAK1125, takdemo)
- Subdomain routing: `takdemo.localhost:3000`, `TAK1125.localhost:3000`
- Tenant list displays all active tenants
- Cache hit/miss behavior
- State validation rejects tampered state
- Cross-tenant isolation verified

**Non-functional:**
- Test coverage >80% for new code
- Performance: config resolution <10ms (cache hit <1ms)
- No regressions in existing SSO flow

## Architecture

**Test Categories:**
1. **Unit Tests** (Jest/Vitest)
   - tenant-resolver: cache TTL, LRU eviction, JSON parsing
   - tenant-detection: subdomain extraction, validation
   - tenant-context: AsyncLocalStorage isolation
   - rate-limit: threshold enforcement

2. **Integration Tests** (Playwright/Cypress)
   - Full OAuth flow: signin → Smart iMATE → callback → dashboard
   - Multi-tenant: switch between tenants
   - Subdomain routing: verify tenant extracted correctly

3. **Manual Tests** (Chrome DevTools)
   - Cookie isolation: verify tenant-specific cookies
   - Cache behavior: clear cache, verify DB query
   - Error handling: invalid tenant, malformed JSON
   - Security: tamper with state JWT, verify rejection

## Related Code Files

**Create:**
- `tests/unit/tenant-resolver.test.ts`
- `tests/unit/tenant-detection.test.ts`
- `tests/integration/oauth-flow.test.ts`
- `tests/integration/multi-tenant-routing.test.ts`

**Modify:**
- None (tests only)

**Delete:**
- None

## Implementation Steps

1. **Unit Tests: tenant-resolver**
   - Test `resolveTenantConfigFromDb('takdemo')` returns valid config
   - Test JSON parsing error handling (malformed cognito_credentials)
   - Test cache hit (second call returns cached value)
   - Test cache expiration (after 10 min, queries DB again)
   - Test LRU eviction (after 100 entries, oldest evicted)
   - Mock database: return fake tenant data
   - Assert: clientId, clientSecret, region, userPoolId populated

2. **Unit Tests: tenant-detection**
   - Test `extractSubdomainTenant('takdemo.localhost:3000')` → `'takdemo'`
   - Test `extractSubdomainTenant('localhost:3000')` → `null`
   - Test `extractSubdomainTenant('takdemo.domain.com')` → `'takdemo'`
   - Test `detectTenant` with allowlist validation
   - Test invalid tenant code (not in allowlist) → `isValid: false`

3. **Unit Tests: tenant-context**
   - Test `runWithTenant('takdemo', () => getCurrentTenant())` → `'takdemo'`
   - Test concurrent requests with different tenants (verify isolation)
   - Test nested `runWithTenant` calls (verify context stack)

4. **Integration Tests: OAuth flow**
   - Start from landing page (`localhost:3000`)
   - Click tenant "takdemo"
   - Verify redirect to `/api/auth/signin?tenant=takdemo`
   - Verify redirect to Smart iMATE login.php
   - Complete OAuth flow (use real Cognito or mock)
   - Verify callback receives code
   - Verify state validation passes
   - Verify session created
   - Verify redirect to `/dashboard`

5. **Integration Tests: Multi-tenant routing**
   - Navigate to `takdemo.localhost:3000`
   - Verify tenant detected as `takdemo` (check logs or add debug endpoint)
   - Navigate to `TAK1125.localhost:3000`
   - Verify tenant detected as `TAK1125`
   - Navigate to `invalid.localhost:3000`
   - Verify rejected (redirect to `/` or 403)

6. **Manual Tests: Chrome DevTools**
   - Start OAuth flow for `takdemo`
   - Open DevTools → Application → Cookies
   - Verify `oauth_state_takdemo`, `oauth_code_verifier_takdemo` exist
   - Start OAuth flow for `TAK1125`
   - Verify separate cookies: `oauth_state_TAK1125`, `oauth_code_verifier_TAK1125`
   - Complete both flows, verify no cookie collision

7. **Manual Tests: Security**
   - Start OAuth flow, capture state JWT
   - Modify tenant in state JWT payload
   - Replay modified state in callback
   - Verify callback rejects with 403 "Tenant mismatch"
   - Test with missing tenant in DB
   - Verify callback rejects with "Tenant no longer valid"

8. **Performance Tests:**
   - Measure config resolution time (should be <10ms cold, <1ms cached)
   - Measure tenant list query time (should be <50ms)
   - Verify cache hit rate >95% after warmup
   - Load test: 100 concurrent requests to `/` (tenant list)
   - Verify no database connection pool exhaustion

## Success Criteria

- [ ] Unit tests pass (coverage >80%)
- [ ] Integration tests pass (OAuth flow works for multiple tenants)
- [ ] Multi-tenant routing works (`takdemo.localhost:3000` → dashboard)
- [ ] Cookie isolation verified (no cross-tenant cookie leakage)
- [ ] State tampering detected and rejected
- [ ] Cache behavior correct (TTL, LRU eviction)
- [ ] Performance: config resolution <10ms, cache hit <1ms
- [ ] No regressions: existing OAuth flow still works
- [ ] Manual tests documented with screenshots
- [ ] All edge cases handled: invalid tenant, malformed JSON, missing DB entry

## Risk Assessment

**Risks:**
1. **Test environment differs from production** (MEDIUM)
   - *Mitigation:* Use production-like DB data, test with real Cognito (not mocks)
2. **Flaky integration tests** (LOW)
   - *Mitigation:* Add retry logic, use stable test selectors
3. **Performance tests don't reflect production load** (MEDIUM)
   - *Mitigation:* Run load tests with realistic concurrency (100+ requests), monitor in staging
4. **Manual tests not repeatable** (LOW)
   - *Mitigation:* Document steps with screenshots, automate high-value cases in Playwright
