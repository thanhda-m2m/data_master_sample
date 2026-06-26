---
phase: 3
title: "Smart iMATE Tenant Provisioning Sync to DataMaster"
status: pending
priority: P2
effort: "2h"
dependencies: ["phase-02-token-validation-revoke-endpoints"]
---

# Phase 3: Tenant Provisioning Sync to DataMaster

## Overview

When superadmin creates tenant in Smart iMATE, automatically sync tenant config to DataMaster so DataMaster knows about the new tenant and can resolve its Cognito configuration.

## Requirements

- Functional: Smart iMATE POSTs to DataMaster `/api/admin/tenants` on tenant creation
- Functional: DataMaster stores tenant config (userPoolId, clientId, region, loginId) in DB
- Non-functional: Idempotent — safe to call multiple times for same tenant

## Architecture

```
Smart iMATE Admin (tagents.php)
  → Save new tenant to bkmasters table
  → POST DataMaster /api/admin/tenants
     { login_id, userPoolId, cognito_app_client_id, cognito_region }
  → DataMaster stores in bkmasters (same schema)
  → DataMaster clears tenant cache
```

## Related Code Files

- Create: `htdocs/padmin/tenant-sync-webhook.php` (Smart iMATE side)
- Create: DataMaster `src/app/api/admin/tenants/route.ts` (receiver side)
- Modify: `htdocs/padmin/tagents.php` — call sync after tenant save
- Modify: `src/lib/tenant-resolver.ts` — use DB query, not hard-coded

## Implementation Steps

1. Create `tenant-sync-webhook.php`:
   - Accept POST with tenant data (login_id, userPoolId, clientId, region)
   - Require API key in `X-Webhook-Secret` header
   - POST to DataMaster endpoint
   - Log success/failure

2. Create DataMaster `/api/admin/tenants` route:
   - Accept POST: `{ login_id, userPoolId, clientId, region }`
   - Validate API key
   - Upsert into bkmasters (INSERT ... ON CONFLICT UPDATE)
   - Clear in-memory cache for this tenant
   - Return 200 or 409

3. Modify `tagents.php` saveData() call:
   - After successful tenant save, call webhook
   - Don't block on webhook failure (fire-and-forget with error log)

4. Update `tenant-resolver.ts` to query DB with proper parameterized queries

## Success Criteria

- [ ] New tenant in Smart iMATE → appears in DataMaster DB within 5 seconds
- [ ] Duplicate sync calls don't create duplicate records
- [ ] API key validation prevents unauthorized sync
- [ ] DataMaster tenant cache cleared on sync

## Risk Assessment

- **MEDIUM**: Webhook delivery failure — tenant exists in Smart iMATE but not DataMaster. Add retry queue or manual sync endpoint
- **LOW**: API key exposure — use environment variable, never hardcode

## Security Considerations

- X-Webhook-Secret header for authentication
- Validate all incoming data (login_id format, userPoolId ARN format)
- Rate limit sync endpoint (10 req/min)

## Next Steps

- Phase 4: DataMaster OAuth client integration
