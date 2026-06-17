import { afterEach, describe, expect, it } from 'vitest'
import { detectTenant, extractSubdomainTenant, isLocalDevHost, resolveSigninTenant } from '../tenant-detection'

describe('tenant-detection', () => {
  const originalBaseDomain = process['env']['NEXT_PUBLIC_BASE_DOMAIN']

  afterEach(() => {
    if (originalBaseDomain) {
      process['env']['NEXT_PUBLIC_BASE_DOMAIN'] = originalBaseDomain
      return
    }

    delete process['env']['NEXT_PUBLIC_BASE_DOMAIN']
  })

  it('extracts tenant from localhost subdomains', () => {
    expect(extractSubdomainTenant('takdemo.localhost:3000')).toBe('takdemo')
  })

  it('extracts tenant from production-style subdomains', () => {
    expect(extractSubdomainTenant('tenant.example.com')).toBe('tenant')
  })

  it('returns null when there is no subdomain', () => {
    expect(extractSubdomainTenant('localhost:3000')).toBeNull()
    expect(extractSubdomainTenant('example.com')).toBeNull()
  })

  it('treats the configured base host as a single-host deployment', () => {
    process['env']['NEXT_PUBLIC_BASE_DOMAIN'] = 'hozen-tak-sso-login.tbtech.jp'

    expect(extractSubdomainTenant('hozen-tak-sso-login.tbtech.jp')).toBeNull()
    expect(detectTenant('hozen-tak-sso-login.tbtech.jp')).toEqual({
      tenantCode: null,
      source: 'none',
    })
  })

  it('still extracts tenant subdomains beneath a configured base host', () => {
    process['env']['NEXT_PUBLIC_BASE_DOMAIN'] = 'hozen-tak-sso-login.tbtech.jp'

    expect(extractSubdomainTenant('tenant.hozen-tak-sso-login.tbtech.jp')).toBe('tenant')
  })

  it('recognizes local development hosts', () => {
    expect(isLocalDevHost('localhost:3000')).toBe(true)
    expect(isLocalDevHost('127.0.0.1:3000')).toBe(true)
    expect(isLocalDevHost('tenant.localhost:3000')).toBe(true)
    expect(isLocalDevHost('tenant.example.com')).toBe(false)
  })

  it('prefers subdomain tenant over cookie tenant', () => {
    expect(detectTenant('takdemo.localhost:3000', 'fallback')).toEqual({
      tenantCode: 'takdemo',
      source: 'subdomain',
    })
  })

  it('falls back to cookie tenant when no subdomain exists', () => {
    expect(detectTenant('localhost:3000', 'takdemo')).toEqual({
      tenantCode: 'takdemo',
      source: 'cookie',
    })
  })

  it('returns none when neither hostname nor cookie supplies a tenant', () => {
    expect(detectTenant('localhost:3000')).toEqual({
      tenantCode: null,
      source: 'none',
    })
  })

  it('uses submitted tenant over stale cookie during sign in on base host', () => {
    expect(resolveSigninTenant('localhost:3000', 'tenantB', 'tenantA')).toEqual({
      tenantCode: 'tenantB',
      source: 'query',
    })
  })

  it('keeps subdomain tenant priority during sign in', () => {
    expect(resolveSigninTenant('tenantC.localhost:3000', 'tenantB', 'tenantA')).toEqual({
      tenantCode: 'tenantc',
      source: 'subdomain',
    })
  })
})
