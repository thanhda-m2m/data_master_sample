export function isSessionRevalidationRequested(value: unknown): boolean {
    const flag = Array.isArray(value) ? value[0] : value
    return flag === 1 || (typeof flag === 'string' && ['1', 'true'].includes(flag.toLowerCase()))
}

export function doesSessionMatchTenant(session: {tenant?: string} | null, tenant: string): boolean {
    return Boolean(session?.tenant && session.tenant.toLowerCase() === tenant.toLowerCase())
}

export function switchPendingCookieName(tenant: string): string {
    return `oauth_switch_pending_${tenant.toLowerCase()}`
}
