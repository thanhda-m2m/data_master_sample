---
phase: 2
title: "Smart iMATE Token Validation and Revoke Endpoints"
status: pending
priority: P1
effort: "3h"
dependencies: ["phase-01-create-oauth-server-class"]
---

# Phase 2: Smart iMATE Token Validation and Revoke Endpoints

## Overview

Create `/oauth2/validate` and `/oauth2/revoke` endpoints. DataMaster delegates all token validation to Smart iMATE (source of truth). Enables future token revocation.

## Requirements

- Functional: POST /{tenant}/oauth2/validate — accepts access_token, returns user info or 401
- Functional: POST /{tenant}/oauth2/revoke — accepts access_token or refresh_token, revokes it
- Non-functional: Internal-call header validation, <50ms response time

## Architecture

```
DataMaster → POST Smart iMATE /{tenant}/oauth2/validate
              ↓
              Check X-Internal-Call header
              ↓
              Smart iMATE checks revocation blacklist
              ↓
              Smart iMATE validates JWT with Cognito JWKS (or local keys)
              ↓
              Returns: { valid: true, user: { id, email, name, tenant, roles } }
              OR: { valid: false, reason: "expired|revoked|invalid" }
```

## Related Code Files

- Create: `htdocs/oauth/oauth2-validate-endpoint.php`
- Create: `htdocs/oauth/oauth2-revoke-endpoint.php`
- Create: `htdocs/oauth/oauth2-token-refresh-endpoint.php`
- Modify: `lib/oauth/OAuthServer.php` — add `revokeToken()`, `validateTokenForClient()` methods

## Implementation Steps

1. Create `oauth2-validate-endpoint.php`:
   - Parse `{tenant}` from URL path
   - Require `X-Internal-Call: true` header
   - Accept POST body: `{ access_token: "..." }`
   - Check revocation blacklist (file-based, same as auth code blacklist)
   - Validate JWT signature + expiry
   - Query user info from Cognito id_token claims or DB
   - Return `{ valid: true, user: { id, email, name, tenant } }` or 401

2. Create `oauth2-revoke-endpoint.php`:
   - Parse `{tenant}` from URL path
   - Require `X-Internal-Call: true` header
   - Accept POST body: `{ access_token: "..." }` or `{ refresh_token: "..." }`
   - Add token jti to revocation blacklist
   - Return `{ revoked: true }`

3. Create `oauth2-token-refresh-endpoint.php`:
   - Parse `{tenant}` from URL path
   - Accept POST body: `{ grant_type: "refresh_token", refresh_token: "..." }`
   - Validate refresh JWT, check not revoked
   - Call Cognito `refreshToken()` if needed
   - Return new token set

4. Add `OAuthServer::revokeToken($token)` — adds jti to revocation blacklist file
5. Add `OAuthServer::validateTokenForClient($token)` — validates + returns user info for DataMaster

## Success Criteria

- [ ] POST /{tenant}/oauth2/validate returns user info for valid tokens
- [ ] POST /{tenant}/oauth2/validate returns 401 for expired/revoked tokens
- [ ] POST /{tenant}/oauth2/revoke successfully adds token to blacklist
- [ ] Revoked tokens fail validation immediately
- [ ] X-Internal-Call header required (reject without it)

## Risk Assessment

- **MEDIUM**: File-based revocation blacklist has race conditions under concurrent writes. Use `LOCK_EX` + atomic write pattern
- **LOW**: Internal-call header provides minimal security — sufficient for PrivateLink (internal network only)

## Security Considerations

- X-Internal-Call header prevents external abuse
- Revocation blacklist persists across requests (file-based)
- Token revocation applies to both access and refresh tokens
- Blacklist cleanup: remove expired entries on each write (TTL-based)

## Next Steps

- Phase 3: Tenant provisioning sync from Smart iMATE to DataMaster
