import { describe, expect, it } from 'vitest'
import { detectTenant, extractSubdomainTenant, isLocalDevHost } from '../tenant-detection'

describe('tenant-detection', () => {
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
})
