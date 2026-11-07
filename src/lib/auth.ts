import {cookies} from 'next/headers'
import {readSession} from './session'
import type {Session} from './session'

export async function getSession(): Promise<Session | null> {
    const cookieStore = await cookies()
    return readSession(cookieStore.get('session')?.value)
}
