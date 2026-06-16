---
phase: 5
title: "SSO Button Implementation (Bidirectional)"
status: pending
priority: P2
effort: "2h"
dependencies: ["phase-04-datamaster-oauth-client-integration-smart-imate"]
---

# Phase 5: SSO Button Implementation (Bidirectional)

## Overview

Each app shows "Login to [Other App]" button. Uses current session — no re-auth if session exists.

## Requirements

- Functional: DataMaster dashboard shows "Login to Smart iMATE" button
- Functional: Smart iMATE dashboard shows "Login to DataMaster" button
- Non-functional: Checks existing session, skips auth if valid

## Architecture

```
DataMaster Dashboard
  → "Login to Smart iMATE" button
  → POST /api/auth/sso-link { target: "smartimate", tenant: "tenantA" }
  → Checks existing Smart iMATE session cookie
  → If active: redirect to Smart iMATE dashboard directly
  → If not: redirect to Smart iMATE /oauth2/authorize (normal OAuth flow)
```

## Related Code Files

- Create: `src/app/api/auth/sso-link/route.ts` (DataMaster)
- Create: `src/components/sso-buttons.tsx` (DataMaster)
- Create: `htdocs/oauth/sso-link.php` (Smart iMATE)
- Modify: `src/app/dashboard/page.tsx` — add SSO button

## Implementation Steps

1. Create DataMaster SSO button component:
   - "Login to Smart iMATE" button on dashboard
   - On click: POST to `/api/auth/sso-link` with target tenant
   - Handle redirect response

2. Create `/api/auth/sso-link` route:
   - Check if user has active Smart iMATE session (via cookie or token validation)
   - If active: redirect to Smart iMATE dashboard with session token
   - If not: redirect to Smart iMATE authorize URL (normal OAuth flow)

3. Create Smart iMATE SSO link handler:
   - Accept POST from DataMaster
   - Check existing Cognito session
   - If active: generate auth code, redirect back
   - If not: redirect to login page

4. Handle reverse SSO (Smart iMATE → DataMaster) similarly

## Success Criteria

- [ ] SSO button visible on both dashboards
- [ ] Clicking button reuses existing session (no re-auth)
- [ ] Session expired → normal OAuth flow triggers
- [ ] Cross-origin cookie handling works correctly

## Risk Assessment

- **MEDIUM**: Cross-origin cookie sharing — browsers block third-party cookies. Use server-to-server session validation instead
- **LOW**: Session state sync delay — user logs out of one app, other app still shows active session for a few minutes

## Security Considerations

- Server-to-server session check (not client-side cookie read)
- State parameter prevents CSRF on SSO redirects
- Session timeout configurable per tenant

## Next Steps

- Phase 6: End-to-end testing
