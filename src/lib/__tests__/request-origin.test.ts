import {describe, expect, it} from 'vitest'
import {resolveRequestOrigin} from '../request-origin'

describe('resolveRequestOrigin', () => {
    it('uses forwarded host and proto from a reverse proxy', () => {
        const headers = new Headers({
            'host': 'localhost:3000',
            'x-forwarded-host': 'hozen-tak-sso-login.tbtech.jp',
            'x-forwarded-proto': 'http',
        })

        expect(resolveRequestOrigin(headers, 'http://localhost:3000')).toBe(
            'https://hozen-tak-sso-login.tbtech.jp'
        )
    })

    it('falls back to the request host when forwarded host is missing', () => {
        const headers = new Headers({
            'host': 'hozen-tak-sso-login.tbtech.jp',
        })

        expect(resolveRequestOrigin(headers, 'http://localhost:3000')).toBe(
            'https://hozen-tak-sso-login.tbtech.jp'
        )
    })

    it('uses the first forwarded value when proxies append multiple values', () => {
        const headers = new Headers({
            'host': 'localhost:3000',
            'x-forwarded-host': 'hozen-tak-sso-login.tbtech.jp, internal.local',
            'x-forwarded-proto': 'https, http',
        })

        expect(resolveRequestOrigin(headers, 'http://localhost:3000')).toBe(
            'https://hozen-tak-sso-login.tbtech.jp'
        )
    })
})
