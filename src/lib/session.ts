import {jwtVerify, SignJWT} from 'jose'
import {authSecret} from './auth-secret'

export interface Session {
    user: {
        id: string
        email: string
        name: string
        phoneNumber?: string
    }
    tenant: string
    expiresAt: number
}

export async function signSession(session: Session): Promise<string> {
    return new SignJWT({
        email: session.user.email,
        name: session.user.name,
        phoneNumber: session.user.phoneNumber,
        tenant: session.tenant,
    })
        .setProtectedHeader({alg: 'HS256'})
        .setSubject(session.user.id)
        .setIssuer('datamaster')
        .setAudience('datamaster-session')
        .setIssuedAt()
        .setExpirationTime(session.expiresAt)
        .sign(authSecret())
}

export async function readSession(token: string | undefined): Promise<Session | null> {
    if (!token) return null
    try {
        const {payload} = await jwtVerify(token, authSecret(), {
            algorithms: ['HS256'],
            issuer: 'datamaster',
            audience: 'datamaster-session',
            requiredClaims: ['exp', 'sub', 'email', 'name', 'tenant'],
        })
        if (typeof payload.sub !== 'string' || !payload.sub
            || typeof payload.email !== 'string' || !payload.email
            || typeof payload.name !== 'string'
            || typeof payload.tenant !== 'string' || !/^[a-z0-9_-]{1,50}$/.test(payload.tenant)) return null
        return {
            user: {
                id: payload.sub,
                email: payload.email,
                name: payload.name,
                phoneNumber: typeof payload.phoneNumber === 'string' ? payload.phoneNumber : undefined,
            },
            tenant: payload.tenant,
            expiresAt: payload.exp!,
        }
    } catch {
        return null
    }
}
