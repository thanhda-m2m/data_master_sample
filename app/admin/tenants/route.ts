import {NextRequest, NextResponse} from 'next/server'
import {isTenantSyncAuthorized, syncTenantProvider} from '@/lib/tenant-sync'

const WEBHOOK_SECRET = process.env.SMARTIMATE_WEBHOOK_SECRET || ''

export async function POST(request: NextRequest) {
    // Validate webhook secret
    const secret = request.headers.get('x-webhook-secret') || ''
    if ((!WEBHOOK_SECRET || secret !== WEBHOOK_SECRET) && !isTenantSyncAuthorized(request.headers)) {
        return NextResponse.json(
            {error: 'Unauthorized', message: 'Invalid webhook secret'},
            {status: 401}
        )
    }

    // Parse and validate request body
    let body: Record<string, string | undefined>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            {error: 'Bad request', message: 'Invalid JSON body'},
            {status: 400}
        )
    }

    try {
        return NextResponse.json(await syncTenantProvider(body))
    } catch (error) {
        console.error('Tenant sync error:', error)
        if (error instanceof Error && /required|Invalid/.test(error.message)) {
            return NextResponse.json(
                {error: 'Bad request', message: error.message},
                {status: 400}
            )
        }

        return NextResponse.json(
            {error: 'Internal server error', message: 'Failed to sync tenant'},
            {status: 500}
        )
    }
}

export async function GET() {
    return NextResponse.json({error: 'Method not allowed'}, {status: 405})
}
