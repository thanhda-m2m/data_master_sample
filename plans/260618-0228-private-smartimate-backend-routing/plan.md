---
title: "Private Smart iMATE Backend Routing"
status: completed
priority: P1
created: "2026-06-18"
---

# Private Smart iMATE Backend Routing

## Scope

Route DataMaster server-to-server Smart iMATE calls through a private VPC address while preserving the public address for browser login redirects.

## Tasks

- [x] Add internal Smart iMATE base URL routing.
- [x] Preserve explicit token and validation endpoint overrides.
- [x] Add resolver coverage for public/private URL separation.
- [x] Run tests, scoped lint, TypeScript validation, and build.

## Success Criteria

- Browser authorization uses the public Smart iMATE base.
- Token exchange and validation use the internal Smart iMATE base.
- Existing deployments continue working when the internal variable is unset.

## Verification

- Unit tests: 46 passed.
- Scoped ESLint: passed.
- TypeScript: passed.
- Production build: blocked by existing Google font network/Turbopack resolution errors.
