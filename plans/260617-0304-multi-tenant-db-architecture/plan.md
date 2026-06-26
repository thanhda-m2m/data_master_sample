---
title: "Multi-Tenant DB-Driven Architecture Refactor"
description: "Replace hardcoded tenant config with DB-driven multi-tenant architecture"
status: completed
priority: P1
effort: 12h
branch: "refactor/ui"
tags: [multi-tenant, database, oauth, security, architecture]
blockedBy: []
blocks: []
created: "2026-06-16T20:04:20.937Z"
createdBy: "ck:plan"
source: skill
---

# Multi-Tenant DB-Driven Architecture Refactor

## Overview

Migrate from single-tenant env-var config to multi-tenant DB-driven architecture. Replace hardcoded tenant credentials with dynamic lookups from `zaikodb.buscomps` + `zaikodb.bkmasters` tables. Implement subdomain-based tenant routing (tenantCode.domain), AsyncLocalStorage context propagation, and per-tenant OAuth credential resolution. Initial page becomes tenant selector → navigate to tenantCode.domain/dashboard.

**Key Changes:**
- Database-backed tenant registry + per-tenant OAuth credentials (JSON field)
- Subdomain routing + AsyncLocalStorage tenant context binding
- Dynamic OAuth config resolution with caching (10-min TTL)
- UI tenant selector replacing hardcoded login
- State parameter hardening + tenant validation in callback flow

**Research Foundation:**
- [MySQL JSON Config Resolution](/Users/thanh_da/Documents/projects/m2m/hz-tak/data_master_sample/plans/reports/researcher-mysql-json-config-resolution-20260616.md)
- [OAuth Multi-Tenant Security](/Users/thanh_da/Documents/projects/m2m/hz-tak/data_master_sample/plans/reports/researcher-oauth-multitenant-2026-06-16.md)
- [Multi-Tenant Architecture Patterns](/Users/thanh_da/Documents/projects/m2m/hz-tak/data_master_sample/plans/reports/researcher-multi-tenant-architecture-20260616.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Database Integration](./phase-01-database-integration.md) | Pending |
| 2 | [Tenant Detection & Routing](./phase-02-tenant-detection-routing.md) | Completed |
| 3 | [Dynamic OAuth Config](./phase-03-dynamic-oauth-config.md) | Completed |
| 4 | [UI Tenant Selector](./phase-04-ui-tenant-selector.md) | Completed |
| 5 | [Security Hardening](./phase-05-security-hardening.md) | Completed |
| 6 | [Testing & Validation](./phase-06-testing-validation.md) | Completed |

## Dependencies

**External:**
- MySQL 5.7+ (JSON_EXTRACT, JSON_UNQUOTE)
- Smart iMATE OAuth endpoint (existing)
- `zaikodb.buscomps` + `zaikodb.bkmasters` schema (existing)

**Phase Dependencies:**
- Phase 2 blocks Phase 3 (tenant detection before OAuth config)
- Phase 1 blocks Phase 3 (DB queries before OAuth config)
- Phase 3 blocks Phase 5 (OAuth config before security hardening)
- Phase 4 can run parallel to Phase 2-3 (UI independent)
- Phase 6 requires all phases complete (integration testing)

**Risk Summary:**
- **HIGH:** State parameter tenant confusion (mitigated in Phase 5)
- **MEDIUM:** Cache staleness during credential rotation (10-min TTL)
- **MEDIUM:** Smart iMATE tenant param support unknown (requires verification)
- **LOW:** Connection pool exhaustion (mitigated by caching)
