import {NextRequest, NextResponse} from 'next/server'
import {invalidateTenantCache} from '@/lib/tenant-resolver'
import {logAuditEvent} from '@/lib/audit-log'

export async function POST(request: NextRequest) {
    const apiKeyName = 'DATAMASTER_API_KEY'
    const apiKey = process.env[apiKeyName]
    const authHeader = request.headers.get('authorization')

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401})
    }

    let body: { tenant?: string } = {}

    try {
        body = await request.json()
    } catch {
        body = {}
    }

    invalidateTenantCache(body.tenant)
    logAuditEvent('cache_invalidation', body.tenant || 'all', request.headers)

    return NextResponse.json({success: true, tenant: body.tenant || null})
}
