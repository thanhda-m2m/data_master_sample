import {describe, expect, it} from 'vitest'
import {isSmartiMateTokenSource, SMARTIMATE_TOKEN_SOURCES} from '../auth-token-source'

describe('Smart iMATE token sources', () => {
    it('accepts cloud, isolated local, and impersonation sources', () => {
        expect(SMARTIMATE_TOKEN_SOURCES).toEqual([
            'cognito',
            'smartimate_local',
            'smartimate_impersonation',
        ])
        expect(isSmartiMateTokenSource('cognito')).toBe(true)
        expect(isSmartiMateTokenSource('smartimate_local')).toBe(true)
        expect(isSmartiMateTokenSource('smartimate_impersonation')).toBe(true)
    })

    it('rejects missing and unknown sources', () => {
        expect(isSmartiMateTokenSource(undefined)).toBe(false)
        expect(isSmartiMateTokenSource('smartimate')).toBe(false)
    })
})
