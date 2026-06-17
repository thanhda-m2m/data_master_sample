# OAuth 2.0 + PKCE Multi-Tenant Implementation Summary

## Key Findings

### Current Implementation Status
- ✓ PKCE flow correctly implemented (256-bit code_verifier, S256 challenge)
- ✓ State encoded as signed JWT with 10-minute TTL
- ✓ OAuth cookies httpOnly + SameSite=lax (secure)
- ✗ Single-tenant locked via env vars (no multi-tenant support)
- ✗ Tenant not re-validated in callback (state tenant taken at face value)
- ✗ OAuth cookies not namespaced by tenant (collision risk in multi-tab auth)

### Architecture Recommendations (Ranked by Priority)

| Phase | Change | Priority | Impact | Risk |
|-------|--------|----------|--------|------|
| **1** | Database-driven tenant config | HIGH | Foundation for all multi-tenant ops | LOW |
| **2** | Harden state parameter + tenant binding | HIGH | Prevents cross-tenant token confusion | MEDIUM |
| **3** | Session revocation & audit trail | MEDIUM | Operational safety + compliance | LOW |
| **4** | Suspicious activity detection | MEDIUM | Proactive threat detection | LOW |

### Database Schema (Phase 1)
```sql
CREATE TABLE tenants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_code VARCHAR(50) UNIQUE NOT NULL,
  oauth_client_id VARCHAR(255) NOT NULL,
  oauth_client_secret VARCHAR(255) NOT NULL, -- encrypted
  smartimate_base_url VARCHAR(255),
  cognito_user_pool_id VARCHAR(128),
  cognito_region VARCHAR(50),
  status ENUM('active', 'suspended', 'archived') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  rotated_secrets_at TIMESTAMP NULL
);
```

### Code Changes (Phase 2 - State Hardening)

**In `/api/auth/callback`:**
```typescript
// BEFORE: State trusted at face value
const tenant = cookieStore.get('oauth_tenant')?.value

// AFTER: State tenant re-validated
const signedStatePayload = await readSignedState(state)
if (signedStatePayload?.tenant !== tenant) {
  return Response.redirect('/auth/error?error=tenant_mismatch')
}

// Add tenant to token exchange
tokenParams.set('tenant_id', String(config.tenantId))
```

**In `/api/auth/signin`:**
```typescript
// Rename cookies to tenant-scoped
response.cookies.set(`oauth_state_${tenant}`, state, { /* ... */ })
response.cookies.set(`oauth_code_verifier_${tenant}`, codeVerifier, { /* ... */ })
```

### Security Checklist

- [ ] State JWT includes signed tenant field (already done ✓)
- [ ] Callback re-validates state tenant matches request tenant (MISSING)
- [ ] Token exchange includes explicit tenant parameter (MISSING)
- [ ] Tenant config queries filter on status='active' (MISSING)
- [ ] OAuth cookies namespaced by tenant (MISSING)
- [ ] Code verifier entropy ≥ 256 bits (verified ✓)
- [ ] Session JWT includes tenant identifier (done ✓)
- [ ] Session validation enforces tenant match (MISSING)

### Files to Modify

**Phase 1 (DB Config):**
- `src/lib/env-config.ts` → Add database query, cache layer, env fallback
- `src/lib/db.ts` → Add tenant query helpers
- `.env.local` → Add TENANT_CONFIG_CACHE_TTL_SECONDS

**Phase 2 (State Hardening):**
- `src/app/api/auth/signin/route.ts` → Namespace cookies by tenant
- `src/app/api/auth/callback/route.ts` → Re-validate tenant from state, add tenant to token params
- `src/lib/auth.ts` → Update session validation per-tenant

**Phase 3 (Session Revocation):**
- Create `sessions` table with revocation support
- `src/lib/auth.ts` → Add revocation lookup
- `src/app/api/auth/revoke/route.ts` → New endpoint

### Adoption Risk

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Standards Compliance** | LOW | Follows RFC 7636 + OIDC best practices |
| **Maturity** | LOW | Database-driven config is industry standard (Okta, Auth0, AWS) |
| **Breaking Changes** | MEDIUM | Smart iMATE must accept tenant parameter in `/oauth2/token` |
| **Performance Impact** | LOW | Cached queries (5-min TTL) overhead negligible |
| **Deployment Complexity** | MEDIUM | Requires DB migration + schema changes |

### Unresolved Dependencies

1. **Smart iMATE Validation:** Does `/oauth2/token` endpoint support tenant parameter? (Critical for Phase 2)
2. **Secret Encryption:** Which KMS or encryption strategy? (Required for Phase 1)
3. **Multi-Region Deployment:** Single global DB or region-specific replicas? (Design decision)

### Timeline

- **Phase 1 (DB Config):** 1 sprint, low risk, enables everything else
- **Phase 2 (State Hardening):** 1 sprint, requires Smart iMATE coordination
- **Phase 3 (Session Revocation):** 0.5 sprint, low risk
- **Phase 4 (Audit & Monitoring):** 0.5 sprint, operational

**Recommendation:** Start Phase 1 immediately (foundation). Coordinate with Smart iMATE team on Phase 2 requirements.

---

## Full Research Report

See: `plans/reports/researcher-oauth-multitenant-2026-06-16.md`

Contains:
- Standards compliance analysis (RFC 7636, OIDC Core 1.0)
- Detailed security checklist
- Implementation patterns with code examples
- Multi-phase architecture recommendations
- Risk assessment per phase
