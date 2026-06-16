---
phase: 4
title: "DataMaster OAuth Client Integration with Smart iMATE"
status: pending
priority: P1
effort: "3h"
dependencies: ["phase-01-create-oauth-server-class"]
---

# Phase 4: DataMaster OAuth Client Integration with Smart iMATE

## Overview

DataMaster currently calls Cognito directly for auth. Must change to call Smart iMATE as OAuth provider. Smart iMATE handles Cognito interaction, returns tokens to DataMaster.

## Requirements

- Functional: `/api/auth/signin` redirects to Smart iMATE authorize endpoint (not Cognito)
- Functional: `/api/auth/callback` exchanges code with Smart iMATE token endpoint (not Cognito)
- Functional: Token validation delegated to Smart iMATE `/oauth2/validate`
- Non-functional: PKCE still used (DataMaster generates, Smart iMATE passes through to Cognito)

## Architecture

```
BEFORE: DataMaster → Cognito /oauth2/authorize
AFTER:  DataMaster → Smart iMATE /{tenant}/oauth2/authorize → Cognito (backend)

BEFORE: DataMaster → Cognito /oauth2/token
AFTER:  DataMaster → Smart iMATE /{tenant}/oauth2/token → Cognito (backend)
```

## Related Code Files

- Modify: `src/app/api/auth/signin/route.ts` — redirect to Smart iMATE authorize
- Modify: `src/app/api/auth/callback/route.ts` — exchange code with Smart iMATE token endpoint
- Modify: `src/lib/auth.ts` — add `validateTokenViaSmartiMate()` function
- Modify: `src/lib/tenant-resolver.ts` — add `smartimate_authorize_url`, `smartimate_token_url` to TenantConfig

## Implementation Steps

1. Modify `signin/route.ts`:
   - Resolve tenant config → get `smartimate_authorize_url` (e.g. `https://smartimate.com/{tenant}/oauth2/authorize`)
   - Generate PKCE code_verifier + code_challenge
   - Build Smart iMATE authorize URL with: client_id, response_type=code, redirect_uri, state, code_challenge, code_challenge_method, scope
   - Store state, code_verifier, tenant in httpOnly cookies (10-min expiry)
   - Redirect user to Smart iMATE authorize URL

2. Modify `callback/route.ts`:
   - Validate state matches cookie
   - Extract auth code from query params
   - POST to Smart iMATE token endpoint: `{ grant_type: "authorization_code", code, redirect_uri, client_id, client_secret }`
   - Smart iMATE returns `{ access_token, refresh_token, id_token, expires_in, user: { id, email, name, tenant } }`
   - Create session JWT with user info + tokens
   - Set session cookie, clear OAuth cookies
   - Redirect to dashboard

3. Add `validateTokenViaSmartiMate()` in `auth.ts`:
   - POST to Smart iMATE `/oauth2/validate` with access_token
   - Return user info or throw on 401

4. Update `TenantConfig` interface:
   - Add `smartimate_authorize_url: string`
   - Add `smartimate_token_url: string`
   - Add `smartimate_validate_url: string`
   - Add `client_secret: string`

## Success Criteria

- [ ] Sign-in flow redirects to Smart iMATE (not Cognito)
- [ ] Callback exchanges code with Smart iMATE token endpoint
- [ ] Session JWT contains user info from Smart iMATE response
- [ ] Token validation goes through Smart iMATE /oauth2/validate
- [ ] PKCE code_verifier/c challenge work end-to-end

## Risk Assessment

- **HIGH**: Smart iMATE token endpoint must handle Cognito interaction transparently — if it fails, DataMaster login breaks
- **MEDIUM**: Client secret storage in DataMaster — use environment variable, never commit to repo

## Security Considerations

- PKCE still required (code_challenge in authorize, code_verifier in token exchange)
- Client secret for server-to-server token exchange
- State parameter prevents CSRF
- Session cookie httpOnly, secure, sameSite=Lax

## Next Steps

- Phase 5: SSO button implementation
