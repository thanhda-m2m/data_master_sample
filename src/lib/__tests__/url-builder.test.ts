import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {buildTenantSubdomainUrl, extractBaseDomain, isLocalDev} from '../url-builder'

describe('url-builder', () => {
    let originalEnv: string | undefined

    beforeEach(() => {
        originalEnv = process.env.NEXT_PUBLIC_BASE_DOMAIN
    })

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = originalEnv
        } else {
            delete process.env.NEXT_PUBLIC_BASE_DOMAIN
        }
    })

    describe('buildTenantSubdomainUrl', () => {
        it('builds local dev subdomain URL with default port', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
            expect(buildTenantSubdomainUrl('takdemo', '/dashboard')).toBe(
                'http://takdemo.localhost:3000/dashboard'
            )
        })

        it('builds local dev subdomain URL with root path', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
            expect(buildTenantSubdomainUrl('kubota', '/')).toBe(
                'http://kubota.localhost:3000/'
            )
        })

        it('builds production subdomain URL', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'example.com'
            expect(buildTenantSubdomainUrl('kubota', '/dashboard')).toBe(
                'https://kubota.example.com/dashboard'
            )
        })

        it('normalizes path without leading slash', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
            expect(buildTenantSubdomainUrl('takdemo', 'dashboard')).toBe(
                'http://takdemo.localhost:3000/dashboard'
            )
        })

        it('uses default base domain when env var missing', () => {
            delete process.env.NEXT_PUBLIC_BASE_DOMAIN
            expect(buildTenantSubdomainUrl('takdemo', '/')).toBe(
                'http://takdemo.localhost:3000/'
            )
        })

        it('handles complex paths', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
            expect(buildTenantSubdomainUrl('takdemo', '/api/auth/callback?code=123')).toBe(
                'http://takdemo.localhost:3000/api/auth/callback?code=123'
            )
        })
    })

    describe('isLocalDev', () => {
        it('returns true for localhost', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'localhost:3000'
            expect(isLocalDev()).toBe(true)
        })

        it('returns false for production domain', () => {
            process.env.NEXT_PUBLIC_BASE_DOMAIN = 'example.com'
            expect(isLocalDev()).toBe(false)
        })

        it('returns false when env var missing (no default)', () => {
            delete process.env.NEXT_PUBLIC_BASE_DOMAIN
            expect(isLocalDev()).toBe(false)
        })
    })

    describe('extractBaseDomain', () => {
        it('extracts base domain from localhost subdomain', () => {
            expect(extractBaseDomain('takdemo.localhost:3000')).toBe('localhost:3000')
        })

        it('extracts base domain from production subdomain', () => {
            expect(extractBaseDomain('kubota.example.com')).toBe('example.com')
        })

        it('returns as-is for base localhost', () => {
            expect(extractBaseDomain('localhost:3000')).toBe('localhost:3000')
        })

        it('returns as-is for base production domain', () => {
            expect(extractBaseDomain('example.com')).toBe('example.com')
        })

        it('handles multi-level subdomains', () => {
            expect(extractBaseDomain('app.kubota.example.com')).toBe('example.com')
        })
    })
})
