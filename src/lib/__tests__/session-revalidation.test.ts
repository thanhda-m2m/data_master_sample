import {describe, expect, it} from 'vitest'
import {
    doesSessionMatchTenant,
    doesUserInfoMatchSession,
    fetchSmartiMateUserInfo,
    isSessionRevalidationRequested,
    revalidateSessionViaSmartiMateUserInfo,
    smartiMateUserInfoUrlFromTokenUrl,
} from '../session-revalidation'
import type {SmartiMateUserInfo} from '../session-revalidation'

describe('session-revalidation', () => {
    it('accepts explicit revalidation flags', () => {
        expect(isSessionRevalidationRequested('1')).toBe(true)
        expect(isSessionRevalidationRequested(['1'])).toBe(true)
        expect(isSessionRevalidationRequested(1)).toBe(true)
        expect(isSessionRevalidationRequested('true')).toBe(true)
        expect(isSessionRevalidationRequested('TRUE')).toBe(true)
        expect(isSessionRevalidationRequested('0')).toBe(false)
        expect(isSessionRevalidationRequested({value: '1'})).toBe(false)
        expect(isSessionRevalidationRequested(undefined)).toBe(false)
    })

    it('matches current DataMaster session tenant without case sensitivity', () => {
        expect(doesSessionMatchTenant(
            {tenant: 'takdemo', user: {email: 'user@example.com'}},
            'TAKDEMO'
        )).toBe(true)
    })

    it('builds tenant userinfo URL from Smart iMATE token URL', () => {
        expect(smartiMateUserInfoUrlFromTokenUrl(
            'https://smartimate.example.com/oauth2/token',
            'takdemo'
        )).toBe('https://smartimate.example.com/takdemo/oauth2/userinfo')
    })

    it('fetches Smart iMATE userinfo with bearer token', async () => {
        const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
            expect(String(input)).toBe('https://smartimate.example.com/takdemo/oauth2/userinfo')
            expect(init?.headers).toEqual({Authorization: 'Bearer session-token'})
            return Response.json({
                sub: 'cognito-user-id',
                email: 'user@example.com',
                tenant_id: 'takdemo',
                token_source: 'cognito',
            })
        }

        await expect(fetchSmartiMateUserInfo(
            'session-token',
            'https://smartimate.example.com/oauth2/token',
            'takdemo',
            fetcher
        )).resolves.toMatchObject({
            valid: true,
            user: {
                email: 'user@example.com',
                tenant_id: 'takdemo',
            },
        })
    })

    it('rejects Smart iMATE userinfo mismatch', () => {
        expect(doesUserInfoMatchSession(
            {tenant: 'takdemo', user: {email: 'user@example.com'}},
            {email: 'other@example.com', tenant_id: 'takdemo'},
            {tenant: 'takdemo'}
        )).toBe(false)
    })

    it.each([
        ['missing tenant', {sub: 'cognito-user-id', email: 'user@example.com', token_source: 'cognito'}],
        ['missing email', {sub: 'cognito-user-id', tenant_id: 'takdemo', token_source: 'cognito'}],
        ['missing id', {email: 'user@example.com', tenant_id: 'takdemo', token_source: 'cognito'}],
        ['unknown source', {sub: 'cognito-user-id', email: 'user@example.com', tenant_id: 'takdemo'}],
        ['different id', {sub: 'different-user-id', email: 'user@example.com', tenant_id: 'takdemo', token_source: 'cognito'}],
    ])('rejects %s from Smart iMATE userinfo', (_caseName, userInfo) => {
        expect(doesUserInfoMatchSession(
            {
                tenant: 'takdemo',
                user: {id: 'cognito-user-id', email: 'user@example.com'},
            },
            userInfo as SmartiMateUserInfo,
            {tenant: 'takdemo'}
        )).toBe(false)
    })

    it('revalidates matching session through Smart iMATE userinfo', async () => {
        const fetcher = async () => Response.json({
            email: 'user@example.com',
            sub: 'cognito-user-id',
            tenant_id: 'takdemo',
            token_source: 'cognito',
        })

        await expect(revalidateSessionViaSmartiMateUserInfo(
            {
                tenant: 'takdemo',
                accessToken: 'session-token',
                user: {id: 'cognito-user-id', email: 'user@example.com'},
            },
            {
                tenant: 'takdemo',
                smartimateTokenUrl: 'https://smartimate.example.com/oauth2/token',
            },
            fetcher
        )).resolves.toBe(true)
    })
})
