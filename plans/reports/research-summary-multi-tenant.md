# Research Summary: Multi-Tenant Next.js Architecture

## Overview
Comprehensive technical research on subdomain-based tenant routing, isolation strategies, and production deployment patterns for multi-tenant SaaS applications using Next.js 16+.

**Status:** Complete  
**Date:** 2026-06-16  
**Scope:** Your current codebase + best practices from industry standards

---

## Key Findings

### 1. Your Current Implementation (Solid Foundation)
✅ **Strengths:**
- Hostname extraction in `src/proxy.ts` validates subdomain format correctly
- OAuth flow through Smart iMATE properly separates auth concerns
- Per-tenant config resolution prevents hardcoding tenant-specific values

⚠️ **Gaps to Address:**
- No async-local tenant context binding (cookie extraction happens multiple times)
- Single shared database connection pool (scales poorly past 20 tenants)
- No validation that extracted tenant is in the active tenant allowlist
- Cookies lack explicit isolation strategy documentation

### 2. Three Database Isolation Patterns

| Pattern | Cost | Isolation | Complexity | Recommended |
|---------|------|-----------|------------|-------------|
| **Row-Level** | Low | Weak (code discipline) | Low | Small teams only |
| **Schema-Per-Tenant** | Medium | Strong (DB-level) | Medium | ✅ You, 10-100 tenants |
| **Database-Per-Tenant** | High | Strongest (instance-level) | High | Enterprise/compliance |

**Recommendation:** Implement schema-per-tenant pattern immediately. Provides strong isolation without operational complexity of managing N database instances.

### 3. Cookie Isolation (CRITICAL SECURITY)

**Current risk:** Fallback to `datamaster_tenant` cookie has no `Domain` attribute → browser defaults to host-only. This is **actually correct** but fragile.

**Best practice:** Explicitly set host-only cookies with prefixes:
```typescript
response.cookies.set('__Host-sessionId', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
  // NO Domain = host-only isolation
})
```

**Why:** If middleware bug extracts wrong tenant, cookies still don't leak across subdomains.

### 4. AsyncLocalStorage Binding

Your current code calls `getSession()` multiple times in the tree. Use Node.js `AsyncLocalStorage` to bind tenant context once per request:

```typescript
// In proxy.ts
tenantContext.run(tenantData, () => NextResponse.next())

// In any Server Component
const { tenantCode, userId } = getTenantContext()
```

Eliminates repeated cookie parsing, ensures consistent tenant throughout request lifecycle.

### 5. Production Deployment

**DNS:**
- Wildcard record: `*.yourdomain.com` → load balancer IP
- Also include base domain: `yourdomain.com` → same IP

**SSL Certificate:**
- Wildcard cert: `*.yourdomain.com` (covers `tenant1.yourdomain.com`, etc.)
- Must also include base domain: `yourdomain.com`
- Use Let's Encrypt (free) or AWS Certificate Manager

**Reverse Proxy (nginx):**
```nginx
server_name ~^(?<tenant>[a-zA-Z0-9_-]+)\.yourdomain\.com$ yourdomain.com;
proxy_pass http://localhost:3000;
proxy_set_header Host $host;  # Pass subdomain to Next.js
```

**Connection Pooling:**
- Create tenant schemas: `tenant_kubota_db`, `tenant_daoanhta_db`, etc.
- Per-tenant pool limits: premium=15, standard=5, free=2
- Prevents single tenant from starving others

### 6. Common Pitfalls & Mitigations

| Pitfall | Impact | Mitigation |
|---------|--------|-----------|
| WHERE clause omitted in row-level DB | Data breach (tenant sees all data) | Switch to schema-per-tenant |
| Wildcard cert doesn't cover base domain | SSL error on yourdomain.com | Include both `*.yourdomain.com` and `yourdomain.com` |
| AsyncLocalStorage context lost in async fn | getTenantContext() throws error | Wrap callback with `tenantContext.run()` |
| Tenant extracted from URL only | Arbitrary tenant codes accepted | Validate against DB allowlist |
| Cookie with Domain=.yourdomain.com | Cross-tenant session access | Remove Domain attribute (host-only) |

---

## Implementation Path

### Phase 1: Immediate (1-2 days)
1. Add `tenant-detection.ts` with allowlist validation
2. Add `tenant-context.ts` with AsyncLocalStorage binding
3. Update `proxy.ts` to use context binding + allowlist
4. Update auth routes to use new cookie helpers

### Phase 2: Short-term (1 week)
1. Migrate to schema-per-tenant database pattern
2. Add per-tenant connection pooling with tier limits
3. Implement telemetry for per-tenant metrics

### Phase 3: Production (2 weeks)
1. DNS + wildcard SSL certificate setup
2. Reverse proxy configuration (nginx)
3. Security audit + penetration testing
4. Load testing with multi-tenant scenarios

---

## Deliverables

Two reports created in `/plans/reports/`:

1. **`researcher-multi-tenant-architecture-20260616.md`**
   - 6 detailed sections with trade-off analysis
   - Code examples for all three database patterns
   - Production DNS/SSL/proxy configuration
   - Risk matrix with mitigation strategies
   - 5 unresolved questions for clarification

2. **`implementation-guide-multi-tenant-nextjs.md`**
   - 10 production-ready code modules (copy-paste ready)
   - Integration checklist
   - Local testing instructions
   - Monitoring setup
   - All code validated against Next.js 16 patterns

---

## Critical Questions for Your Team

1. **Smart iMATE session scope** — Can users access multiple tenants with single session, or is each tenant isolated?
2. **Tenant scaling** — Expected to grow to 10 tenants? 100? 1000? (Affects pooling strategy)
3. **Compliance mandates** — Any HIPAA/SOC2/PCI-DSS requirements forcing database-per-tenant?
4. **User experience** — Can users log in separately for each tenant, or must sessions be cross-tenant?
5. **Custom domains** — Will customers ever use their own domain (app.their-company.com) instead of subdomains?

---

## Confidence Levels

| Area | Confidence | Sources |
|------|-----------|---------|
| Subdomain routing | 95% | Your code verified + Next.js docs |
| Cookie isolation | 90% | MDN spec + tested patterns |
| Schema-per-tenant pattern | 85% | Industry standard, but your schema structure TBD |
| AsyncLocalStorage binding | 95% | Node.js stable API + React 19 server components |
| Wildcard DNS/SSL | 90% | Standard deployment practice, cert details env-specific |
| Connection pooling | 80% | General principles, your MySQL version/config TBD |

---

## Next Steps

1. **Review** both reports with your team
2. **Clarify** the 5 critical questions above
3. **Decide** on database isolation pattern (recommend schema-per-tenant)
4. **Plan** Phase 1 implementation (1-2 days)
5. **Delegate** to implementation team or request detailed code walkthrough

---

**Files:**
- `/plans/reports/researcher-multi-tenant-architecture-20260616.md` — Strategic analysis
- `/plans/reports/implementation-guide-multi-tenant-nextjs.md` — Tactical code guide

**Status:** Ready for implementation

