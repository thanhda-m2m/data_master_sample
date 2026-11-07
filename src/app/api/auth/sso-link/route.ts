import {NextRequest, NextResponse} from 'next/server'
import {getSession} from '@/lib/auth'

export async function POST(request: NextRequest) {
    const session = await getSession()
    if (!session) return NextResponse.json({error: 'Not authenticated'}, {status: 401})
    const body = await request.json() as {target?: string; tenant?: string}
    if (body.target !== 'smartimate' || body.tenant?.toLowerCase() !== session.tenant) {
        return NextResponse.json({error: 'Invalid app-switch target'}, {status: 400})
    }
    const baseUrl = process.env.SMARTIMATE_BASE_URL
    if (!baseUrl) return NextResponse.json({error: 'iMATE origin is not configured'}, {status: 503})
    const redirectUrl = new URL('/login', baseUrl)
    redirectUrl.searchParams.set('k', session.tenant)
    return NextResponse.json({redirectUrl: redirectUrl.toString()})
}
