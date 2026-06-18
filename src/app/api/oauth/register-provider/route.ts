import {NextRequest, NextResponse} from 'next/server'
import {isTenantSyncAuthorized, syncTenantProvider} from '@/lib/tenant-sync'

export async function POST(request: NextRequest) {
    if (!isTenantSyncAuthorized(request.headers)) {
        return NextResponse.json(
            {error: 'Unauthorized', message: 'Invalid API key'},
            {status: 401}
        )
    }

    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json(
            {error: 'Bad request', message: 'Invalid JSON body'},
            {status: 400}
        )
    }

    try {
        return NextResponse.json(await syncTenantProvider(body), {status: 201})
    } catch (error) {
        console.error('Provider registration error:', error)
        if (error instanceof Error && /required|Invalid/.test(error.message)) {
            return NextResponse.json(
                {error: 'Bad request', message: error.message},
                {status: 400}
            )
        }

        return NextResponse.json(
            {error: 'Internal server error', message: 'Failed to register provider'},
            {status: 500}
        )
    }
}

export async function GET() {
    return NextResponse.json({error: 'Method not allowed'}, {status: 405})
}
