import {isSmartiMateTokenSource} from './auth-token-source'
import type {SmartiMateTokenSource} from './auth-token-source'

export type RevalidationSession = {
    tenant?: string
    accessToken?: string
    tokenSource?: SmartiMateTokenSource
    user?: {
        id?: string
        email?: string
    }
}

export type SessionRevalidationRequest = {
    tenant: string
    smartimateTokenUrl?: string
}

export type SmartiMateUserInfo = {
    sub?: string
    staff_id?: string
    email?: string
    tenant_id?: string
    tenant?: string
    token_source?: SmartiMateTokenSource
}

type Fetcher = typeof fetch

type UserInfoFetchResult = {
    valid: boolean
    user?: SmartiMateUserInfo
    reason?: string
}

function normalizeIdentity(value: unknown) {
    const raw = Array.isArray(value) ? value[0] : value

    if (raw === null || raw === undefined) {
        return ''
    }

    if (typeof raw === 'string') {
        return raw.trim().toLowerCase()
    }

    if (typeof raw === 'number' || typeof raw === 'boolean') {
        return String(raw).trim().toLowerCase()
    }

    return ''
}

export function doesSessionMatchTenant(session: RevalidationSession | null, tenant: string) {
    return Boolean(session && normalizeIdentity(session.tenant) === normalizeIdentity(tenant))
}

export function isSessionRevalidationRequested(value?: unknown) {
    const normalized = normalizeIdentity(value)
    return normalized === '1' || normalized === 'true'
}

export function smartiMateUserInfoUrlFromTokenUrl(tokenUrl: string, tenant: string) {
    const url = new URL(tokenUrl)
    url.pathname = `/${encodeURIComponent(tenant)}/oauth2/userinfo`
    return url.toString()
}

export async function fetchSmartiMateUserInfo(
    accessToken: string | undefined,
    tokenUrl: string | undefined,
    tenant: string,
    fetcher: Fetcher = fetch
): Promise<UserInfoFetchResult> {
    if (!accessToken || !tokenUrl) {
        return {valid: false, reason: 'missing_token_or_url'}
    }

    try {
        const response = await fetcher(smartiMateUserInfoUrlFromTokenUrl(tokenUrl, tenant), {
            method: 'GET',
            headers: {Authorization: `Bearer ${accessToken}`},
            cache: 'no-store',
        })

        if (!response.ok) {
            return {valid: false, reason: `userinfo_http_${response.status}`}
        }

        return {
            valid: true,
            user: await response.json() as SmartiMateUserInfo,
        }
    } catch (error) {
        return {
            valid: false,
            reason: error instanceof Error ? error.message : String(error),
        }
    }
}

export function doesUserInfoMatchSession(
    session: RevalidationSession,
    userInfo: SmartiMateUserInfo,
    request: SessionRevalidationRequest
) {
    const userInfoTenant = normalizeIdentity(userInfo.tenant_id || userInfo.tenant)
    if (!userInfoTenant || userInfoTenant !== normalizeIdentity(request.tenant)) {
        return false
    }

    const sessionEmail = normalizeIdentity(session.user?.email)
    const userInfoEmail = normalizeIdentity(userInfo.email)
    if (!sessionEmail || !userInfoEmail || sessionEmail !== userInfoEmail) {
        return false
    }

    const sessionUserId = normalizeIdentity(session.user?.id)
    const userInfoSub = normalizeIdentity(userInfo.sub || userInfo.staff_id)
    if (!sessionUserId || !userInfoSub || sessionUserId !== userInfoSub) {
        return false
    }

    return isSmartiMateTokenSource(userInfo.token_source)
        && session.tokenSource === userInfo.token_source
}

export async function revalidateSessionViaSmartiMateUserInfo(
    session: RevalidationSession | null,
    request: SessionRevalidationRequest,
    fetcher?: Fetcher
) {
    if (!session || !doesSessionMatchTenant(session, request.tenant)) {
        return false
    }

    const result = await fetchSmartiMateUserInfo(
        session.accessToken,
        request.smartimateTokenUrl,
        request.tenant,
        fetcher
    )

    return Boolean(result.valid && result.user && doesUserInfoMatchSession(session, result.user, request))
}
