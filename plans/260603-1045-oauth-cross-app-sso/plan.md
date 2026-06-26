---
title: "OAuth Cross-App SSO Implementation"
created: "2026-06-03"
scope: hz-tak (Smart iMATE) + data_master_sample (DataMaster)
status: completed
---

# OAuth Cross-App SSO Implementation Plan

## Architecture

Smart iMATE = OAuth Provider (backed by AWS Cognito)
DataMaster = OAuth Client (delegates all token ops to Smart iMATE)

Per-tenant Cognito User Pools. Bidirectional SSO via session cookies.

```
User → DataMaster (Next.js) → Smart iMATE (/oauth/*) → Cognito (UserPool per tenant)
```

## Current State

**Smart iMATE (PHP):**
- `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo` exist but reference `OAuthServer` class that **does not exist** — need to create it
- `CognitoClient.php` — OIDC token exchange with Cognito (works)
- `JWTValidator.php` — JWT validation against Cognito JWKS (works)
- `CognitoAuthService.php` — MFA/auth via AWS CLI (works)
- `oidc_callback.php` — Cognito callback handler, provisions users (works)
- `JwtManager.php`, `JwtMiddleware.php` — internal JWT session management (works)
- `login.php` — dual auth (traditional + Cognito) with MFA (works)

**DataMaster (Next.js):**
- `/api/auth/signin` — generates PKCE, redirects to Cognito directly (WRONG — should go through Smart iMATE)
- `/api/auth/callback` — exchanges code with Cognito directly (WRONG — should go through Smart iMATE)
- `/api/auth/session` — returns session info from JWT cookie (works)
- `resolveTenantConfig()` — queries DB for tenant Cognito config (works)
- `proxy.ts` — middleware checks session, redirects unauthenticated (works)

**Key Issues to Fix:**
1. Smart iMATE `/oauth/*` endpoints reference missing `OAuthServer` class
2. DataMaster calls Cognito directly instead of going through Smart iMATE
3. No token validation endpoint on Smart iMATE for DataMaster to delegate to
4. No tenant provisioning sync (Smart iMATE → DataMaster)
5. No SSO buttons on either app

## Phases

| Phase | Description | Effort |
|-------|-------------|--------|
| 1 | Smart iMATE OAuthServer class + endpoint fixes | 4h |
| 2 | Smart iMATE /oauth2/validate + /oauth2/revoke endpoints | 3h |
| 3 | Smart iMATE tenant provisioning webhook handler | 2h |
| 4 | DataMaster OAuth client integration (call Smart iMATE, not Cognito) | 3h |
| 5 | DataMaster SSO button + Smart iMATE SSO button | 2h |
| 6 | End-to-end testing with Chrome DevTools | 2h |

## Related Files

**Smart iMATE (create):**
- `lib/oauth/OAuthServer.php`
- `htdocs/oauth/oauth2-validate-endpoint.php`
- `htdocs/oauth/oauth2-revoke-endpoint.php`
- `htdocs/oauth/oauth2-token-refresh-endpoint.php`

**Smart iMATE (modify):**
- `htdocs/oauth/oauth-authorization-endpoint.php`
- `htdocs/oauth/oauth-token-endpoint.php`
- `htdocs/oauth/oauth-userinfo-endpoint.php`
- `htdocs/padmin/tagents.php` (tenant creation → trigger sync)

**DataMaster (modify):**
- `src/app/api/auth/signin/route.ts`
- `src/app/api/auth/callback/route.ts`
- `src/lib/auth.ts`
- `src/lib/tenant-resolver.ts`

**DataMaster (create):**
- `src/app/api/auth/sso-link/route.ts` (SSO button handler)
- `src/components/sso-buttons.tsx`

## Dependencies

- Phase 1 must complete before Phase 2
- Phase 4 depends on Phase 1 (Smart iMATE endpoints must exist)
- Phase 5 depends on Phase 4 (SSO buttons need working auth flow)
- Phase 6 depends on all above
