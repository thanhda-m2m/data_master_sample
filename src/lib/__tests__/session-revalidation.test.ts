import {describe, expect, it} from 'vitest'
import {doesSessionMatchTenant, isSessionRevalidationRequested, switchPendingCookieName} from '../session-revalidation'

describe('app-switch session selection', () => {
    it('requires a matching tenant session', () => {
        expect(doesSessionMatchTenant({tenant: 'thanhda'}, 'THANHDA')).toBe(true)
        expect(doesSessionMatchTenant({tenant: 'another'}, 'thanhda')).toBe(false)
        expect(doesSessionMatchTenant(null, 'thanhda')).toBe(false)
        expect(doesSessionMatchTenant({}, 'thanhda')).toBe(false)
    })

    it('distinguishes an explicit app switch from normal dashboard navigation', () => {
        expect(isSessionRevalidationRequested('1')).toBe(true)
        expect(isSessionRevalidationRequested('true')).toBe(true)
        expect(isSessionRevalidationRequested(undefined)).toBe(false)
        expect(isSessionRevalidationRequested('0')).toBe(false)
    })

    it('binds a failed switch to the requested tenant', () => {
        expect(switchPendingCookieName('THANHDA')).toBe('oauth_switch_pending_thanhda')
    })
})
