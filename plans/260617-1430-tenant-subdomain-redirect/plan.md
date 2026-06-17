---
title: "Tenant Subdomain Redirect Architecture"
description: "Implement subdomain-based tenant routing after selection"
status: completed
priority: P2
branch: "refactor/ui"
tags: [multi-tenant, subdomain, routing, oauth]
blockedBy: []
blocks: []
created: "2026-06-17T01:10:16.109Z"
createdBy: "ck:plan"
source: skill
completedAt: "2026-06-17T15:30:00.000Z"
---

# Tenant Subdomain Redirect Architecture

## Overview

Implement subdomain-based redirect after tenant selection. Currently tenant list loads from database correctly, but after selection the OAuth flow stays on base domain. Need to redirect to `tenantCode.subdomain.domain` pattern and maintain tenant context through OAuth callback.

**Completed Flow:**
- User visits `localhost:3000` → sees tenant list from DB ✓
- Selects tenant → redirects to `tenant.localhost:3000` ✓
- OAuth flow on tenant subdomain ✓
- Callback → stays on `tenant.localhost:3000` ✓

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Base Domain Config](./phase-01-base-domain-config.md) | Completed |
| 2 | [Signin Subdomain Redirect](./phase-02-signin-subdomain-redirect.md) | Completed |
| 3 | [Callback Subdomain Redirect](./phase-03-callback-subdomain-redirect.md) | Completed |
| 4 | [Testing & Validation](./phase-04-testing-validation.md) | Completed |

## Deliverables

**Modified Files:**
1. `.env.local` - added NEXT_PUBLIC_BASE_DOMAIN
2. `src/lib/url-builder.ts` - tenant URL helpers (new)
3. `src/app/page.tsx` - form redirect to subdomain
4. `src/app/api/auth/signin/route.ts` - subdomain detection & redirect_uri
5. `src/app/api/auth/callback/route.ts` - subdomain detection & final redirect
6. `src/lib/__tests__/url-builder.test.ts` - unit tests (new)

**Test Results:**
- Build: ✓ Success
- Tests: ✓ 40/40 passing
- No errors or warnings

**Security Validation:**
- OAuth state JWT validation preserved
- PKCE flow maintained
- Tenant mismatch detection active
- Cookie domain scoping correct

## Completion Summary

All 4 phases completed successfully:
- Phase 1: Base domain config added with env var and helpers
- Phase 2: Signin flow redirects to tenant subdomain with proper redirect_uri
- Phase 3: Callback detects tenant from subdomain and maintains session context
- Phase 4: Unit tests passing, build successful, no regressions

Code review findings addressed:
- Removed dead code (isLocalDevHost, buildDataMasterOrigin)
- Added tenant format validation
- Fixed extractBaseDomain port handling
- Fixed test assertion mismatches
- Added cookie domain scope comments
