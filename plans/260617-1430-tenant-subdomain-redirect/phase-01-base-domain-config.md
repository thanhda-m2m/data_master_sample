---
phase: 1
title: "Base Domain Config"
status: completed
priority: P2
effort: "1h"
dependencies: []
completedAt: "2026-06-17T15:30:00.000Z"
---

# Phase 1: Base Domain Config

## Overview

Add environment configuration for base domain pattern. Support both local dev (`*.localhost`) and production (`*.domain.com`) subdomain patterns.

## Requirements

**Functional:**
- Support local dev wildcard subdomains (*.localhost:3000)
- Support production wildcard subdomains (*.example.com)
- Provide helper to build tenant subdomain URLs

**Non-functional:**
- No breaking changes to existing env vars
- Backward compatible with origin-based flow

## Architecture

Add env var for base domain pattern:
- Dev: `NEXT_PUBLIC_BASE_DOMAIN=localhost:3000`
- Prod: `NEXT_PUBLIC_BASE_DOMAIN=example.com`

Helper builds subdomain URL:
```typescript
buildTenantUrl(tenant: string) → "http://tenant.localhost:3000"
```

## Related Code Files

**Modify:**
- `.env.local` — add NEXT_PUBLIC_BASE_DOMAIN
- `src/lib/tenant-types.ts` — add TenantSummary.subdom usage

**Create:**
- `src/lib/url-builder.ts` — tenant URL helpers

## Implementation Steps

1. Add to `.env.local`:
   ```
   NEXT_PUBLIC_BASE_DOMAIN=localhost:3000
   ```

2. Create `src/lib/url-builder.ts`:
   ```typescript
   export function buildTenantSubdomainUrl(
     tenant: string,
     path: string = '/'
   ): string {
     const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3000'
     const protocol = baseDomain.includes('localhost') ? 'http' : 'https'
     return `${protocol}://${tenant}.${baseDomain}${path}`
   }
   
   export function isLocalDev(): boolean {
     const baseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN || ''
     return baseDomain.includes('localhost')
   }
   ```

3. Verify existing `tenant-detection.ts` subdomain extraction works with pattern

## Success Criteria

- [x] NEXT_PUBLIC_BASE_DOMAIN env var added
- [x] url-builder.ts exports buildTenantSubdomainUrl
- [x] Local dev builds `http://tenant.localhost:3000`
- [x] Prod pattern builds `https://tenant.domain.com`
- [x] No breaking changes to existing flows

## Completion Notes

- Added NEXT_PUBLIC_BASE_DOMAIN to `.env.local`
- Created `src/lib/url-builder.ts` with complete helper functions
- Exported DEFAULT_BASE_DOMAIN constant
- Added tenant format validation to buildTenantSubdomainUrl
- Fixed extractBaseDomain to preserve port numbers
- Unit tests validate both dev and prod patterns

## Risk Assessment

**LOW** — Pure additive change, no logic modifications.
