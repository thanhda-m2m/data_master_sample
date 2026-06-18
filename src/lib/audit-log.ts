type AuditEvent =
    | 'tenant_select'
    | 'oauth_start'
    | 'oauth_complete'
    | 'validation_failure'
    | 'cache_invalidation'

type AuditDetails = {
    error?: string
    userId?: string
    userAgent?: string
    ip?: string
    source?: string
}

export function getRequestIp(headers: Headers): string {
    return (
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        'unknown'
    )
}

export function logAuditEvent(
    event: AuditEvent,
    tenant: string,
    headers: Headers,
    details: AuditDetails = {}
) {
    console.info(
        JSON.stringify({
            timestamp: new Date().toISOString(),
            event,
            tenant,
            ip: details.ip || getRequestIp(headers),
            userAgent: details.userAgent || headers.get('user-agent') || 'unknown',
            ...details,
        })
    )
}
