import {cookies} from 'next/headers'
import {jwtVerify} from 'jose'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const sessionToken = cookieStore.get('session')?.value

        if (!sessionToken) {
            return Response.json({user: null}, {status: 401})
        }

        const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
        const {payload} = await jwtVerify(sessionToken, secret)

        return Response.json({
            user: {
                id: payload.sub,
                email: payload.email,
                name: payload.name,
            },
        })
    } catch (error) {
        console.error('Session error:', error)
        return Response.json({user: null}, {status: 401})
    }
}
