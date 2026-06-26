---
phase: 1
title: "Smart iMATE OAuthServer Class + Endpoint Fixes"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Smart iMATE OAuthServer Class + Endpoint Fixes

## Overview

Create missing `OAuthServer` class that current `/oauth/*` endpoints reference. Implement auth code JWT generation, token exchange, client validation, and consent screen logic.

## Requirements

- Functional: OAuthServer class with auth code JWT, token generation, client lookup
- Non-functional: No DB writes for tokens (stateless JWT), 10-min auth code expiry, PKCE support

## Architecture

```
OAuthServer
├── getClient($clientId) → lookup oauth_clients table
├── generateAuthCodeJwt(clientId, userId, tenantId, redirectUri, codeChallenge, scope) → signed JWT
├── validateAndConsumeAuthCodeJwt(authCode, clientId, clientSecret, redirectUri, codeVerifier) → claims
├── generateAccessTokenJwt(clientId, userId, tenantId, scopes) → signed JWT
├── generateRefreshTokenJwt(clientId, userId, tenantId, scopes) → signed JWT
├── generateIdToken(clientId, userId, tenantId, accessTokenJwt) → signed JWT
├── rotateRefreshTokenJwt(refreshToken, clientId, clientSecret) → {access, refresh, expires_in, scope}
└── validateAccessTokenJwt(accessToken) → claims (for /userinfo)
```

## Related Code Files

- Create: `lib/oauth/OAuthServer.php`
- Modify: `htdocs/oauth/oauth-authorization-endpoint.php` (already uses OAuthServer, needs no changes once class exists)
- Modify: `htdocs/oauth/oauth-token-endpoint.php` (same)
- Modify: `htdocs/oauth/oauth-userinfo-endpoint.php` (same)

## Implementation Steps

1. Create `lib/oauth/OAuthServer.php` with class OAuthServer
2. Implement constructor taking `TakeDbTest $db`
3. Implement `getClient($clientId)` — query `oauth_clients` table where `client_id = ?`
4. Implement `generateAuthCodeJwt()` — use Firebase JWT with RS256, 10-min expiry, claims: sub, client_id, tenant_id, redirect_uri, code_challenge, code_challenge_method, scope, iat, exp, jti
5. Implement `validateAndConsumeAuthCodeJwt()` — verify JWT signature, check expiry, validate client_id/client_secret match, validate redirect_uri exact match, validate PKCE code_verifier against stored code_challenge, mark as consumed (in-memory blacklist with TTL)
6. Implement `generateAccessTokenJwt()` — RS256, 1-hour expiry, claims: sub, client_id, tenant_id, scopes, iss, aud, iat, exp, jti
7. Implement `generateRefreshTokenJwt()` — RS256, 30-day expiry, claims: sub, client_id, tenant_id, scopes, iss, aud, iat, exp, jti
8. Implement `generateIdToken()` — RS256, 1-hour expiry, OIDC claims: sub, iss, aud, iat, exp, at_hash (access token hash)
9. Implement `rotateRefreshTokenJwt()` — validate refresh JWT, check not blacklisted, generate new access + refresh + id tokens, blacklist old refresh token
10. Implement `validateAccessTokenJwt()` — verify JWT signature, check expiry, check not blacklisted, return claims
11. Create auth code consumed blacklist (file-based JSON with TTL cleanup)

## Success Criteria

- [ ] `OAuthServer` class exists at `lib/oauth/OAuthServer.php`
- [ ] All three `/oauth/*` endpoints load without "class not found" error
- [ ] Auth code JWT validates correctly with PKCE code_verifier
- [ ] Token exchange returns access_token, refresh_token, id_token
- [ ] Refresh token rotation works (old token invalidated, new tokens issued)
- [ ] Access token validation rejects expired/blacklisted tokens

## Risk Assessment

- **HIGH**: JWT key management — need RSA key pair. Use existing `lib/jwt/keys/` directory or generate new ones
- **MEDIUM**: Auth code blacklist — file-based approach has race conditions under high concurrency. Acceptable for POC. Use `LOCK_EX` for atomic writes
- **LOW**: PKCE validation — must verify code_verifier matches stored code_challenge using SHA-256

## Security Considerations

- Auth codes are single-use — blacklist immediately after exchange
- Refresh token rotation — old refresh token invalidated on use
- All JWTs signed with RS256 — no symmetric key confusion
- Client secret validated during token exchange (not during authorization)
- PKCE enforced per-client configuration

## Next Steps

- Phase 2: Add /oauth2/validate and /oauth2/revoke endpoints
