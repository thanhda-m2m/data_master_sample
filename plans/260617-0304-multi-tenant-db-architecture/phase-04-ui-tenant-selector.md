---
phase: 4
title: "UI Tenant Selector"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
completed_at: 2026-06-17
---

# Phase 4: UI Tenant Selector

## Overview

Replace single hardcoded tenant display with dynamic tenant dropdown populated from database. Update landing page to query all active tenants, display as selectable list with tenant names and IDs.

## Requirements

**Functional:**
- Landing page (`/`) queries `listTenantsFromDb()` from Phase 1
- Display tenant list with company name (`bcname` or `compname`) and tenant ID (`loginid`)
- Each tenant is clickable → redirects to `/api/auth/signin?tenant={loginId}`
- Sort tenants alphabetically by display name
- Show "No tenants available" if DB returns empty array

**Non-functional:**
- Page load <200ms (cached tenant list)
- Accessible: keyboard navigation, ARIA labels
- Mobile-friendly: responsive layout

## Architecture

**Current State (from page.tsx):**
```tsx
const tenants = await listTenants()  // Returns single hardcoded tenant

{tenants.map(tenant => (
  <a href={`/api/auth/signin?tenant=${tenant.loginId}`}>
    {tenant.bcname || tenant.compname}
  </a>
))}
```

**Target State:**
```tsx
const tenants = await listTenantsFromDb()  // Queries buscomps + bkmasters JOIN

// Same UI, but populated from DB
{tenants.length > 0 ? (
  tenants.map(tenant => ...)
) : (
  <p>No SSO-enabled tenants found</p>
)}
```

## Related Code Files

**Modify:**
- `src/app/page.tsx` (replace `listTenants()` with `listTenantsFromDb()`)

**Delete:**
- None

## Implementation Steps

1. **Update `src/app/page.tsx`:**
   - Line 2: Replace `import {listTenants} from '@/lib/env-config'`
   - Import `listTenantsFromDb` from `@/lib/tenant-resolver`
   - Line 12: `const tenants = await listTenantsFromDb()`
   - Keep existing UI structure (already supports array of tenants)
   - Sort tenants: `tenants.sort((a, b) => (a.bcname || a.compname).localeCompare(b.bcname || b.compname))`

2. **Update UI copy (optional):**
   - Red rectangle area in image → already shows tenant selector UI
   - Display name: `tenant.bcname || tenant.compname || `Tenant ${tenant.bkid}``
   - ID label: `ID: {tenant.loginId}`

3. **Add loading state (optional):**
   - Add Suspense boundary if tenant query is slow
   - Fallback: skeleton loader or spinner

4. **Error handling:**
   - If `listTenantsFromDb()` throws → catch and show error message
   - If tenants.length === 0 → show "No SSO-enabled tenants found"

5. **Test with multiple tenants:**
   - Query DB: `SELECT loginid, bcname FROM buscomps WHERE loginid IS NOT NULL`
   - Should show: TAK1125, takdemo (or others)
   - Click each tenant → should navigate to `/api/auth/signin?tenant={id}`

## Success Criteria

- [ ] Landing page displays all tenants from database
- [ ] Tenant list sorted alphabetically by name
- [ ] Click tenant → navigates to `/api/auth/signin?tenant={loginId}`
- [ ] Empty tenant list → shows "No tenants available" message
- [ ] DB error → shows error message (not blank page)
- [ ] Mobile responsive (tested on small screen)
- [ ] Keyboard navigable (tab through tenants)
- [ ] ARIA labels for screen readers

## Risk Assessment

**Risks:**
1. **Empty tenant list breaks UI** (LOW)
   - *Mitigation:* Show "No tenants" message, already handled in current code
2. **DB query slow on landing page** (LOW)
   - *Mitigation:* Cached tenant list (Phase 1), <10ms query
3. **Tenant names contain XSS** (LOW)
   - *Mitigation:* React escapes by default, no dangerouslySetInnerHTML used
