import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {resolveRequestOrigin} from '../request-origin'

beforeEach(() => vi.stubEnv('DATAMASTER_CALLBACK_URL', ''))
afterEach(() => vi.unstubAllEnvs())

describe('callback origin', () => {
    it('uses the configured callback origin over incoming proxy headers', () => {
        vi.stubEnv('DATAMASTER_CALLBACK_URL', 'http://localhost:3000/api/auth/callback')
        expect(resolveRequestOrigin(new Headers({'x-forwarded-host': 'other.example', 'x-forwarded-proto': 'https'}), 'https://internal.example'))
            .toBe('http://localhost:3000')
    })

    it('does not force HTTPS when the forwarded request uses HTTP', () => {
        expect(resolveRequestOrigin(new Headers({'host': 'internal:3000', 'x-forwarded-host': 'datamaster.example.com', 'x-forwarded-proto': 'http'}), 'https://internal:3000'))
            .toBe('http://datamaster.example.com')
    })

    it('uses the first proxy host and protocol when no callback is configured', () => {
        expect(resolveRequestOrigin(new Headers({'x-forwarded-host': 'public.example.com, internal.local', 'x-forwarded-proto': 'https, http'}), 'http://internal:3000'))
            .toBe('https://public.example.com')
    })
})
